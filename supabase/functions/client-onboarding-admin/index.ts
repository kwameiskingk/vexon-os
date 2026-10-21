// STAFF engine for the client onboarding flow (dev/admin/ops/csm).
//
// The trigger chain (the owner's 26-Aug ruling): contract SIGNED starts the
// journey and loudly alerts the CSM; a human presses CONFIRM PAID and only
// then does the client's welcome email go out and the journey open.
//
// Actions:
//   overview            → all journeys + progress (test rows flagged)
//   journey_detail      → { client_profile_id } full tasks/answers/files/unlocks
//   start_onboarding    → { client_profile_id, source?, signer_name?, signer_email? }
//                         seeds the journey snapshot + signed alert (bell + email)
//   confirm_paid        → provisions the login (secure random password — the
//                         old shared client123 path is dead) + welcome email
//   resend_welcome      → fresh set-password link + welcome email
//   override_stage      → { client_profile_id, stage_key, note? } CSM unlock
//   waive_step          → { client_profile_id, step_key, note? }
//   reopen_step         → { client_profile_id, step_key } CSM puts a finished
//                         card back in front of the client (answers kept)
//   mark_live           → completes the journey, promotes the client to active,
//                         celebrates to the client (bell + email)
//   create_test_client  → dev/admin: fake client + journey for end-to-end demos
//                         (is_test_account — excluded from CEO aggregates)
//   delete_test_client  → full cleanup incl. auth user + any demo bookings

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { toJourneyQuestions, type FormSchema } from "../_shared/form-logic.ts";
import { sendResendEmail, sendTwilioSms, normalizeMobile, cancelBooking } from "../_shared/booking-flow.ts";
import {
  ONBOARDING_STAFF_ROLES,
  computeStages,
  progressPct,
  readyForLive,
  type JourneyTaskRow,
} from "../_shared/client-journey.ts";
import {
  clientWelcomeEmailHtml,
  clientWelcomeEmailText,
  contractSignedCsmEmailHtml,
  campaignLiveEmailHtml,
} from "../_shared/client-onboarding-emails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://vexon-os.example";

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "Rd" + btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 22) + "9!";
}

async function findUserByEmail(svc: any, email: string): Promise<{ id: string } | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = (data?.users || []).find((u: any) => (u.email || "").toLowerCase() === target);
    if (hit) return { id: hit.id };
    if (!data?.users || data.users.length < 1000) break;
  }
  return null;
}

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } }
    );
    // 18 Sep (Zapier cancelled): the PandaDoc webhook calls this function
    // server-to-server to start a journey and confirm payment the moment a
    // document is paid. It authenticates with the shared internal secret
    // and may only run those two actions; everything else still needs a
    // signed-in staff member.
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") || Deno.env.get("PANDADOC_ONBOARDING_WEBHOOK_SECRET");
    const internalCall = !!internalSecret && req.headers.get("x-internal-secret") === internalSecret;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    const { data: { user } } = internalCall ? { data: { user: null as any } } : await anon.auth.getUser();
    if (!user && !internalCall) return json({ error: "Not signed in" }, 401);
    if (internalCall && !["start_onboarding", "confirm_paid"].includes(action)) {
      return json({ error: "Internal calls may only start or confirm onboarding" }, 403);
    }
    const { data: roleRows } = user ? await svc.from("user_roles").select("role").eq("user_id", user.id) : { data: [] };
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    if (!internalCall && !roles.some((r) => ONBOARDING_STAFF_ROLES.includes(r))) {
      return json({ error: "Access denied" }, 403);
    }
    const isDevAdmin = roles.includes("dev") || roles.includes("admin");
    // 9 Oct: client-invoices confirms payment through the internal door on
    // behalf of a signed-in person; record them, not "nobody".
    const actorId: string | null = user?.id ?? (internalCall && typeof body.actor_id === "string" && body.actor_id ? body.actor_id : null);

    const loadJourney = async (clientProfileId: string) => {
      const { data } = await svc
        .from("client_onboarding_journeys")
        .select("*")
        .eq("client_profile_id", clientProfileId)
        .maybeSingle();
      return data;
    };
    const loadTasks = async (journeyId: string): Promise<JourneyTaskRow[]> => {
      const { data } = await svc
        .from("client_journey_tasks")
        .select("*")
        .eq("journey_id", journeyId)
        .order("stage_order")
        .order("sort_order");
      return (data || []) as JourneyTaskRow[];
    };
    const loadUnlocks = async (journeyId: string) => {
      const { data } = await svc
        .from("client_journey_stage_unlocks")
        .select("stage_key, note, unlocked_by, created_at")
        .eq("journey_id", journeyId);
      return data || [];
    };
    const stagesFor = async (journey: any) => {
      const tasks = await loadTasks(journey.id);
      const unlocks = await loadUnlocks(journey.id);
      return computeStages(journey, tasks, new Set(unlocks.map((u: any) => u.stage_key)));
    };

    // ── overview ───────────────────────────────────────────────────────────
    if (action === "overview") {
      const { data: journeys } = await svc
        .from("client_onboarding_journeys")
        .select("*, client_profiles!inner(company_name, contact_name, email, is_test_account)")
        .order("created_at", { ascending: false });
      const rows = [];
      for (const j of journeys || []) {
        const stages = await stagesFor(j);
        rows.push({
          client_profile_id: j.client_profile_id,
          company_name: (j as any).client_profiles?.company_name,
          contact_name: (j as any).client_profiles?.contact_name,
          email: (j as any).client_profiles?.email,
          is_test: j.is_test || (j as any).client_profiles?.is_test_account,
          status: j.status,
          source: j.source,
          contract_signed_at: j.contract_signed_at,
          payment_confirmed_at: j.payment_confirmed_at,
          welcome_email_sent_at: j.welcome_email_sent_at,
          first_signed_in_at: j.first_signed_in_at,
          campaign_live_at: j.campaign_live_at,
          created_at: j.created_at,
          progress_pct: progressPct(stages),
          active_stage: stages.find((s) => s.state === "active")?.title ?? null,
          ready_for_live: readyForLive(stages),
        });
      }
      return json({ journeys: rows });
    }

    // ── journey_detail ─────────────────────────────────────────────────────
    if (action === "journey_detail") {
      const clientProfileId = String(body.client_profile_id || "");
      const journey = await loadJourney(clientProfileId);
      if (!journey) return json({ journey: null });
      const tasks = await loadTasks(journey.id);
      const unlocks = await loadUnlocks(journey.id);
      const stages = computeStages(journey, tasks, new Set(unlocks.map((u: any) => u.stage_key)));
      // Signed URLs for anything the client uploaded (pitch deck etc.)
      const files: Record<string, string> = {};
      // 3 Sep: yes/no and upload cards can carry several files (answers.file_paths)
      const filesMulti: Record<string, { path: string; url: string }[]> = {};
      for (const t of tasks) {
        const paths: string[] = Array.isArray((t.answers as any)?.file_paths)
          ? ((t.answers as any).file_paths as unknown[]).map((x) => String(x))
          : t.file_path ? [t.file_path] : [];
        for (const fp of paths) {
          const { data: signed } = await svc.storage
            .from("client-onboarding-assets")
            .createSignedUrl(fp, 3600);
          if (!signed?.signedUrl) continue;
          if (!files[t.step_key]) files[t.step_key] = signed.signedUrl;
          (filesMulti[t.step_key] ??= []).push({ path: fp, url: signed.signedUrl });
        }
      }
      const { data: conn } = await svc
        .from("calendar_connections")
        .select("status, calendar_email, invited_at, connected_at, last_error")
        .eq("client_profile_id", clientProfileId)
        .maybeSingle();
      let campaign = null;
      if (journey.campaign_id) {
        const { data: c } = await svc
          .from("campaigns")
          .select("id, name, status, start_date, end_date")
          .eq("id", journey.campaign_id)
          .maybeSingle();
        campaign = c ?? null;
      }
      return json({
        journey,
        stages,
        unlocks,
        files,
        files_multi: filesMulti,
        campaign,
        progress_pct: progressPct(stages),
        ready_for_live: readyForLive(stages),
        calendar_connection: conn ?? null,
      });
    }

    // ── start_onboarding ───────────────────────────────────────────────────
    const seedJourney = async (clientProfileId: string, opts: {
      source: string; isTest?: boolean; signerName?: string; signerEmail?: string;
    }): Promise<{ error: Response } | { journey: any; client: any }> => {
      const existing = await loadJourney(clientProfileId);
      if (existing) return { error: json({ error: "This client already has an onboarding journey" }, 409) };

      const { data: client } = await svc
        .from("client_profiles")
        .select("id, company_name, email")
        .eq("id", clientProfileId)
        .single();
      if (!client) return { error: json({ error: "Client profile not found" }, 404) };

      const { data: journey, error: jErr } = await svc
        .from("client_onboarding_journeys")
        .insert({
          client_profile_id: clientProfileId,
          status: "awaiting_payment",
          source: opts.source,
          contract_signed_at: new Date().toISOString(),
          is_test: opts.isTest === true,
        })
        .select("*")
        .single();
      if (jErr) return { error: json({ error: jErr.message }, 500) };

      // Snapshot the authored flow (enabled stages/steps only)
      const { data: stages } = await svc
        .from("client_flow_stages")
        .select("*, client_flow_steps(*)")
        .eq("enabled", true)
        .order("sort_order");
      const rows: Record<string, unknown>[] = [];
      for (const s of stages || []) {
        const steps = ((s as any).client_flow_steps || [])
          .filter((st: any) => st.enabled)
          .sort((a: any, b: any) => a.sort_order - b.sort_order);
        for (const st of steps) {
          // 20 Sep: a form step authored in Enquire — snapshot its live questions
          // so the Documents tab, the CSM sheet and validation see the same list.
          let config = st.config ?? {};
          if (st.step_type === "form" && typeof config.enquire_slug === "string") {
            const { data: form } = await svc.from("forms").select("published_schema").eq("slug", config.enquire_slug).eq("status", "live").maybeSingle();
            if (form?.published_schema) {
              const conv = toJourneyQuestions(form.published_schema as FormSchema);
              config = { ...config, questions: conv.questions, sections: conv.sections };
            }
          }
          rows.push({
            journey_id: journey.id,
            stage_key: s.stage_key,
            stage_title: s.title,
            stage_subtitle: s.subtitle,
            stage_order: s.sort_order,
            step_key: st.step_key,
            label: st.label,
            description: st.description,
            step_type: st.step_type,
            config,
            video_url: st.video_url,
            document_path: st.document_path,
            link_url: st.link_url,
            sort_order: st.sort_order,
          });
        }
      }
      if (rows.length > 0) {
        const { error: tErr } = await svc.from("client_journey_tasks").insert(rows);
        if (tErr) {
          await svc.from("client_onboarding_journeys").delete().eq("id", journey.id);
          return { error: json({ error: `Could not seed the journey: ${tErr.message}` }, 500) };
        }
      }

      // The prominent "signed — confirm payment" alert. Bell always; email to
      // every CSM unless it's a test run.
      await svc.from("notifications").insert({
        recipient_id: null,
        recipient_role: "csm",
        title: "📝 Contract signed — confirm payment",
        message: `${client.company_name} signed their agreement. Confirm payment to send their welcome email and open onboarding.`,
        category: "system",
        link_url: "/csm/onboarding",
      });
      if (opts.isTest !== true) {
        const { data: csms } = await svc
          .from("user_roles")
          .select("user_id, profiles!inner(email)")
          .eq("role", "csm");
        for (const c of csms || []) {
          const em = (c as any).profiles?.email;
          if (em) {
            await sendResendEmail(
              em,
              `Contract signed: ${client.company_name} — confirm payment`,
              contractSignedCsmEmailHtml({
                companyName: client.company_name,
                signerName: opts.signerName ?? null,
                signerEmail: opts.signerEmail ?? null,
                source: opts.source,
              })
            );
          }
        }
      }
      return { journey, client };
    };

    if (action === "start_onboarding") {
      const clientProfileId = String(body.client_profile_id || "");
      if (!clientProfileId) return json({ error: "client_profile_id is required" }, 400);
      const res = await seedJourney(clientProfileId, {
        source: typeof body.source === "string" ? body.source : "manual",
        signerName: body.signer_name,
        signerEmail: body.signer_email,
      });
      if ("error" in res) return res.error;
      return json({ started: true, journey_id: (res as any).journey.id });
    }

    // ── confirm_paid / resend_welcome (provision + welcome email) ──────────
    const provisionAndInvite = async (clientProfileId: string): Promise<
      { error: Response } | { userId: string; client: any; inviteSent: boolean; smsSent: boolean }
    > => {
      const { data: client } = await svc
        .from("client_profiles")
        .select("id, company_name, contact_name, email, phone")
        .eq("id", clientProfileId)
        .single();
      if (!client?.email) return { error: json({ error: "The client profile has no email" }, 422) };

      let userId: string;
      const existing = await findUserByEmail(svc, client.email);
      if (existing) {
        userId = existing.id;
      } else {
        // Secure provisioning: random throwaway password, never surfaced —
        // the set-password link in the welcome email is the real credential.
        const { data: created, error: cErr } = await svc.auth.admin.createUser({
          email: client.email,
          password: randomPassword(),
          email_confirm: true,
          user_metadata: { full_name: client.contact_name || client.email.split("@")[0] },
        });
        if (cErr || !created?.user) return { error: json({ error: `Account creation failed: ${cErr?.message}` }, 500) };
        userId = created.user.id;
      }

      // ORDER MATTERS (same bug create-client-account fixed in #208): the
      // user_roles trigger handle_client_role_assignment mints a placeholder
      // "Unspecified" client profile for any new client-role user that has no
      // client_profile_users link yet. Link to THIS profile first, then grant
      // the role, and the trigger leaves it alone.
      const { data: linkRow } = await svc
        .from("client_profile_users")
        .select("id").eq("user_id", userId).eq("client_profile_id", clientProfileId).maybeSingle();
      if (!linkRow) {
        await svc.from("client_profile_users").insert({
          client_profile_id: clientProfileId, user_id: userId, role: "client_user",
        });
      }
      const { data: roleRow } = await svc
        .from("user_roles").select("id").eq("user_id", userId).eq("role", "client").maybeSingle();
      if (!roleRow) await svc.from("user_roles").insert({ user_id: userId, role: "client" });

      const { data: linkData, error: linkError } = await svc.auth.admin.generateLink({
        type: "recovery",
        email: client.email,
      });
      if (linkError || !linkData?.properties?.hashed_token) {
        return { error: json({ error: "Couldn't generate the set-password link" }, 422) };
      }
      const inviteUrl =
        `${APP_ORIGIN}/welcome#token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
        `&email=${encodeURIComponent(client.email)}`;
      // Marcus, 18 Sep: the welcome comes from Daniel (CSM), not the
      // bookings mailbox. send.meridiansales.example is the verified Resend domain;
      // replies go to his real inbox.
      const send = await sendResendEmail(
        client.email,
        "Welcome to Meridian: Your Onboarding Awaits",
        clientWelcomeEmailHtml({
          contactName: client.contact_name || "",
          companyName: client.company_name || "your company",
          loginEmail: client.email,
          inviteUrl,
        }),
        clientWelcomeEmailText({
          contactName: client.contact_name || "",
          companyName: client.company_name || "your company",
          loginEmail: client.email,
          inviteUrl,
        }),
        {
          from: Deno.env.get("CLIENT_WELCOME_FROM") || "Meridian <daniel@send.meridiansales.example>",
          replyTo: Deno.env.get("CLIENT_WELCOME_REPLY_TO") || "daniel@meridiansales.example",
        }
      );
      // Marcus, 6 Oct: the welcome also goes by text when the profile has a mobile,
      // with the same set-password link. Twilio unset or a bad number is recorded
      // in the log, never fatal.
      let smsSent = false;
      const mobile = normalizeMobile(client.phone);
      if (mobile) {
        const sms = await sendTwilioSms(
          mobile,
          `Welcome to Meridian. Your onboarding awaits: ${inviteUrl} We have also sent the details to ${client.email}.`,
        );
        smsSent = sms.ok;
        if (!sms.ok) console.error("[client-onboarding-admin] welcome SMS", client.id, sms.error);
      }
      return { userId, client, inviteSent: send.ok, smsSent };
    };

    if (action === "confirm_paid") {
      const clientProfileId = String(body.client_profile_id || "");
      const journey = await loadJourney(clientProfileId);
      if (!journey) return json({ error: "No journey for that client" }, 404);
      if (journey.status !== "awaiting_payment") return json({ error: "Payment is already confirmed" }, 409);

      const prov = await provisionAndInvite(clientProfileId);
      if ("error" in prov) return prov.error;

      await svc
        .from("client_onboarding_journeys")
        .update({
          status: "active",
          payment_confirmed_at: new Date().toISOString(),
          payment_confirmed_by: actorId,
          welcome_email_sent_at: prov.inviteSent ? new Date().toISOString() : null,
        })
        .eq("id", journey.id);

      return json({ confirmed: true, invite_sent: prov.inviteSent, sms_sent: prov.smsSent });
    }

    if (action === "resend_welcome") {
      const clientProfileId = String(body.client_profile_id || "");
      const journey = await loadJourney(clientProfileId);
      if (!journey || journey.status === "awaiting_payment") {
        return json({ error: "Confirm payment first — that's what sends the welcome email" }, 409);
      }
      const prov = await provisionAndInvite(clientProfileId);
      if ("error" in prov) return prov.error;
      if (prov.inviteSent && !journey.welcome_email_sent_at) {
        await svc.from("client_onboarding_journeys")
          .update({ welcome_email_sent_at: new Date().toISOString() }).eq("id", journey.id);
      }
      return json({ invite_sent: prov.inviteSent, sms_sent: prov.smsSent });
    }

    // ── override_stage / waive_step ────────────────────────────────────────
    if (action === "override_stage") {
      const clientProfileId = String(body.client_profile_id || "");
      const stageKey = String(body.stage_key || "");
      const journey = await loadJourney(clientProfileId);
      if (!journey) return json({ error: "No journey for that client" }, 404);
      await svc.from("client_journey_stage_unlocks").upsert(
        { journey_id: journey.id, stage_key: stageKey, unlocked_by: user.id, note: body.note ?? null },
        { onConflict: "journey_id,stage_key" }
      );
      return json({ unlocked: true });
    }

    if (action === "waive_step") {
      const clientProfileId = String(body.client_profile_id || "");
      const stepKey = String(body.step_key || "");
      const journey = await loadJourney(clientProfileId);
      if (!journey) return json({ error: "No journey for that client" }, 404);
      const { error: wErr } = await svc
        .from("client_journey_tasks")
        .update({ waived_by: user.id, waived_at: new Date().toISOString(), waive_note: body.note ?? null })
        .eq("journey_id", journey.id)
        .eq("step_key", stepKey);
      if (wErr) return json({ error: wErr.message }, 500);
      return json({ waived: true });
    }

    // ── reopen_step ────────────────────────────────────────────────────────
    // 11 Sep (Marcus): the CSM can put a finished card back in front of the
    // client to be redone. Answers and files stay on the row so the card
    // opens pre-filled; only the completion (or waiver) is cleared. Only on a
    // journey that is still running — a released client has no deck to go to.
    if (action === "reopen_step") {
      const clientProfileId = String(body.client_profile_id || "");
      const stepKey = String(body.step_key || "");
      const journey = await loadJourney(clientProfileId);
      if (!journey) return json({ error: "No journey for that client" }, 404);
      if (journey.status !== "active") return json({ error: "Only an onboarding that is still running can have a card reopened" }, 409);
      const { error: rErr } = await svc
        .from("client_journey_tasks")
        .update({ is_completed: false, completed_at: null, completed_by: null, waived_by: null, waived_at: null, waive_note: null })
        .eq("journey_id", journey.id)
        .eq("step_key", stepKey);
      if (rErr) return json({ error: rErr.message }, 500);
      return json({ reopened: true });
    }

    // ── create_campaign ────────────────────────────────────────────────────
    // Created 'pending' on purpose: the client portal only reads campaigns
    // with status='active', so nothing shows on their dashboard until the CSM
    // presses Start. Daniel wants that gap — "there could be delays".
    if (action === "create_campaign") {
      const clientProfileId = String(body.client_profile_id || "");
      const journey = await loadJourney(clientProfileId);
      if (!journey) return json({ error: "No journey for that client" }, 404);
      if (journey.campaign_id) return json({ error: "A campaign already exists for this onboarding" }, 409);

      const name = String(body.name || "").trim();
      const startDate = String(body.start_date || "").trim();
      const months = Number(body.duration_months);
      if (!name) return json({ error: "Campaign name is required" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return json({ error: "A valid start date is required" }, 400);
      if (!Number.isFinite(months) || months < 1 || months > 36) {
        return json({ error: "Duration must be between 1 and 36 months" }, 400);
      }

      // End date = start + N months, minus a day (a 3-month campaign starting
      // 1 Sep runs to 30 Nov, not 1 Dec).
      const end = new Date(`${startDate}T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + months);
      end.setUTCDate(end.getUTCDate() - 1);
      const endDate = end.toISOString().slice(0, 10);

      const { data: campaign, error: cErr } = await svc
        .from("campaigns")
        .insert({
          client_id: clientProfileId,
          name,
          status: "pending",
          start_date: startDate,
          launch_date: startDate,
          end_date: endDate,
          meetings_booked: 0,
          meetings_sat: 0,
          progress_manual_pct: 0,
        })
        .select("id, name, start_date, end_date, status")
        .single();
      if (cErr) return json({ error: cErr.message }, 500);

      await svc
        .from("client_onboarding_journeys")
        .update({ campaign_id: campaign.id })
        .eq("id", journey.id);

      return json({ created: true, campaign });
    }

    // ── update_campaign ────────────────────────────────────────────────────
    // Daniel: "I'll definitely need to input the start date and be able to
    // adjust both the start and end date."
    if (action === "update_campaign") {
      const clientProfileId = String(body.client_profile_id || "");
      const journey = await loadJourney(clientProfileId);
      if (!journey?.campaign_id) return json({ error: "No campaign to update" }, 404);
      const patch: Record<string, unknown> = {};
      if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
      if (typeof body.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
        patch.start_date = body.start_date;
        patch.launch_date = body.start_date;
      }
      if (typeof body.end_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.end_date)) {
        patch.end_date = body.end_date;
      }
      if (Object.keys(patch).length === 0) return json({ error: "Nothing to update" }, 400);
      const { error: uErr } = await svc.from("campaigns").update(patch).eq("id", journey.campaign_id);
      if (uErr) return json({ error: uErr.message }, 500);
      return json({ updated: true });
    }

    // ── mark_live (start the campaign AND release the client) ──────────────
    if (action === "mark_live") {
      const clientProfileId = String(body.client_profile_id || "");
      const journey = await loadJourney(clientProfileId);
      if (!journey) return json({ error: "No journey for that client" }, 404);
      if (journey.campaign_live_at) return json({ error: "Already live" }, 409);
      const stages = await stagesFor(journey);
      if (!readyForLive(stages) && body.force !== true) {
        return json({ needs_force: true, error: "The client hasn't finished every stage yet" }, 409);
      }
      if (!journey.campaign_id && body.force !== true) {
        return json({
          needs_campaign: true,
          error: "Create the campaign first — its start date drives the client's dashboard",
        }, 409);
      }

      const now = new Date().toISOString();
      // Starting the campaign is what makes it visible to the client.
      if (journey.campaign_id) {
        await svc.from("campaigns").update({ status: "active" }).eq("id", journey.campaign_id);
      }
      await svc
        .from("client_onboarding_journeys")
        .update({
          campaign_live_at: now,
          campaign_live_by: user.id,
          status: "completed",
          completed_at: now,
          // Release: the journey closes and the client's Onboarding tab goes.
          released_at: now,
          released_by: user.id,
        })
        .eq("id", journey.id);
      await svc.from("client_profiles").update({ status: "active" }).eq("id", clientProfileId);

      const { data: client } = await svc
        .from("client_profiles")
        .select("company_name, contact_name, email, is_test_account")
        .eq("id", clientProfileId)
        .single();

      // Celebrate to every login on the account (bell) + the primary email
      const { data: links } = await svc
        .from("client_profile_users").select("user_id").eq("client_profile_id", clientProfileId);
      for (const l of links || []) {
        await svc.from("notifications").insert({
          recipient_id: l.user_id,
          recipient_role: "client",
          title: "🎉 Your campaign is live!",
          message: "Onboarding complete — your SDR team has started dialling. Watch meetings land in real time.",
          category: "system",
          link_url: "/client/dashboard",
        });
      }
      if (client?.email) {
        await sendResendEmail(
          client.email,
          "Your campaign is live 🎉",
          campaignLiveEmailHtml({
            contactName: client.contact_name || "",
            companyName: client.company_name || "your company",
            portalUrl: `${APP_ORIGIN}/client/dashboard`,
          })
        );
      }
      return json({ live: true });
    }

    // ── create_test_client / delete_test_client (dev/admin only) ───────────
    if (action === "create_test_client") {
      if (!isDevAdmin) return json({ error: "Dev/admin only" }, 403);
      const email = String(body.email || "").trim().toLowerCase();
      if (!email.includes("@")) return json({ error: "A real inbox you control is required (the welcome email lands there)" }, 400);
      const companyName = String(body.company_name || "").trim() || "Sample Client Ltd";

      const { data: profile, error: pErr } = await svc
        .from("client_profiles")
        .insert({
          company_name: companyName,
          contact_name: String(body.contact_name || "Test Client"),
          email,
          status: "pending",
          is_test_account: true,
        })
        .select("id")
        .single();
      if (pErr) return json({ error: pErr.message }, 500);

      const res = await seedJourney(profile.id, { source: "test", isTest: true });
      if ("error" in res) return res.error;
      return json({
        created: true,
        client_profile_id: profile.id,
        next: "Press Confirm paid to fire the welcome email and open the journey.",
      });
    }

    if (action === "delete_test_client") {
      if (!isDevAdmin) return json({ error: "Dev/admin only" }, 403);
      const clientProfileId = String(body.client_profile_id || "");
      const { data: profile } = await svc
        .from("client_profiles")
        .select("id, is_test_account")
        .eq("id", clientProfileId)
        .single();
      if (!profile?.is_test_account) return json({ error: "Refusing: that is not a test client" }, 403);

      const { data: links } = await svc
        .from("client_profile_users").select("user_id").eq("client_profile_id", clientProfileId);
      const userIds = (links || []).map((l: any) => l.user_id as string);

      // Cancel any live demo bookings these logins made (removes the Google
      // Calendar event too — no test meetings left on Daniel's diary).
      let bookingsCancelled = 0;
      if (userIds.length > 0) {
        const { data: bookings } = await svc
          .from("bookings")
          .select("id")
          .in("created_by", userIds)
          .in("status", ["held", "confirmed"]);
        for (const b of bookings || []) {
          const r = await cancelBooking(svc, b.id, "Test client deleted");
          if (r.ok) bookingsCancelled++;
        }
      }

      // Delete auth users that exist ONLY for this test client
      let usersDeleted = 0;
      for (const uid of userIds) {
        const { data: otherLinks } = await svc
          .from("client_profile_users")
          .select("id")
          .eq("user_id", uid)
          .neq("client_profile_id", clientProfileId);
        const { data: theirRoles } = await svc
          .from("user_roles").select("role").eq("user_id", uid);
        const onlyClient = (theirRoles || []).every((r: any) => r.role === "client");
        if ((otherLinks || []).length === 0 && onlyClient) {
          await svc.from("user_roles").delete().eq("user_id", uid);
          await svc.from("profiles").delete().eq("id", uid);
          const { error: dErr } = await svc.auth.admin.deleteUser(uid);
          if (!dErr) usersDeleted++;
        }
      }

      await svc.from("client_profile_users").delete().eq("client_profile_id", clientProfileId);
      await svc.from("calendar_connections").delete().eq("client_profile_id", clientProfileId);

      // Campaigns don't cascade from the profile (their FK points at the
      // legacy clients table) — a test journey walked to campaign creation
      // would leave an orphaned live campaign polluting stats. Goals first.
      const { data: testCampaigns } = await svc
        .from("campaigns").select("id").eq("client_id", clientProfileId);
      const campaignIds = (testCampaigns || []).map((c: any) => c.id as string);
      if (campaignIds.length > 0) {
        await svc.from("campaign_weekly_goals").delete().in("campaign_id", campaignIds);
        await svc.from("campaigns").delete().in("id", campaignIds);
      }

      // The user_roles trigger mints a placeholder "Unspecified" profile for
      // a login granted the client role before its junction link exists —
      // sweep any such strays belonging to this test client's logins so a
      // test cycle leaves truly nothing behind.
      let placeholdersDeleted = 0;
      if (userIds.length > 0) {
        const { data: strays } = await svc
          .from("client_profiles")
          .select("id")
          .in("user_id", userIds)
          .eq("company_name", "Unspecified")
          .neq("id", clientProfileId);
        for (const s of strays || []) {
          await svc.from("client_health_metric_overrides").delete().eq("client_profile_id", s.id);
          await svc.from("client_health_metric_override_history").delete().eq("client_profile_id", s.id);
          const { error: sErr } = await svc.from("client_profiles").delete().eq("id", s.id);
          if (!sErr) placeholdersDeleted++;
        }
      }

      // Health overrides must go before the profile: their delete fires an
      // audit-history insert that still references the profile row (deleting
      // profile-first trips the history FK — learned on the 27 Aug orphan).
      await svc.from("client_health_metric_overrides").delete().eq("client_profile_id", clientProfileId);
      await svc.from("client_health_metric_override_history").delete().eq("client_profile_id", clientProfileId);

      // Journey + tasks + unlocks cascade from the profile delete
      const { error: delErr } = await svc.from("client_profiles").delete().eq("id", clientProfileId);
      if (delErr) return json({ error: delErr.message }, 500);

      return json({
        deleted: true,
        users_deleted: usersDeleted,
        bookings_cancelled: bookingsCancelled,
        campaigns_deleted: campaignIds.length,
        placeholders_deleted: placeholdersDeleted,
      });
    }

    return json({ error: `Unknown action ${action}` }, 400);
  } catch (e) {
    console.error("[client-onboarding-admin]", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
