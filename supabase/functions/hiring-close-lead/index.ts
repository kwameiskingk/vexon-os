// Pull a candidate's Typeform answers out of Close (11 Sep 2026, Elena).
//
// Elena keeps every Typeform question as a lead custom field in the
// Human Resources Close org. She pastes the lead link on the call-list card
// and this returns the contact details plus every custom field that has a
// value, resolved to its NAME (the REST API flattens custom fields to
// "custom.cf_…" keys, so the field definitions are fetched once per org and
// cached for the life of the instance).
//
// Keys: CLOSE_API_KEY_HR first (the Human Resources org), then the sales
// orgs as a fallback so a lead pasted from the wrong org still resolves.
// Staff only: an ops-command / screening capability or a staff role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const STAFF_ROLES = ["dev", "admin", "ops", "hr", "sdr_manager"];
const CAPABILITIES = ["can_view_ops_command", "can_screen_candidates"];

// deno-lint-ignore no-explicit-any
type Json = any;

const fieldNameCache = new Map<string, Map<string, string>>();

async function customFieldNames(apiKey: string): Promise<Map<string, string>> {
  const cached = fieldNameCache.get(apiKey);
  if (cached) return cached;
  const names = new Map<string, string>();
  let url: string | null = "https://api.close.com/api/v1/custom_field/lead/?_limit=100";
  while (url) {
    const res = await fetch(url, { headers: { Authorization: "Basic " + btoa(`${apiKey}:`) } });
    if (!res.ok) break;
    const page: Json = await res.json();
    for (const f of page.data ?? []) if (f?.id && f?.name) names.set(String(f.id), String(f.name));
    url = page.has_more && page.data?.length ? `https://api.close.com/api/v1/custom_field/lead/?_limit=100&_skip=${names.size}` : null;
  }
  fieldNameCache.set(apiKey, names);
  return names;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { close_lead_link } = await req.json();
    const leadMatch = String(close_lead_link ?? "").slice(0, 500).match(/lead_[A-Za-z0-9]+/);
    if (!leadMatch) return json({ error: "That doesn't look like a Close lead link" }, 400);

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization") || "";
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return json({ error: "Sign in to Vexon OS to use Close lookup" }, 401);
    const { data: roleRows } = await svc.from("user_roles").select("role").eq("user_id", user.id).in("role", STAFF_ROLES);
    let allowed = (roleRows ?? []).length > 0;
    for (const cap of CAPABILITIES) {
      if (allowed) break;
      const { data } = await svc.rpc("has_capability", { _user_id: user.id, _cap: cap });
      allowed = data === true;
    }
    if (!allowed) return json({ error: "Access denied" }, 403);

    const apiKeys = [...new Set([
      Deno.env.get("CLOSE_API_KEY_HR"),
      Deno.env.get("CLOSE_API_KEY"),
      Deno.env.get("CLOSE_API_KEY_ACQUISITION"),
      Deno.env.get("CLOSE_API_KEY_FULFILMENT"),
    ].filter((k): k is string => !!k))];
    if (apiKeys.length === 0) return json({ error: "Close is not connected (no API key configured)" }, 502);

    const leadId = leadMatch[0];
    let lead: Json = null;
    let usedKey: string | null = null;
    for (const apiKey of apiKeys) {
      const res = await fetch(`https://api.close.com/api/v1/lead/${leadId}/`, {
        headers: { Authorization: "Basic " + btoa(`${apiKey}:`) },
      });
      if (res.ok) { lead = await res.json(); usedKey = apiKey; break; }
      if (![401, 403, 404].includes(res.status)) console.error("[hiring-close-lead] Close error:", res.status, await res.text());
    }
    if (!lead || !usedKey) {
      return json({ error: Deno.env.get("CLOSE_API_KEY_HR") ? "Lead not found in any connected Close org" : "Lead not found. The Human Resources Close org is not connected yet (CLOSE_API_KEY_HR)." }, 404);
    }

    const names = await customFieldNames(usedKey);
    const answers: Record<string, string> = {};
    const collect = (obj: Json) => {
      if (!obj || typeof obj !== "object") return;
      for (const [k, v] of Object.entries(obj)) {
        if (!k.startsWith("custom.")) continue;
        if (v == null || v === "") continue;
        const id = k.slice("custom.".length);
        const label = names.get(id) ?? id;
        answers[label] = Array.isArray(v) ? v.map(String).join(", ") : String(v);
      }
    };
    collect(lead);
    const contact: Json = (lead.contacts || [])[0] || {};
    collect(contact);

    const email = (contact.emails || [])[0]?.email || null;
    const phone = (contact.phones || [])[0]?.phone || null;
    const linkedin = (contact.urls || []).find((u: Json) => /linkedin\.com/i.test(u?.url || ""))?.url || null;

    return json({
      lead_id: leadId,
      lead_url: `https://app.close.com/lead/${leadId}/`,
      contact_name: contact.name || lead.display_name || lead.name || null,
      email,
      phone,
      linkedin_url: linkedin ? (/^https?:\/\//i.test(linkedin) ? linkedin : `https://${linkedin}`) : null,
      company_name: lead.display_name || lead.name || null,
      answers,
    });
  } catch (e) {
    console.error("[hiring-close-lead]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
