// Diagnostic endpoint — NO database writes.
// Compares what Close.com returns vs what the n8n acquisition branch
// upserts into setter_close_metrics. Also surfaces leads whose
// "follow-up date agreed" custom field is set (warm-lead candidates).
//
// Usage:
//   GET /debug-close-acquisition?setter_id=<close_user_id>&date=YYYY-MM-DD
// Optional:
//   &warm_days=14   (look-ahead window for warm leads, default 14)
//
// Requires CLOSE_API_KEY (org-level) and a Bearer token matching
// N8N_WEBHOOK_SECRET so this isn't publicly callable.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BASE = "https://api.close.com/api/v1";

function auth(key: string): string {
  return "Basic " + btoa(`${key}:`);
}

async function closeGet(path: string, key: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: auth(key), Accept: "application/json" },
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  if (!res.ok) {
    return { ok: false, status: res.status, body: json ?? text };
  }
  return { ok: true, status: res.status, body: json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Use GET" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Bearer auth (reuse the n8n webhook secret to avoid creating a new one).
  const expected = Deno.env.get("N8N_WEBHOOK_SECRET");
  const provided = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const closeKey = Deno.env.get("CLOSE_API_KEY");
  if (!closeKey) {
    return new Response(JSON.stringify({ error: "CLOSE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const setterId = url.searchParams.get("setter_id");
  const date = url.searchParams.get("date");
  const warmDays = Math.max(1, Math.min(60, Number(url.searchParams.get("warm_days") || "14")));
  if (!setterId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(
      JSON.stringify({ error: "Provide setter_id and date=YYYY-MM-DD" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 1) Pull all calls for this user on this UTC day.
  const startISO = `${date}T00:00:00`;
  const endISO = `${date}T23:59:59`;
  const callsQ = `/activity/call/?user_id=${encodeURIComponent(setterId)}` +
    `&date_created__gte=${encodeURIComponent(startISO)}` +
    `&date_created__lte=${encodeURIComponent(endISO)}` +
    `&_limit=200`;
  const callsRes = await closeGet(callsQ, closeKey);
  const calls: any[] = callsRes.ok ? (callsRes.body?.data ?? []) : [];

  // Compute the same buckets the n8n workflow is supposed to compute.
  const dials = calls.length;
  const connects = calls.filter(
    (c) => Number(c.duration ?? 0) > 0 && (c.status === "completed" || c.direction === "outbound"),
  ).length;
  const connects3 = calls.filter((c) => Number(c.duration ?? 0) >= 180).length;
  const talkSeconds = calls.reduce((s, c) => s + Number(c.duration ?? 0), 0);

  // 2) Warm-lead candidates — leads where the "follow-up date agreed"
  // custom field is set within the next `warm_days`. We don't know the
  // exact custom-field ID, so search all leads assigned to this user
  // and return their custom fields so the caller can identify it.
  const today = new Date(date);
  const futureCutoff = new Date(today.getTime() + warmDays * 86400000)
    .toISOString().slice(0, 10);
  const leadsQ = `/lead/?query=${encodeURIComponent(`user_id:${setterId} sort:date_updated`)}&_limit=50&_fields=id,display_name,custom`;
  const leadsRes = await closeGet(leadsQ, closeKey);
  const leads: any[] = leadsRes.ok ? (leadsRes.body?.data ?? []) : [];
  const warmCandidates = leads
    .map((l) => {
      const custom = l.custom ?? {};
      const followKeys = Object.keys(custom).filter((k) =>
        /follow.?up.*(date|agreed)/i.test(k),
      );
      const followValues = followKeys.map((k) => ({ key: k, value: custom[k] }));
      return { id: l.id, display_name: l.display_name, follow_up_fields: followValues };
    })
    .filter((l) => l.follow_up_fields.length > 0);

  return new Response(
    JSON.stringify({
      query: { setter_id: setterId, date, warm_days: warmDays, warm_cutoff: futureCutoff },
      close_response: {
        calls_status: callsRes.status,
        calls_ok: callsRes.ok,
        leads_status: leadsRes.status,
        leads_ok: leadsRes.ok,
        leads_error: leadsRes.ok ? null : leadsRes.body,
        calls_error: callsRes.ok ? null : callsRes.body,
      },
      computed_buckets: {
        dials,
        connects,
        connects_3_plus_mins: connects3,
        talk_time_seconds: talkSeconds,
      },
      sample_calls: calls.slice(0, 5).map((c) => ({
        id: c.id,
        direction: c.direction,
        status: c.status,
        duration: c.duration,
        date_created: c.date_created,
      })),
      warm_lead_candidates: warmCandidates,
      hint:
        "If computed_buckets.connects/connects_3_plus_mins > 0 here but DB shows 0, the n8n acquisition-branch filter is dropping these calls. Use warm_lead_candidates[].follow_up_fields[].key as the custom-field name to wire warm leads.",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
