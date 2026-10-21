// Client invoices (9 Oct 2026, Marcus's ask on the 8 Oct EOD call).
//
// One function, every write to public.invoices goes through it:
//   preview    → draw the PDF for the form as it stands, return it base64
//   create     → allocate the number, draw + store the PDF, insert the row
//                (and send it in the same breath when `send` is true)
//   send       → email the stored PDF to the client, stamp sent_*
//   mark_paid  → status paid; optionally press Confirm paid on the client's
//                onboarding journey so the welcome email goes out in one go
//   cancel     → status cancelled (a sent invoice is never deleted)
//   download   → a short-lived signed URL for the stored PDF
//
// The PDF is drawn server-side (_shared/client-invoice-pdf.ts) so the file
// Marcus previews, the file stored and the file emailed are the same bytes.
//
// Who may do what (the owner, 9 Oct): raising and sending is Marcus's (admin) and
// the owner's (dev); marking paid is anyone who confirms payments today — the
// admin tier plus the CSM and AE. the hosted builder deploys with JWT verification OFF,
// so the caller is checked here. Fails closed.
//
// Numbering is Marcus's: the issue date backwards as one number (20261009,
// no slashes). A second invoice on the same day gets -2, a third -3, and so on.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { sendResendEmail } from "../_shared/booking-flow.ts";
import { LEGAL_LINE } from "../_shared/legalEntity.ts";
import {
  computeInvoiceTotals, DEFAULT_LINE_DESCRIPTION, DEFAULT_VAT_RATE, fmtGBP, invoiceNumberBase, loadInvoiceAssets,
  renderInvoicePdf, ukDate, type InvoiceAssets, type InvoiceInput,
} from "../_shared/client-invoice-pdf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ISSUE_ROLES = ["dev", "admin"];
const PAID_ROLES = ["dev", "admin", "ops", "finance", "accounting", "csm", "account_executive"];
const BUCKET = "invoices";
const INVOICE_FROM = Deno.env.get("INVOICE_FROM") || "Meridian <marcus@send.meridiansales.example>";
const INVOICE_REPLY_TO = Deno.env.get("INVOICE_REPLY_TO") || "marcus@meridiansales.example";
const LOGO_URL = "https://vexon-os.example/brand/vexon-logo-white.png";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// `_` and `%` are wildcards in ILIKE; an email is a literal.
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// Fonts + logo (~840 KB) are immutable; fetched once per warm instance, not per call.
let assetsPromise: Promise<InvoiceAssets> | null = null;
const assets = () => (assetsPromise ??= loadInvoiceAssets().then((a) => {
  if (!a.robotoRegular || !a.robotoBold || !a.merriweatherBlack || !a.logoPng) assetsPromise = null; // retry next call
  return a;
}));

function base64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
const escapeHtml = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isoDate = (v: unknown): string | null => {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const todayUk = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date()); // YYYY-MM-DD

interface InvoiceRow {
  id: string; client_id: string | null; invoice_number: string; amount: number; status: string;
  file_path: string | null; description: string | null; due_date: string | null; sent_at: string | null;
  paid_at: string | null; created_by: string | null; issue_date: string | null; vat_rate: number;
  vat_amount: number; total_amount: number | null; bill_to_name: string | null; bill_to_address: string | null;
  line_description: string | null; recipient_email: string | null; sent_to: string | null; send_count: number;
}

function invoiceEmailHtml(o: { firstName: string; number: string; total: string; due: string }) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background-color:#9e9e9e;background:linear-gradient(135deg,#dedede 0%,#9e9e9e 50%,#6b7a90 100%);border-radius:16px;padding:28px 30px;color:#0f0f11;">
      <img src="${LOGO_URL}" width="120" alt="Vexon OS" style="display:block;width:120px;height:auto;border:0;" />
      <h1 style="margin:8px 0 0;font-size:22px;">Invoice ${escapeHtml(o.number)}</h1>
    </div>
    <div style="background:#ffffff;border:1px solid #e3e3e6;border-radius:16px;padding:26px 30px;margin-top:16px;color:#111113;">
      <p style="margin:0 0 14px;">Hi ${escapeHtml(o.firstName)},</p>
      <p style="margin:0 0 14px;">Please find your invoice attached as a PDF. The total due is <strong>${escapeHtml(o.total)}</strong>, payable by <strong>${escapeHtml(o.due)}</strong>. Bank details are on the invoice.</p>
      <p style="margin:0;color:#5f5f66;font-size:13px;">Any questions, just reply to this email.</p>
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
  const anon = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await anon.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);
  const svc = createClient(supabaseUrl, serviceKey);

  const { data: roleRows, error: roleError } = await svc.from("user_roles").select("role").eq("user_id", user.id);
  if (roleError) return json({ error: "Could not verify permissions" }, 500);
  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  const canIssue = roles.some((r) => ISSUE_ROLES.includes(r));
  const canMarkPaid = roles.some((r) => PAID_ROLES.includes(r));
  if (!canIssue && !canMarkPaid) return json({ error: "Not allowed to work with invoices" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = str(body.action);

  // ── helpers ──────────────────────────────────────────────────────────────
  const loadInvoice = async (id: string): Promise<InvoiceRow | null> => {
    if (!id) return null;
    const { data } = await svc.from("invoices").select("*").eq("id", id).maybeSingle();
    return (data as InvoiceRow | null) ?? null;
  };
  const inputFromRow = (row: InvoiceRow): InvoiceInput => ({
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date || todayUk(),
    dueDate: row.due_date || row.issue_date || todayUk(),
    billToName: row.bill_to_name || "",
    billToAddress: row.bill_to_address || "",
    lineDescription: row.line_description || row.description || DEFAULT_LINE_DESCRIPTION,
    amountExVat: Number(row.amount) || 0,
    vatRate: Number(row.vat_rate ?? DEFAULT_VAT_RATE),
  });
  const fileName = (row: Pick<InvoiceRow, "invoice_number" | "bill_to_name">) => {
    const who = (row.bill_to_name || "client").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `Invoice-${row.invoice_number}-${who}.pdf`;
  };
  const storagePath = (row: Pick<InvoiceRow, "id" | "invoice_number" | "client_id">) =>
    `${row.client_id ?? "unlinked"}/${row.invoice_number}-${row.id.slice(0, 8)}.pdf`;

  // The next free number for an issue date: 20261009, then 20261009-2, …
  const nextNumber = async (issueDate: string): Promise<string> => {
    const base = invoiceNumberBase(issueDate);
    const { data } = await svc.from("invoices").select("invoice_number").like("invoice_number", `${base}%`);
    const taken = new Set((data ?? []).map((r: { invoice_number: string }) => r.invoice_number));
    if (!taken.has(base)) return base;
    for (let n = 2; n < 1000; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
    throw new Error("Too many invoices for one day");
  };

  // Read the form fields the same way for preview and create.
  const readForm = () => {
    const issueDate = isoDate(body.issue_date) || todayUk();
    const dueDate = isoDate(body.due_date) || issueDate;
    const amount = Number(body.amount);
    const vatRate = body.vat_rate == null || body.vat_rate === "" ? DEFAULT_VAT_RATE : Number(body.vat_rate);
    const errors: string[] = [];
    if (!str(body.bill_to_name)) errors.push("Who the invoice is for (Bill to) is required");
    if (!Number.isFinite(amount) || amount <= 0) errors.push("Amount must be more than £0");
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) errors.push("VAT rate must be between 0 and 100");
    if (dueDate < issueDate) errors.push("Date due cannot be before the date of issue");
    return {
      errors,
      issueDate, dueDate, amount, vatRate,
      billToName: str(body.bill_to_name),
      billToAddress: str(body.bill_to_address),
      lineDescription: str(body.line_description) || DEFAULT_LINE_DESCRIPTION,
      recipientEmail: str(body.recipient_email).toLowerCase(),
      clientProfileId: str(body.client_profile_id) || null,
      notes: str(body.notes) || null,
    };
  };

  const emailInvoice = async (row: InvoiceRow, pdf: Uint8Array, to: string) => {
    const totals = computeInvoiceTotals(Number(row.amount), Number(row.vat_rate));
    // "Hi Steve," from the client profile's contact name; "Hi there," when unknown.
    let contact = "";
    if (row.client_id) {
      const { data: cp } = await svc.from("client_profiles").select("contact_name").eq("id", row.client_id).maybeSingle();
      contact = (cp?.contact_name || "").trim();
    }
    const firstName = contact.split(/\s+/)[0] || "there";
    const due = ukDate(row.due_date || row.issue_date);
    const send = await sendResendEmail(
      to,
      `Invoice ${row.invoice_number} from Meridian`,
      invoiceEmailHtml({ firstName, number: row.invoice_number, total: fmtGBP(totals.total), due }),
      `Hi ${firstName}, please find invoice ${row.invoice_number} attached as a PDF. Total due ${fmtGBP(totals.total)}, payable by ${due}. Bank details are on the invoice. ${LEGAL_LINE}`,
      { from: INVOICE_FROM, replyTo: INVOICE_REPLY_TO, attachments: [{ filename: fileName(row), content: base64(pdf) }] },
    );
    if (!send.attempted) throw new Error("Email is not configured (RESEND_API_KEY missing)");
    if (!send.ok) throw new Error(`Email failed: ${send.error}`);
    const nowIso = new Date().toISOString();
    const { error } = await svc.from("invoices").update({
      status: row.status === "paid" ? "paid" : "sent",
      sent_at: row.sent_at ?? nowIso,
      sent_by: user.id,
      sent_to: to,
      send_count: (Number(row.send_count) || 0) + 1,
    }).eq("id", row.id);
    if (error) throw new Error(`Sent, but could not record it: ${error.message}`);
    return nowIso;
  };

  // The stored bytes, or a fresh draw when the file is missing (failed
  // upload earlier). The upload must succeed before file_path is recorded.
  const storedPdf = async (row: InvoiceRow): Promise<{ pdf: Uint8Array; path: string }> => {
    if (row.file_path) {
      const { data } = await svc.storage.from(BUCKET).download(row.file_path);
      if (data) return { pdf: new Uint8Array(await data.arrayBuffer()), path: row.file_path };
    }
    const pdf = await renderInvoicePdf(inputFromRow(row), await assets());
    const path = row.file_path || storagePath(row);
    const { error } = await svc.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`Could not store the PDF: ${error.message}`);
    if (!row.file_path) await svc.from("invoices").update({ file_path: path }).eq("id", row.id);
    return { pdf, path };
  };

  try {
    // ── preview ────────────────────────────────────────────────────────────
    if (action === "preview") {
      if (!canIssue) return json({ error: "Only an admin can raise invoices" }, 403);
      const f = readForm();
      if (f.errors.length) return json({ error: f.errors[0], errors: f.errors }, 400);
      const invoiceNumber = str(body.invoice_number) || await nextNumber(f.issueDate);
      const pdf = await renderInvoicePdf({
        invoiceNumber, issueDate: f.issueDate, dueDate: f.dueDate, billToName: f.billToName,
        billToAddress: f.billToAddress, lineDescription: f.lineDescription, amountExVat: f.amount, vatRate: f.vatRate,
      }, await assets());
      return json({ ok: true, invoice_number: invoiceNumber, filename: fileName({ invoice_number: invoiceNumber, bill_to_name: f.billToName }), pdf_base64: base64(pdf) });
    }

    // ── create (+ optional send) ───────────────────────────────────────────
    if (action === "create") {
      if (!canIssue) return json({ error: "Only an admin can raise invoices" }, 403);
      const f = readForm();
      const wantSend = body.send === true;
      if (wantSend && !EMAIL_RE.test(f.recipientEmail)) f.errors.push("A valid email address is needed to send the invoice");
      if (f.errors.length) return json({ error: f.errors[0], errors: f.errors }, 400);

      // Attach to a client profile. A brand-new name gets a minimal `pending`
      // profile so the PandaDoc webhook (which matches on email) and the
      // onboarding journey land on the same row later.
      let clientId = f.clientProfileId;
      if (clientId) {
        const { data: cp } = await svc.from("client_profiles").select("id").eq("id", clientId).maybeSingle();
        if (!cp) return json({ error: "That client no longer exists" }, 404);
        const patch: Record<string, unknown> = {};
        if (f.billToAddress) patch.billing_address = f.billToAddress;
        if (Object.keys(patch).length) await svc.from("client_profiles").update(patch).eq("id", clientId);
      } else if (body.create_client === true) {
        const { data: existing } = f.recipientEmail
          ? await svc.from("client_profiles").select("id").ilike("email", likeLiteral(f.recipientEmail)).order("created_at", { ascending: true }).limit(1).maybeSingle()
          : { data: null };
        if (existing) clientId = existing.id;
        else {
          const { data: created, error: cErr } = await svc.from("client_profiles").insert({
            company_name: f.billToName, email: f.recipientEmail || null, status: "pending",
            billing_address: f.billToAddress || null,
          }).select("id").single();
          if (cErr || !created) return json({ error: `Could not create the client: ${cErr?.message}` }, 500);
          clientId = created.id;
        }
      }

      const totals = computeInvoiceTotals(f.amount, f.vatRate);
      let row: InvoiceRow | null = null;
      // The number is unique; if two people raise one in the same second the
      // insert fails and we simply take the next free number.
      for (let attempt = 0; attempt < 5 && !row; attempt++) {
        const invoiceNumber = await nextNumber(f.issueDate);
        const { data, error } = await svc.from("invoices").insert({
          client_id: clientId, invoice_number: invoiceNumber, amount: totals.net, status: "draft",
          description: f.lineDescription, due_date: f.dueDate, created_by: user.id, issue_date: f.issueDate,
          vat_rate: totals.rate, vat_amount: totals.vat, total_amount: totals.total,
          bill_to_name: f.billToName, bill_to_address: f.billToAddress || null, line_description: f.lineDescription,
          recipient_email: f.recipientEmail || null, notes: f.notes,
        }).select("*").single();
        if (data) row = data as InvoiceRow;
        else if (!/duplicate|unique/i.test(error?.message || "")) return json({ error: `Could not save the invoice: ${error?.message}` }, 500);
      }
      if (!row) return json({ error: "Could not allocate an invoice number" }, 500);

      const pdf = await renderInvoicePdf(inputFromRow(row), await assets());
      const path = storagePath(row);
      const { error: upErr } = await svc.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (upErr) console.error("[client-invoices] upload failed", row.id, upErr.message);
      else await svc.from("invoices").update({ file_path: path }).eq("id", row.id);
      row.file_path = upErr ? null : path;

      let sentAt: string | null = null;
      let sendError: string | null = null;
      if (wantSend) {
        try { sentAt = await emailInvoice(row, pdf, f.recipientEmail); }
        catch (e) { sendError = e instanceof Error ? e.message : String(e); }
      }
      return json({ ok: true, invoice_id: row.id, invoice_number: row.invoice_number, client_id: clientId, sent_at: sentAt, send_error: sendError, filename: fileName(row) });
    }

    // ── send / resend ──────────────────────────────────────────────────────
    if (action === "send") {
      if (!canIssue) return json({ error: "Only an admin can send invoices" }, 403);
      const row = await loadInvoice(str(body.invoice_id));
      if (!row) return json({ error: "Invoice not found" }, 404);
      if (row.status === "cancelled") return json({ error: "This invoice is cancelled" }, 409);
      const to = (str(body.recipient_email) || row.recipient_email || "").toLowerCase();
      if (!EMAIL_RE.test(to)) return json({ error: "A valid email address is needed" }, 400);
      if (to !== row.recipient_email) await svc.from("invoices").update({ recipient_email: to }).eq("id", row.id);
      const { pdf } = await storedPdf(row);
      const sentAt = await emailInvoice(row, pdf, to);
      return json({ ok: true, sent_to: to, sent_at: sentAt });
    }

    // ── mark paid (+ optional Confirm paid on the onboarding journey) ──────
    if (action === "mark_paid") {
      const row = await loadInvoice(str(body.invoice_id));
      if (!row) return json({ error: "Invoice not found" }, 404);
      if (row.status === "cancelled") return json({ error: "A cancelled invoice cannot be paid" }, 409);
      const paidAt = isoDate(body.paid_at) ? `${isoDate(body.paid_at)}T12:00:00.000Z` : new Date().toISOString();
      if (row.status !== "paid") {
        const { error } = await svc.from("invoices").update({ status: "paid", paid_at: paidAt, paid_marked_by: user.id }).eq("id", row.id);
        if (error) return json({ error: error.message }, 500);
      }

      let onboarding: { confirmed: boolean; invite_sent?: boolean; sms_sent?: boolean; error?: string } | null = null;
      if (body.confirm_onboarding === true && row.client_id) {
        const { data: journey } = await svc.from("client_onboarding_journeys").select("id, status").eq("client_profile_id", row.client_id).maybeSingle();
        if (journey?.status === "awaiting_payment") {
          // Same door the PandaDoc webhook uses: the onboarding engine does the
          // provisioning and the welcome email, we just press its button.
          const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") || Deno.env.get("PANDADOC_ONBOARDING_WEBHOOK_SECRET") || "";
          const res = await fetch(`${supabaseUrl}/functions/v1/client-onboarding-admin`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "x-internal-secret": internalSecret },
            // actor_id: so the journey records WHO confirmed, not "nobody".
            body: JSON.stringify({ action: "confirm_paid", client_profile_id: row.client_id, actor_id: user.id }),
          });
          const j = await res.json().catch(() => ({}));
          onboarding = res.ok
            ? { confirmed: true, invite_sent: j.invite_sent === true, sms_sent: j.sms_sent === true }
            : { confirmed: false, error: j.error || `confirm_paid returned ${res.status}` };
        } else if (journey) {
          onboarding = { confirmed: false, error: `Onboarding is already ${journey.status}` };
        } else {
          onboarding = { confirmed: false, error: "No onboarding journey for this client yet" };
        }
      }
      return json({ ok: true, paid_at: paidAt, onboarding });
    }

    // ── cancel ─────────────────────────────────────────────────────────────
    if (action === "cancel") {
      if (!canIssue) return json({ error: "Only an admin can cancel invoices" }, 403);
      const row = await loadInvoice(str(body.invoice_id));
      if (!row) return json({ error: "Invoice not found" }, 404);
      if (row.status === "paid") return json({ error: "A paid invoice cannot be cancelled" }, 409);
      const { error } = await svc.from("invoices").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user.id }).eq("id", row.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── download ───────────────────────────────────────────────────────────
    if (action === "download") {
      const row = await loadInvoice(str(body.invoice_id));
      if (!row) return json({ error: "Invoice not found" }, 404);
      // Sign the stored file straight away; only redraw when it is missing.
      const sign = (path: string) => svc.storage.from(BUCKET).createSignedUrl(path, 600, { download: fileName(row) });
      let signed = row.file_path ? await sign(row.file_path) : { data: null, error: null };
      if (!signed.data?.signedUrl) {
        const { path } = await storedPdf({ ...row, file_path: null });
        signed = await sign(path);
      }
      if (!signed.data?.signedUrl) return json({ error: `Could not create a download link: ${signed.error?.message ?? "no file"}` }, 500);
      return json({ ok: true, url: signed.data.signedUrl, filename: fileName(row) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[client-invoices]", action, e);
    return json({ error: e instanceof Error ? e.message : "Something went wrong" }, 500);
  }
});
