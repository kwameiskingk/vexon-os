// Partner references (18 Sep 2026): email the partner when Marcus marks a
// discovery as a reference, and again when that deal closes (finder's fee).
// In-app bells are raised by DB triggers; this function only sends email.
// POST { action: "notify_new" | "notify_closed", reference_id }
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { sendResendEmail } from "../_shared/booking-flow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const STAFF = new Set(["admin", "dev", "ops", "csm", "account_executive"]);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return json({ error: "Not signed in" }, 401);
  const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", user.id);
  if (!(roles ?? []).some((r: any) => STAFF.has(r.role))) return json({ error: "Access denied" }, 403);

  let body: any; try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const { action, reference_id } = body;
  if (!reference_id) return json({ error: "reference_id required" }, 400);
  const { data: ref } = await svc.from("partner_references").select("*, partner:partners(id, full_name, email, company_name)").eq("id", reference_id).maybeSingle();
  if (!ref?.partner?.email) return json({ error: "Reference or partner not found" }, 404);
  const first = String(ref.partner.full_name || "").split(" ")[0] || "there";
  const portal = "https://vexon-os.example/partnerships/references";
  const brand = `<p style="text-align:center;color:#8b87a3;font-size:11px;margin-top:18px;">Meridian · Partnerships</p>`;
  const wrap = (inner: string) => `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:Inter,Arial,sans-serif;color:#0f0f11;"><div style="max-width:560px;margin:0 auto;padding:28px 20px;"><div style="background:#fff;border:1px solid #e3e3e6;border-radius:14px;padding:26px;">${inner}</div>${brand}</div></body></html>`;

  if (action === "notify_new") {
    const rows = [["Name", ref.contact_name], ["Company", ref.company_name], ["Sector", ref.sector], ["Mobile", ref.mobile], ["LinkedIn", ref.linkedin_url], ["Email", ref.email], ["Pain points", ref.pain_points]]
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#5d5975;font-size:13px;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;font-size:14px;">${esc(v)}</td></tr>`).join("");
    const html = wrap(`<h1 style="font-size:20px;margin:0 0 10px;">Hi ${esc(first)}, someone would like a word</h1>
      <p style="margin:0 0 16px;color:#2c2940;">Marcus has just sat a discovery call with a recruitment agency owner who asked to speak to a current client before deciding. He gave them your details. Here's who they are so you're not caught cold:</p>
      <table style="border-collapse:collapse;margin:0 0 16px;">${rows}</table>
      ${ref.note ? `<p style="margin:0 0 16px;color:#2c2940;"><b>From Marcus:</b> ${esc(ref.note)}</p>` : ""}
      <p style="margin:0 0 16px;color:#2c2940;">They'll reach out to you directly. If they sign, a £${Number(ref.fee_amount || 100)} finder's fee comes to you.</p>
      <p style="margin:0;"><a href="${portal}" style="display:inline-block;background:#3d5a80;color:#fff;text-decoration:none;border-radius:999px;padding:10px 22px;font-weight:700;">Open your portal</a></p>`);
    const text = `Hi ${first}, Marcus sat a discovery call with ${ref.contact_name || "a prospect"}${ref.company_name ? ` at ${ref.company_name}` : ""} who asked to speak to a current client. Details: ${[ref.sector, ref.mobile, ref.linkedin_url, ref.email, ref.pain_points].filter(Boolean).join(" · ")}. ${portal}`;
    const r = await sendResendEmail(ref.partner.email, `Reference request: ${ref.contact_name || "a prospect"}${ref.company_name ? ` at ${ref.company_name}` : ""}`, html, text);
    if (r.ok) await svc.from("partner_references").update({ partner_notified_at: new Date().toISOString() }).eq("id", reference_id);
    return json({ ok: r.ok, attempted: r.attempted, error: r.ok ? undefined : r.error });
  }

  if (action === "notify_closed") {
    const html = wrap(`<h1 style="font-size:20px;margin:0 0 10px;">They signed, ${esc(first)} 🎉</h1>
      <p style="margin:0 0 16px;color:#2c2940;">${esc(ref.company_name || "The prospect you spoke to")} has become a Meridian client. Thank you for taking the call. A <b>£${Number(ref.fee_amount || 100)} finder's fee</b> is owed to you.</p>
      <p style="margin:0 0 16px;color:#2c2940;">Make sure your bank details are in the portal so we can pay it straight away.</p>
      <p style="margin:0;"><a href="https://vexon-os.example/partnerships/details" style="display:inline-block;background:#3d5a80;color:#fff;text-decoration:none;border-radius:999px;padding:10px 22px;font-weight:700;">Check your details</a></p>`);
    const r = await sendResendEmail(ref.partner.email, `${ref.company_name || "Your reference"} signed — £${Number(ref.fee_amount || 100)} finder's fee`, html, `${ref.company_name || "The prospect you spoke to"} signed with Meridian. A £${Number(ref.fee_amount || 100)} finder's fee is owed to you. Check your bank details: https://vexon-os.example/partnerships/details`);
    if (r.ok) await svc.from("partner_references").update({ closed_notified_at: new Date().toISOString() }).eq("id", reference_id);
    return json({ ok: r.ok, attempted: r.attempted, error: r.ok ? undefined : r.error });
  }
  return json({ error: "Unknown action" }, 400);
});
