// Enquire → Close (20 Sep 2026): one click turns a response into a Close lead,
// replacing Elena's export → sheet → import routine. Hiring forms go to the
// Human Resources org (CLOSE_API_KEY_HR), everything else to the sales org
// (CLOSE_API_KEY). The lead carries the person as a contact and every answer
// as a note; the response remembers the lead id so it is never pushed twice.
// POST { response_ids: string[] }  (staff JWT; form managers only)
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { answersByRef, answersByTitle, type FormSchema } from "../_shared/form-logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const MANAGER_ROLES = new Set(["admin", "dev", "hr", "ops", "sdr_manager"]);
const MANAGER_CAPS = new Set(["can_screen_candidates", "can_view_ops_command"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return json({ error: "Not signed in" }, 401);
  const [{ data: roles }, { data: caps }] = await Promise.all([
    svc.from("user_roles").select("role").eq("user_id", user.id),
    svc.from("user_capabilities").select("capability").eq("user_id", user.id),
  ]);
  const allowed = (roles ?? []).some((r: any) => MANAGER_ROLES.has(r.role)) || (caps ?? []).some((c: any) => MANAGER_CAPS.has(c.capability));
  if (!allowed) return json({ error: "Access denied" }, 403);

  let body: any; try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const ids: string[] = Array.isArray(body.response_ids) ? body.response_ids.map(String).slice(0, 200) : [];
  if (!ids.length) return json({ error: "response_ids required" }, 400);

  // Lead custom fields per org key: a question whose title matches a field name
  // (ignoring case, punctuation and spacing) is written into that field, so
  // Elena's existing Typeform fields in the HR org fill themselves.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const fieldCache = new Map<string, Map<string, string>>();
  const customFields = async (apiKey: string): Promise<Map<string, string>> => {
    if (fieldCache.has(apiKey)) return fieldCache.get(apiKey)!;
    const map = new Map<string, string>();
    let url: string | null = "https://api.close.com/api/v1/custom_field/lead/?_limit=100";
    let skip = 0;
    while (url) {
      const res = await fetch(url, { headers: { Authorization: "Basic " + btoa(`${apiKey}:`) } });
      if (!res.ok) break;
      const page = await res.json();
      for (const f of page.data ?? []) if (f?.id && f?.name) map.set(norm(f.name), f.id);
      skip += (page.data ?? []).length;
      url = page.has_more && page.data?.length ? `https://api.close.com/api/v1/custom_field/lead/?_limit=100&_skip=${skip}` : null;
    }
    fieldCache.set(apiKey, map);
    return map;
  };

  const { data: rows } = await svc.from("form_responses").select("*, form:forms(id, slug, name, kind, published_schema, schema)").in("id", ids);
  const results: Array<{ id: string; ok: boolean; lead_id?: string; error?: string; skipped?: string }> = [];
  for (const r of rows ?? []) {
    if (r.close_lead_id) { results.push({ id: r.id, ok: true, lead_id: r.close_lead_id, skipped: "already pushed" }); continue; }
    const form = r.form; const schema = (form?.published_schema ?? form?.schema) as FormSchema | null;
    if (!schema) { results.push({ id: r.id, ok: false, error: "form has no schema" }); continue; }
    const apiKey = form.kind === "hiring" ? (Deno.env.get("CLOSE_API_KEY_HR") || Deno.env.get("CLOSE_API_KEY")) : Deno.env.get("CLOSE_API_KEY");
    if (!apiKey) { results.push({ id: r.id, ok: false, error: form.kind === "hiring" ? "CLOSE_API_KEY_HR not set" : "CLOSE_API_KEY not set" }); continue; }
    const byRef = answersByRef(schema, r.answers ?? {});
    const byTitle = answersByTitle(schema, r.answers ?? {});
    const personName = byRef.name || byRef.your_name || `${byRef.first_name ?? ""} ${byRef.last_name ?? ""}`.trim() || byRef.email || "Unknown";
    const company = byRef.company || byRef.company_name || byRef.current_company || "";
    const leadName = form.kind === "hiring" ? personName : (company || personName);
    // 22 Sep 2026 (the owner): the number was landing in a custom field instead of
    // on the contact whenever a form named the field anything other than
    // `phone` or `mobile`. Fall back to the answer to any question of type
    // `phone`, so the contact is reachable whatever the form calls it.
    const phoneByType = (() => {
      for (const q of schema.questions ?? []) {
        if (q.type !== "phone") continue;
        const v = byRef[q.ref];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
      return "";
    })();
    const contactPhone =
      byRef.phone || byRef.mobile || byRef.phone_number || byRef.mobile_number ||
      byRef.contact_number || byRef.telephone || phoneByType;

    const contact: any = { name: personName };
    if (byRef.email) contact.emails = [{ type: "office", email: byRef.email }];
    if (contactPhone) contact.phones = [{ type: "mobile", phone: contactPhone }];
    if (byRef.current_title) contact.title = byRef.current_title;
    if (byRef.linkedin_url) contact.urls = [{ type: "url", url: byRef.linkedin_url }];
    const payload: any = { name: leadName, contacts: [contact], description: `From Enquire form "${form.name}"${r.score_pct !== null && r.score_pct !== undefined ? ` · scored ${r.score_pct}%` : ""}` };
    if (byRef.company_website) payload.url = byRef.company_website;
    const fields = await customFields(apiKey);
    const unmatched: string[] = [];
    for (const [title, value] of Object.entries(byTitle)) {
      const id = fields.get(norm(title)) ?? fields.get(norm(title.replace(/\?$/, "")));
      if (id) payload[`custom.${id}`] = String(value).slice(0, 5000); else unmatched.push(title);
    }
    if (r.score_pct !== null && r.score_pct !== undefined) { const sid = fields.get("score"); if (sid) payload[`custom.${sid}`] = String(r.score_pct); }
    const auth = { Authorization: "Basic " + btoa(`${apiKey}:`), "Content-Type": "application/json" };
    try {
      const res = await fetch("https://api.close.com/api/v1/lead/", { method: "POST", headers: auth, body: JSON.stringify(payload) });
      if (!res.ok) { results.push({ id: r.id, ok: false, error: `Close ${res.status}: ${(await res.text()).slice(0, 200)}` }); continue; }
      const lead = await res.json();
      const note = Object.entries(byTitle).filter(([k]) => unmatched.includes(k)).map(([k, v]) => `${k}\n${v}`).join("\n\n") || "All answers are in the lead's custom fields.";
      await fetch("https://api.close.com/api/v1/activity/note/", { method: "POST", headers: auth, body: JSON.stringify({ lead_id: lead.id, note: `Enquire · ${form.name} · ${new Date(r.completed_at ?? r.created_at).toLocaleDateString("en-GB")}\n\n${note}`.slice(0, 20000) }) }).catch(() => {});
      await svc.from("form_responses").update({ close_lead_id: lead.id, close_pushed_at: new Date().toISOString() }).eq("id", r.id);
      results.push({ id: r.id, ok: true, lead_id: lead.id });
    } catch (e) {
      results.push({ id: r.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ ok: results.every((x) => x.ok), results });
});
