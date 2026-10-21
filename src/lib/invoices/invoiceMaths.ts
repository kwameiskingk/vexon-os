// Browser twin of supabase/functions/_shared/client-invoice-pdf.ts (the edge
// runtime cannot import from src/). Keep the maths and wording in step by
// hand — the live preview on the Invoices page must show exactly what the
// PDF will say.

export const DEFAULT_LINE_DESCRIPTION = "Lead Generation Monthly Retainer";
export const DEFAULT_VAT_RATE = 20;

export const INVOICE_ISSUER = {
  name: "Meridian",
  addressLines: ["1 Example Street", "Example District", "London", "United Kingdom", "EC1A 1AA"],
  companyNumber: "00000000",
  vatNumber: "GB000000000",
} as const;

export const INVOICE_BANK = {
  name: "MERIDIAN SALES PARTNERS LTD",
  accountType: "Business",
  accountNumber: "00000000",
  sortCode: "00-00-00",
  iban: "GB00EXMP00000000000000",
  swift: "EXMPGB2L",
} as const;

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function computeInvoiceTotals(amountExVat: number, vatRate: number) {
  const net = round2(Number(amountExVat) || 0);
  const rate = Number.isFinite(vatRate) ? Math.max(0, Number(vatRate)) : 0;
  const vat = round2(net * rate / 100);
  const total = round2(net + vat);
  return { net, rate, vat, total };
}

export function fmtGBP(n: number): string {
  const v = round2(n);
  const [whole, frac] = Math.abs(v).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${v < 0 ? "-" : ""}£${grouped}.${frac}`;
}

/** 2026-10-09 → 09/10/2026 */
export function ukDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/** 2026-10-09 → 20261009. Marcus, 9 Oct: one number, no slashes (slashes read as a date). */
export function invoiceNumberBase(issueDate: string): string {
  return String(issueDate ?? "").slice(0, 10).replace(/-/g, "");
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};
