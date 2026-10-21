import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// Typeform webhook receiver for the Meta-ads funnel (form fWoUjXG8).
// Full submissions arrive instantly; partial submissions (past the form's
// Partial Submit Point) are delivered by Typeform after abandonment, with a
// "partial" event type. Rows dedup on form_response.token so a partial and
// its later full submission share one marketing_leads row.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, typeform-signature",
};

const JAMES_USER_ID = "42292222-46a0-4b2c-85b8-ecf3fca6415b";

interface TypeformField {
  id?: string;
  ref?: string;
  type?: string;
  title?: string;
}

interface TypeformAnswer {
  field?: TypeformField;
  type?: string;
  text?: string;
  email?: string;
  phone_number?: string;
  url?: string;
  boolean?: boolean;
  choice?: { label?: string };
}

// Verify Typeform's HMAC signature: header "Typeform-Signature: sha256=<base64>".
async function verifySignature(secret: string, header: string | null, rawBody: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = "sha256=" + btoa(String.fromCharCode(...new Uint8Array(sig)));
  return header === expected;
}

const choiceLabel = (a?: TypeformAnswer) => a?.choice?.label ?? (a?.boolean === true ? "Yes" : a?.boolean === false ? "No" : null);

// Typeform's year-1 sentinel on partial deliveries means "not submitted".
const realDate = (d?: string | null) => (d && !d.startsWith("0001") ? d : null);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookSecret = Deno.env.get("TYPEFORM_WEBHOOK_SECRET");

    const rawBody = await req.text();

    // Auth: Typeform signature, or ?secret= param (heyreach-webhook convention).
    // Only enforced when the secret env is set, matching the house webhook pattern.
    if (webhookSecret) {
      const url = new URL(req.url);
      const paramOk = url.searchParams.get("secret") === webhookSecret;
      const sigOk = await verifySignature(webhookSecret, req.headers.get("typeform-signature"), rawBody);
      if (!paramOk && !sigOk) {
        console.error("[TYPEFORM] Invalid or missing webhook secret/signature");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("[TYPEFORM] TYPEFORM_WEBHOOK_SECRET not set — accepting unauthenticated payload");
    }

    const payload = JSON.parse(rawBody);
    const eventType: string = payload.event_type || "unknown";
    const fr = payload.form_response;
    if (!fr || !fr.token) {
      console.log(`[TYPEFORM] Ignoring event without form_response: ${eventType}`);
      return new Response(JSON.stringify({ ok: true, ignored: eventType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPartial = eventType.toLowerCase().includes("partial");
    const answers: TypeformAnswer[] = Array.isArray(fr.answers) ? fr.answers : [];

    // Field titles live in form_response.definition.fields, NOT on each
    // answer's field object (which carries only id/ref/type) — build a lookup.
    const titlesById = new Map<string, string>();
    for (const f of (fr.definition?.fields || []) as TypeformField[]) {
      const t = (f.title || "").toLowerCase();
      if (f.id) titlesById.set(f.id, t);
      if (f.ref) titlesById.set(f.ref, t);
    }
    const titleOf = (a: TypeformAnswer) =>
      (a.field?.title || titlesById.get(a.field?.id || "") || titlesById.get(a.field?.ref || "") || "").toLowerCase();

    // Field matching by type + title keywords. Deliberately not pinned to
    // field IDs so Tom can tweak copy without breaking ingestion.
    const nameAns = answers.find((a) => a.type === "text" && titleOf(a).includes("name") && !titleOf(a).includes("company"));
    const companyAns = answers.find((a) => titleOf(a).includes("company name"));
    const emailAns = answers.find((a) => a.type === "email");
    const phoneAns = answers.find((a) => a.type === "phone_number");
    const ownerAns = answers.find((a) => titleOf(a).includes("recruitment agency owner"));
    const revenueAns = answers.find((a) => titleOf(a).includes("revenue"));
    const affordAns = answers.find((a) => titleOf(a).includes("services range") || titleOf(a).includes("investment"));
    const bookingAns = answers.find((a) => a.type === "url" || a.field?.type === "calendly");

    const name = nameAns?.text || null;
    const companyName = companyAns?.text || null;
    const email = emailAns?.email || null;
    const phone = phoneAns?.phone_number || null;
    const owner = choiceLabel(ownerAns);
    const revenueBand = choiceLabel(revenueAns);
    const afford = choiceLabel(affordAns);
    const bookingUrl = bookingAns?.url || null;

    // Classification per Marcus's taxonomy (24 Aug ruling).
    let qualification: string | null = null;
    if (owner === "No") {
      qualification = "unqualified";
    } else if (revenueBand) {
      if (revenueBand.trim().toLowerCase() === "0-300k") {
        if (afford === "Yes") qualification = "price_qualified";
        else if (afford === "No") qualification = "unqualified";
        // afford unanswered (abandoned mid-path) => stays null = incomplete
      } else {
        qualification = "qualified";
      }
    }
    const outcome = bookingUrl ? "meeting_booked" : "no_meeting";

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existing } = await supabase
      .from("marketing_leads")
      .select("id, outcome")
      .eq("typeform_response_token", fr.token)
      .maybeSingle();

    const row = {
      source: "meta_ads",
      typeform_response_token: fr.token,
      name,
      company_name: companyName,
      email,
      phone,
      revenue_band: revenueBand,
      qualification,
      outcome,
      booking_url: bookingUrl,
      is_partial: isPartial,
      raw: payload,
      submitted_at: realDate(fr.submitted_at) || realDate(fr.landed_at) || new Date().toISOString(),
    };

    let shouldNotify = false;
    let notifyReason = "";

    if (existing) {
      // Full submission updating an earlier partial (or a Typeform retry).
      // Never resurrect is_partial=true over a stored full submission.
      const update = isPartial ? { ...row, is_partial: undefined } : row;
      const { error } = await supabase.from("marketing_leads").update(update).eq("id", existing.id);
      if (error) throw error;
      if (existing.outcome !== "meeting_booked" && outcome === "meeting_booked") {
        shouldNotify = true;
        notifyReason = "booked";
      }
    } else {
      const { error } = await supabase.from("marketing_leads").insert(row);
      if (error) throw error;
      // Don't ring the bell for empty shells (e.g. "No" on Q1 with no details).
      shouldNotify = Boolean(name || email || companyName);
      notifyReason = "new";
    }

    if (shouldNotify) {
      const qualLabel =
        qualification === "qualified" ? "Qualified" :
        qualification === "price_qualified" ? "Price qualified" :
        qualification === "unqualified" ? "Unqualified" : "Incomplete";
      const outcomeLabel = outcome === "meeting_booked" ? "Meeting booked" : "No meeting yet";
      const who = name || email || "New lead";
      const title = notifyReason === "booked"
        ? `🎯 Meeting booked — ${who}`
        : `🎯 New lead from Ads — ${who}`;
      const { error: notifError } = await supabase.from("notifications").insert({
        recipient_id: JAMES_USER_ID,
        recipient_role: "setter",
        title,
        message: `${who}${companyName ? ` (${companyName})` : ""} · ${qualLabel} · ${outcomeLabel}`,
        category: "system",
        link_url: "/marketing/leads",
        triggered_by: null,
      });
      if (notifError) console.error("[TYPEFORM] Notification insert failed:", notifError);
    }

    console.log(`[TYPEFORM] ${existing ? "Updated" : "Inserted"} lead ${fr.token} | partial=${isPartial} | qual=${qualification} | outcome=${outcome} | notified=${shouldNotify}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[TYPEFORM ERROR]", error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
