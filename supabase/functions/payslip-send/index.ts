// Payslip generator (29 Sep 2026, Elena's ask; replaces PaySlipper).
//
// One function, two actions on a saved employee_payslips row:
//   render → draws the PDF and returns it base64 (download / preview)
//   send   → draws the PDF, stores it in the private payslips bucket, emails
//            it to the employee as an attachment, stamps sent_at/sent_to.
//
// The PDF is drawn server-side (_shared/payslip-pdf.ts, pdf-lib) so the file
// Elena previews, the file stored and the file emailed are the same bytes.
//
// Sender: a dedicated accounts identity, never a person. Elena (29 Sep):
// "it mustn't come from my address". Overridable with PAYSLIP_FROM /
// PAYSLIP_REPLY_TO. The email body carries no amounts; the PDF does.
//
// the hosted builder deploys with JWT verification OFF, so the caller is checked here:
// staff role (dev/admin/ops/hr/finance/accounting) or the
// can_view_ops_command capability. Fails closed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { sendResendEmail } from "../_shared/booking-flow.ts";
import { LEGAL_LINE } from "../_shared/legalEntity.ts";
import { MONTHS, renderPdf, type PayslipRow } from "../_shared/payslip-pdf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const STAFF_ROLES = ["dev", "admin", "ops", "hr", "finance", "accounting"];
const PAYSLIP_FROM = Deno.env.get("PAYSLIP_FROM") || "Meridian <accounts@send.meridiansales.example>";
const PAYSLIP_REPLY_TO = Deno.env.get("PAYSLIP_REPLY_TO") || "accounts@meridiansales.example";
const LOGO_URL = "https://vexon-os.example/brand/vexon-logo-white.png";

function base64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function payslipEmailHtml(opts: { firstName: string; period: string }) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background-color:#9e9e9e;background:linear-gradient(135deg,#dedede 0%,#9e9e9e 50%,#6b7a90 100%);border-radius:16px;padding:28px 30px;color:#0f0f11;">
      <img src="${LOGO_URL}" width="120" alt="Vexon OS" style="display:block;width:120px;height:auto;border:0;" />
      <h1 style="margin:8px 0 0;font-size:22px;">Your payslip for ${escapeHtml(opts.period)}</h1>
    </div>
    <div style="background:#ffffff;border:1px solid #e3e3e6;border-radius:16px;padding:26px 30px;margin-top:16px;color:#111113;">
      <p style="margin:0 0 14px;">Hi ${escapeHtml(opts.firstName)},</p>
      <p style="margin:0 0 14px;">Your payslip for <strong>${escapeHtml(opts.period)}</strong> is attached to this email as a PDF. Please keep it for your records.</p>
      <p style="margin:0;color:#5f5f66;font-size:13px;">If anything on it looks wrong, reply to this email and the accounts team will take a look.</p>
    </div>
    <p style="text-align:center;color:#5f5f66;font-size:11px;margin-top:14px;">${LEGAL_LINE}</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server not configured" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await anonClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: roleRows, error: roleError } = await admin
    .from("user_roles").select("role").eq("user_id", user.id).in("role", STAFF_ROLES);
  if (roleError) return json({ error: "Could not verify permissions" }, 500);
  let allowed = (roleRows?.length ?? 0) > 0;
  if (!allowed) {
    const { data: cap } = await admin.rpc("has_capability", { _user_id: user.id, _cap: "can_view_ops_command" });
    allowed = !!cap;
  }
  if (!allowed) return json({ error: "Not allowed to issue payslips" }, 403);

  let body: { action?: string; payslip_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = body.action;
  const payslipId = body.payslip_id;
  if (!payslipId || (action !== "render" && action !== "send")) {
    return json({ error: "action must be render or send, with payslip_id" }, 400);
  }

  const { data: row, error: rowError } = await admin
    .from("employee_payslips").select("*").eq("id", payslipId).maybeSingle();
  if (rowError) return json({ error: rowError.message }, 500);
  if (!row) return json({ error: "Payslip not found" }, 404);
  const slip = row as unknown as PayslipRow;

  let pdf: Uint8Array;
  try {
    pdf = await renderPdf(slip);
  } catch (e) {
    console.error("payslip render failed", e);
    return json({ error: "Could not draw the payslip PDF" }, 500);
  }
  const period = `${MONTHS[slip.month - 1] ?? slip.month} ${slip.year}`;
  const safeName = (slip.employee_name || "employee").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `Payslip-${slip.year}-${String(slip.month).padStart(2, "0")}-${safeName}.pdf`;

  if (action === "render") {
    return json({ ok: true, filename, pdf_base64: base64(pdf) });
  }

  // send
  const to = (slip.employee_email || "").trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return json({ error: "The payslip has no valid employee email" }, 400);
  }

  const storagePath = `${slip.user_id ?? "unlinked"}/${slip.payslip_no ?? slip.id}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("payslips")
    .upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
  if (uploadError) return json({ error: `Could not store the PDF: ${uploadError.message}` }, 500);

  const firstName = (slip.employee_name || "").trim().split(/\s+/)[0] || "there";
  const send = await sendResendEmail(
    to,
    `Your payslip for ${period}`,
    payslipEmailHtml({ firstName, period }),
    `Hi ${firstName}, your payslip for ${period} is attached as a PDF. ${LEGAL_LINE}`,
    {
      from: PAYSLIP_FROM,
      replyTo: PAYSLIP_REPLY_TO,
      attachments: [{ filename, content: base64(pdf) }],
    },
  );
  if (!send.attempted) return json({ error: "Email is not configured (RESEND_API_KEY missing)" }, 500);
  if (!send.ok) return json({ error: `Email failed: ${send.error}` }, 502);

  const nowIso = new Date().toISOString();
  const { error: updateError } = await admin
    .from("employee_payslips")
    .update({
      status: "sent",
      sent_at: nowIso,
      sent_to: to,
      sent_date: nowIso.slice(0, 10),
      file_path: storagePath,
    })
    .eq("id", slip.id);
  if (updateError) return json({ error: `Sent, but could not record it: ${updateError.message}` }, 500);

  return json({ ok: true, sent_to: to, file_path: storagePath, filename });
});
