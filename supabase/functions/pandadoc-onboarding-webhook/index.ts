import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

interface PandaDocWebhookPayload {
  // Core identifiers
  document_id?: string;
  name?: string;
  status?: string;
  
  // Contact/Signer info
  recipients?: Array<{
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    company?: string;
    recipient_type?: string;
    role?: string;
  }>;
  
  // Metadata
  created_date?: string;
  date_completed?: string;
  date_modified?: string;
  
  // Payment info
  grand_total?: {
    amount?: number;
    currency?: string;
  };
  
  // Links
  shared_link?: string;
  
  // Created by
  created_by?: {
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  
  // Custom fields or tokens that might include company name
  tokens?: Array<{
    name?: string;
    value?: string;
  }>;
  
  metadata?: Record<string, unknown>;
  
  // Catch-all for any other fields
  [key: string]: unknown;
}

interface WebhookRequest {
  event?: string;
  data?: PandaDocWebhookPayload;
  // Direct payload (some webhooks send data at root level)
  document_id?: string;
  [key: string]: unknown;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const webhookSecret = Deno.env.get("PANDADOC_ONBOARDING_WEBHOOK_SECRET");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let requestPayload: WebhookRequest | null = null;
  let sourceKey: string | null = null;

  try {
    // Two ways in (18 Sep, Zapier cancelled):
    //  1. x-webhook-secret header — Zapier / manual replays (legacy).
    //  2. PandaDoc's own webhook: ?signature=<hex HMAC-SHA256(shared key, raw body)>
    //     with the shared key in PANDADOC_WEBHOOK_SHARED_KEY.
    const rawBody = await req.text();
    const providedSecret = req.headers.get("x-webhook-secret");
    const sharedKey = Deno.env.get("PANDADOC_WEBHOOK_SHARED_KEY");
    const signature = new URL(req.url).searchParams.get("signature");
    let signatureOk = false;
    if (sharedKey && signature) {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sharedKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
      const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
      signatureOk = hex === signature.toLowerCase();
    }
    const secretOk = !!webhookSecret && providedSecret === webhookSecret;

    if (!secretOk && !signatureOk) {
      console.error("Unauthorized - invalid webhook secret");
      
      // Log failed attempt (redact sensitive header values)
      await supabase.from("onboarding_webhook_audit_log").insert({
        source: "pandadoc",
        event_type: "document.paid",
        status: "error",
        message: "Unauthorized - invalid webhook secret",
        request_payload: { auth_attempted: !!providedSecret },
      });

      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body. PandaDoc posts an ARRAY of events:
    //   [{ event: "document_state_changed", data: { id, name, status: "document.paid", recipients, grand_total, date_completed, … } }]
    // Zapier used to flatten that; both shapes land in the same place here.
    let parsed: unknown = JSON.parse(rawBody);
    if (Array.isArray(parsed)) {
      const wanted = (parsed as Array<any>).find((e) =>
        e && typeof e === "object" && /^document\.(paid|completed)$/.test(String(e.data?.status || "")));
      const first = wanted ?? (parsed as Array<any>)[0] ?? {};
      parsed = { event: String(first?.data?.status || first?.event || "unknown"), data: first?.data ?? {} };
    } else if (parsed && typeof parsed === "object" && (parsed as any).event === "document_state_changed") {
      const d = (parsed as any).data ?? {};
      parsed = { ...(parsed as any), event: String(d.status || "unknown") };
    }
    requestPayload = parsed as WebhookRequest;
    console.log("Received PandaDoc onboarding webhook:", JSON.stringify(requestPayload, null, 2));

    // Extract payload - handle both nested and flat structures
    // (Use nullish coalescing so `data: {}` doesn't accidentally fall back to root.)
    const payload = (requestPayload.data ?? requestPayload) as PandaDocWebhookPayload;
    // 9 Oct: a payload with no event is "unknown" and gets ignored below. It
    // used to default to document.paid, which would have welcomed a client
    // off a malformed or hand-made POST.
    const eventType = requestPayload.event || "unknown";

    // Helper to normalize strings: treat "" and whitespace-only strings as null
    const norm = (v: unknown) => {
      if (typeof v === "string") {
        const t = v.trim();
        return t.length ? t : null;
      }
      return (v ?? null) as any;
    };

    // Extract identifiers from ALL locations (Zapier can flatten/rename keys)
    // PandaDoc's own webhook calls the document "id" (20 Sep, first live event).
    const documentId =
      norm((payload as any).id) ??
      norm((requestPayload as any).data?.id) ??
      norm((requestPayload as any).document_id) ??
      norm((requestPayload as any).data?.document_id) ??
      norm((payload as any).document_id) ??
      norm((payload as any).ID);

    const sharedLink =
      norm((requestPayload as any).shared_link) ??
      norm((requestPayload as any).data?.shared_link) ??
      norm((payload as any).shared_link) ??
      norm((payload as any)["Recipients Shared Link"]);

    const checkedLocations = {
      root: {
        document_id: norm((requestPayload as any).document_id),
        shared_link: norm((requestPayload as any).shared_link),
      },
      data: {
        document_id: norm((requestPayload as any).data?.document_id),
        shared_link: norm((requestPayload as any).data?.shared_link),
      },
      payload: {
        document_id: norm((payload as any).document_id),
        shared_link: norm((payload as any).shared_link),
      },
      zapier: {
        ID: norm((payload as any).ID),
        "Recipients Shared Link": norm((payload as any)["Recipients Shared Link"]),
      },
    };

    console.log("Identifier extraction:", { checkedLocations, final: { documentId, sharedLink } });

    // 9 Oct 2026 (the owner, after the 9 Oct onboarding call): a COMPLETED
    // agreement is signed, never paid. Payment is no longer collected in
    // PandaDoc — the agreements arrive with grand_total £0 — so the old
    // "completed with nothing to pay counts as paid" rule would have sent the
    // welcome email the moment a client signed, with nobody confirming money.
    // Now: completed → journey awaiting payment + CSM alert; the invoice goes
    // out from CEO → Invoices; a human marks it paid (which presses Confirm
    // paid) and only then does the welcome go out. Only a literal PandaDoc
    // "paid" event still auto-confirms.
    const amountDue = Number((payload as any).grand_total?.amount ?? 0) || 0;
    const paidEquivalent = /paid/i.test(eventType);
    const signedUnpaid = /completed/i.test(eventType) && !paidEquivalent;
    if (!paidEquivalent && !signedUnpaid) {
      await supabase.from("onboarding_webhook_audit_log").insert({
        source: "pandadoc", event_type: eventType, status: "success",
        message: `Ignored ${eventType}${/completed/i.test(eventType) ? ` (awaiting payment of ${amountDue})` : ""}, nothing to do`,
        request_payload: requestPayload,
      });
      return new Response(JSON.stringify({ success: true, ignored: eventType }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!documentId && !sharedLink) {
      await supabase.from("onboarding_webhook_audit_log").insert({
        source: "pandadoc",
        event_type: eventType,
        status: "error",
        message: "Missing both document_id and shared_link (checked root/data/payload/Zapier keys)",
        // Do not store header values; payload-only debug info is safe.
        request_payload: { ...requestPayload, identifier_debug: checkedLocations },
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing document_id and shared_link",
          checked: checkedLocations,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate stable source_key
    if (documentId) {
      sourceKey = `pandadoc_${documentId}`;
    } else if (sharedLink) {
      // Try to extract token from shared_link URL, fallback to hashing the full URL
      try {
        const url = new URL(sharedLink);
        const token = url.searchParams.get("token") || url.pathname.split("/").pop();
        sourceKey = `pandadoc_link_${token || sharedLink.replace(/[^a-zA-Z0-9]/g, "_")}`;
      } catch {
        // If URL parsing fails, use sanitized shared_link
        sourceKey = `pandadoc_link_${sharedLink.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 100)}`;
      }
    }

    // Extract signer/contact info from recipients OR root-level signer fields (Zapier compatibility)
    // Priority: recipient_type == "signer" OR role == "Client", fallback to first recipient
    const recipients = payload.recipients || [];
    const primaryRecipient = recipients.find(
      r => r.recipient_type === "signer" || r.role === "Client"
    ) || recipients[0];
    
    // Support root-level signer fields as fallback (Zapier may send these instead of recipients array)
    const rootPayload = requestPayload as Record<string, unknown>;
    const rootSignerFirstName = rootPayload.signer_first_name as string | null;
    const rootSignerLastName = rootPayload.signer_last_name as string | null;
    const rootSignerEmail = rootPayload.signer_email as string | null;
    const rootSignerPhone = rootPayload.signer_phone as string | null;
    const rootSignerCompany = rootPayload.signer_company as string | null;
    
    // Determine final signer info: prefer recipients array, fallback to root fields
    const signerName = primaryRecipient 
      ? [primaryRecipient.first_name, primaryRecipient.last_name].filter(Boolean).join(" ")
      : [rootSignerFirstName, rootSignerLastName].filter(Boolean).join(" ") || null;
    const signerEmail = primaryRecipient?.email || rootSignerEmail || null;
    const signerPhone = primaryRecipient?.phone || rootSignerPhone || null;
    // Tokens arrive as [{ "Client.Company": "…" }, …] when "tokens" is ticked on the webhook.
    const tokenList = Array.isArray((payload as any).tokens) ? (payload as any).tokens as Array<Record<string, unknown>> : [];
    const token = (name: string) => { for (const t of tokenList) { if (t && typeof t === "object" && name in t) return String((t as any)[name] ?? "").trim() || null; if ((t as any)?.name === name) return String((t as any).value ?? "").trim() || null; } return null; };
    const companyName = token("Client.Company") || primaryRecipient?.company || rootSignerCompany || payload.name || "Unknown Company";

    // Extract created_by info
    const createdByEmail = payload.created_by?.email || null;

    // Extract payment info
    const grandTotalAmount = payload.grand_total?.amount || null;
    const grandTotalCurrency = payload.grand_total?.currency || null;

    // Extract drive_folder_url from root or metadata
    const driveFolderUrl = (requestPayload as Record<string, unknown>).drive_folder_url as string | null
      || (payload.metadata?.drive_folder_url as string | null)
      || null;

    // Parse dates
    const pandadocCreatedAt = payload.created_date ? new Date(payload.created_date).toISOString() : null;
    const pandadocPaidAt = payload.date_completed ? new Date(payload.date_completed).toISOString() : null;

    // Check if record already exists
    const { data: existingRecord, error: lookupError } = await supabase
      .from("client_onboarding_stages")
      .select("id, client_profile_id")
      .eq("source_key", sourceKey)
      .maybeSingle();

    if (lookupError) {
      console.error("Error looking up existing record:", lookupError);
      throw lookupError;
    }

    let onboardingId: string;
    let isUpdate = false;
    // Hoisted (18 Sep) so the journey trigger below sees it on both branches.
    let clientProfileId: string | null = null;

    if (existingRecord) {
      // UPDATE existing record
      isUpdate = true;
      onboardingId = existingRecord.id;
      clientProfileId = (existingRecord as any).client_profile_id ?? null;

      const { error: updateError } = await supabase
        .from("client_onboarding_stages")
        .update({
          source_event: eventType,
          pandadoc_status: payload.status || "paid",
          pandadoc_created_at: pandadocCreatedAt,
          pandadoc_paid_at: pandadocPaidAt,
          pandadoc_shared_link: payload.shared_link || null,
          created_by_email: createdByEmail,
          grand_total_amount: grandTotalAmount,
          grand_total_currency: grandTotalCurrency,
          drive_folder_url: driveFolderUrl,
          signer_name: signerName,
          signer_email: signerEmail,
          company_name_raw: companyName,
          webhook_payload_raw: requestPayload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", onboardingId);

      if (updateError) {
        console.error("Error updating onboarding record:", updateError);
        throw updateError;
      }

      console.log("Updated existing onboarding record:", onboardingId);

    } else {
      // CREATE new record
      // First, try to find or create client_profile
      if (signerEmail) {
        // Try to find existing client profile by email
        // Case-insensitive (9 Oct): Daniel types emails by hand on the Clients
        // tab; "Pat@" vs "pat@" must not create a second profile.
        const { data: existingClient } = await supabase
          .from("client_profiles")
          .select("id")
          .ilike("email", signerEmail.replace(/[\\%_]/g, (c) => `\\${c}`))
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (existingClient) {
          clientProfileId = existingClient.id;
        } else {
          // Create new client profile
          const { data: newClient, error: clientError } = await supabase
            .from("client_profiles")
            .insert({
              company_name: companyName,
              contact_name: signerName,
              email: signerEmail,
              // 'onboarding' is not a client_profile_status value (the enum is
              // active/inactive/pending) — every new client used to 500 here.
              status: "pending",
            })
            .select("id")
            .single();

          if (clientError) {
            console.error("Error creating client profile:", clientError);
            throw clientError;
          }

          clientProfileId = newClient.id;
          console.log("Created new client profile:", clientProfileId);
        }
      } else {
        // No email - create client profile with just company name
        const { data: newClient, error: clientError } = await supabase
          .from("client_profiles")
          .insert({
            company_name: companyName,
            status: "pending",
          })
          .select("id")
          .single();

        if (clientError) {
          console.error("Error creating client profile:", clientError);
          throw clientError;
        }

        clientProfileId = newClient.id;
        console.log("Created new client profile (no email):", clientProfileId);
      }

      // Create onboarding record
      const { data: newOnboarding, error: insertError } = await supabase
        .from("client_onboarding_stages")
        .insert({
          client_profile_id: clientProfileId,
          current_stage: 1, // Stage 1 = "Post Signing Agreement" (the "new/not started" stage)
          source: "pandadoc",
          source_event: eventType,
          source_key: sourceKey,
          pandadoc_status: payload.status || "paid",
          pandadoc_created_at: pandadocCreatedAt,
          pandadoc_paid_at: pandadocPaidAt,
          pandadoc_shared_link: payload.shared_link || null,
          created_by_email: createdByEmail,
          grand_total_amount: grandTotalAmount,
          grand_total_currency: grandTotalCurrency,
          drive_folder_url: driveFolderUrl,
          signer_name: signerName,
          signer_email: signerEmail,
          company_name_raw: companyName,
          webhook_payload_raw: requestPayload,
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Error creating onboarding record:", insertError);
        throw insertError;
      }

      onboardingId = newOnboarding.id;
      console.log("Created new onboarding record:", onboardingId);

      // Generate onboarding tasks for this client
      const { generateAllTasksForClient } = await import("./taskGenerator.ts");
      const allTasks = generateAllTasksForClient();
      
      const taskRecords = allTasks.map((task: { stage: number; task_key: string; task_label: string }) => ({
        client_onboarding_id: onboardingId,
        stage: task.stage,
        task_key: task.task_key,
        task_label: task.task_label,
        is_completed: false,
      }));

      const { error: tasksError } = await supabase
        .from("client_onboarding_tasks")
        .insert(taskRecords);

      if (tasksError) {
        console.error("Error creating onboarding tasks:", tasksError);
        // Don't throw - record was created, just log the error
      } else {
        console.log("Created", taskRecords.length, "onboarding tasks");
      }
    }

    // 18 Sep: paid → the client journey starts and the welcome email goes
    // out (from Daniel, via Resend) with no human in the loop. This is what
    // the "Agreement paid → onboarding" Zap was for.
    let journeyNote = "";
    // 20 Sep (the owner): the whole paid → onboarding → welcome chain sits behind
    // a switch in Dev Centre → Integrations. Off = we record the event and stop.
    const { data: sysSettings } = await supabase.from("system_settings").select("pandadoc_paid_automation").limit(1).maybeSingle();
    const automationOn = sysSettings?.pandadoc_paid_automation === true;
    if ((paidEquivalent || signedUnpaid) && clientProfileId && !automationOn) {
      journeyNote = " · automation switched off in Dev Centre, no onboarding started, no welcome sent";
    }
    if ((paidEquivalent || signedUnpaid) && clientProfileId && automationOn) {
      const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") || webhookSecret;
      const adminUrl = `${supabaseUrl}/functions/v1/client-onboarding-admin`;
      const callAdmin = async (action: string, extra: Record<string, unknown> = {}) => {
        const res = await fetch(adminUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            "x-internal-secret": internalSecret || "",
          },
          body: JSON.stringify({ action, client_profile_id: clientProfileId, ...extra }),
        });
        const j = await res.json().catch(() => ({}));
        return { status: res.status, body: j };
      };
      try {
        const { data: journey } = await supabase
          .from("client_onboarding_journeys").select("id, status").eq("client_profile_id", clientProfileId).maybeSingle();
        if (!journey) {
          const s = await callAdmin("start_onboarding", { source: "pandadoc", signer_name: signerName, signer_email: signerEmail });
          journeyNote += ` · start_onboarding ${s.status}`;
        }
        const { data: j2 } = await supabase
          .from("client_onboarding_journeys").select("id, status").eq("client_profile_id", clientProfileId).maybeSingle();
        if (j2?.status === "awaiting_payment" && signedUnpaid && !paidEquivalent) {
          journeyNote += ` · signed${amountDue > 0 ? `, £${amountDue} still to pay` : ""}: welcome waits for the invoice to be marked paid (CEO → Invoices) or Confirm paid`;
        } else if (j2?.status === "awaiting_payment") {
          const c = await callAdmin("confirm_paid");
          journeyNote += ` · confirm_paid ${c.status}${c.body?.invite_sent ? " welcome sent" : c.body?.error ? ` (${c.body.error})` : ""}`;
        } else if (j2) {
          journeyNote += ` · journey already ${j2.status}`;
        }
      } catch (e) {
        journeyNote += ` · journey step failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    // Log success
    await supabase.from("onboarding_webhook_audit_log").insert({
      source_key: sourceKey,
      source: "pandadoc",
      event_type: eventType,
      status: "success",
      message: (isUpdate ? "Updated existing onboarding record" : "Created new onboarding record") + journeyNote,
      request_payload: requestPayload,
      response_payload: { onboarding_id: onboardingId },
      onboarding_id: onboardingId,
    });

    return new Response(
      JSON.stringify({ success: true, onboarding_id: onboardingId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Webhook processing error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log failure
    await supabase.from("onboarding_webhook_audit_log").insert({
      source_key: sourceKey,
      source: "pandadoc",
      event_type: "document.paid",
      status: "error",
      message: errorMessage,
      request_payload: requestPayload,
    });

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
