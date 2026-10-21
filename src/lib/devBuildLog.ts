// Build log maths (15 Oct 2026). One place for: what a build saves per week,
// what it is worth in a month, and the two commission models.
//   Meridian:    hours saved × $10 (the owner's deal) + any per-tool fee charged that month.
//   Northgate Recruitment: no fixed terms, so only the fee entered on the build counts; hours
//              are shown for the record but not priced.

export type BuildClient = "vexon" | "northgate";
export type BillingModel = "hours" | "fee" | "both" | "unbilled";

export const CLIENT_LABEL: Record<BuildClient, string> = { vexon: "Meridian", northgate: "Northgate Recruitment" };
export const BILLING_LABEL: Record<BillingModel, string> = {
  hours: "Hours saved",
  fee: "Tool fee",
  both: "Hours + fee",
  unbilled: "Not billed",
};
export const KIND_OPTIONS = [
  { id: "application", label: "Tool" },
  { id: "automation", label: "Automation" },
  { id: "ai", label: "AI agent" },
  { id: "fix", label: "Fix" },
  { id: "site", label: "Website" },
] as const;
export const STATUS_OPTIONS = ["idea", "planned", "in_progress", "shipped", "archived"] as const;

export const HOURLY_RATE_USD = 10;
export const WEEKS_PER_MONTH = 4.3;

export interface BuildRow {
  id: string;
  title: string;
  description: string | null;
  stream: string;
  status: string;
  priority: string;
  client: BuildClient;
  replaced: string | null;
  billing_model: BillingModel;
  fee_amount: number | null;
  fee_currency: string;
  fee_month: string | null;
  rolled_out_date: string | null;
  owner: string | null;
  target_month: string | null;
  shipped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HoursRow {
  id: string;
  project_id: string;
  role_id: string | null;
  role_label: string | null;
  people_count: number;
  baseline_hours_week: number | null;
  new_hours_week: number | null;
  reported_hours_week: number | null;
  reported_by: string | null;
  reported_at: string | null;
  use_reported: boolean;
}

/** Rows read before the 15 Oct migration has run lack the new columns; fill the defaults so the UI never shows "undefined". */
export function normaliseBuild(b: Partial<BuildRow> & { id: string; title: string }): BuildRow {
  return {
    description: null, stream: "application", status: "planned", priority: "medium", replaced: null, fee_amount: null, fee_month: null,
    rolled_out_date: null, owner: null, target_month: null, shipped_at: null, created_at: "", updated_at: "",
    ...b,
    client: b.client === "northgate" ? "northgate" : "vexon",
    billing_model: (["hours", "fee", "both", "unbilled"] as const).includes(b.billing_model as BillingModel) ? (b.billing_model as BillingModel) : "hours",
    fee_currency: b.fee_currency ?? "USD",
  };
}

/** Hours saved per week for one role row: reported when trusted, else measured, times the people on it. */
export function savedPerWeek(h: HoursRow): number {
  const measured = (Number(h.baseline_hours_week) || 0) - (Number(h.new_hours_week) || 0);
  const base = h.use_reported && h.reported_hours_week != null ? Number(h.reported_hours_week) || 0 : measured;
  return Math.max(0, base) * Math.max(1, Number(h.people_count) || 1);
}

export function isLive(b: BuildRow): boolean {
  return !!b.rolled_out_date || b.status === "shipped";
}

/** First-of-month ISO date for a YYYY-MM string. */
export const monthStart = (ym: string) => `${ym}-01`;
export const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
};

export interface MonthReportLine {
  build: BuildRow;
  hoursWeek: number;
  hoursMonth: number;
  hoursValue: number;
  fee: number;
  total: number;
}

export interface MonthReport {
  client: BuildClient;
  month: string;
  lines: MonthReportLine[];
  hoursMonth: number;
  hoursValue: number;
  fees: number;
  total: number;
  currency: string;
}

/** The month's claim for one client: every build live by the end of the month contributes
 * its hours; every build whose fee_month is that month contributes its fee. */
export function monthReport(client: BuildClient, ym: string, builds: BuildRow[], hours: HoursRow[]): MonthReport {
  const end = monthEnd(ym);
  const lines: MonthReportLine[] = [];
  for (const b of builds) {
    if (b.client !== client) continue;
    const liveByEnd = isLive(b) && (!b.rolled_out_date || b.rolled_out_date <= end);
    const countsHours = liveByEnd && (b.billing_model === "hours" || b.billing_model === "both");
    const hoursWeek = countsHours ? hours.filter((h) => h.project_id === b.id).reduce((s, h) => s + savedPerWeek(h), 0) : 0;
    const hoursMonth = hoursWeek * WEEKS_PER_MONTH;
    const hoursValue = client === "vexon" ? hoursMonth * HOURLY_RATE_USD : 0;
    const feeDue = (b.billing_model === "fee" || b.billing_model === "both") && b.fee_month && b.fee_month.slice(0, 7) === ym;
    const fee = feeDue ? Number(b.fee_amount) || 0 : 0;
    if (hoursWeek === 0 && fee === 0 && !liveByEnd) continue;
    lines.push({ build: b, hoursWeek, hoursMonth, hoursValue, fee, total: hoursValue + fee });
  }
  lines.sort((a, b) => b.total - a.total);
  const hoursMonth = lines.reduce((s, l) => s + l.hoursMonth, 0);
  const hoursValue = lines.reduce((s, l) => s + l.hoursValue, 0);
  const fees = lines.reduce((s, l) => s + l.fee, 0);
  const currency = lines.find((l) => l.fee > 0)?.build.fee_currency ?? "USD";
  return { client, month: ym, lines, hoursMonth, hoursValue, fees, total: hoursValue + fees, currency };
}

export const money = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

export const round1 = (n: number) => Math.round(n * 10) / 10;

export const thisMonth = () => new Date().toISOString().slice(0, 7);

export function reportCsv(r: MonthReport): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Build", "Replaced", "Live since", "Billing", "Hours saved / week", "Hours saved / month", "Hours value", "Fee", "Total"];
  const rows = r.lines.map((l) => [
    l.build.title, l.build.replaced ?? "", l.build.rolled_out_date ?? "", BILLING_LABEL[l.build.billing_model],
    round1(l.hoursWeek), round1(l.hoursMonth), l.hoursValue.toFixed(2), l.fee.toFixed(2), l.total.toFixed(2),
  ]);
  rows.push(["Total", "", "", "", "", round1(r.hoursMonth), r.hoursValue.toFixed(2), r.fees.toFixed(2), r.total.toFixed(2)]);
  return [head, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}
