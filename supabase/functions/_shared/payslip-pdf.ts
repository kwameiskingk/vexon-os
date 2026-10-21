// Payslip PDF (moved out of payslip-send on 6 Oct 2026 so it can be rendered
// and reviewed on its own).
//
// 6 Oct (Marcus, via Elena): the payslip must look official, like a
// standard UK payroll slip ("boring and professional"), not bright and
// branded. Layout follows the Sage-style grid Elena shared: solid header
// bars over grey cells, a three-column body and a totals strip with the net
// pay boxed. Our brand ink replaces their navy. Left out on purpose: NI
// number and table, tax code, payment method and the year-to-date column
// (contractors: no PAYE, no NI). The left column carries employee details
// instead.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { LEGAL_ENTITY, LEGAL_LINE } from "./legalEntity.ts";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

export interface Line { label: string; amount: number }

export interface PayslipRow {
  id: string;
  user_id: string | null;
  month: number;
  year: number;
  employee_name: string | null;
  employee_email: string | null;
  designation: string | null;
  currency: "USD" | "GBP";
  pay_date: string | null;
  base_salary: number;
  commission: number;
  bonuses: Line[] | null;
  deductions: Line[] | null;
  notes: string | null;
  payslip_no: string | null;
  status: string;
  days_worked: number | null;
  leave_balance: number | null;
}

// Twin of src/lib/payslip.ts computePayslip — keep in step by hand.
const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const sumLines = (lines: Line[]) => round2(lines.reduce((a, l) => a + (Number(l.amount) || 0), 0));
export function computePayslip(row: PayslipRow) {
  const base = round2(Number(row.base_salary) || 0);
  const commission = round2(Number(row.commission) || 0);
  const bonuses = Array.isArray(row.bonuses) ? row.bonuses : [];
  const deductions = Array.isArray(row.deductions) ? row.deductions : [];
  const bonusesTotal = sumLines(bonuses);
  const deductionsTotal = sumLines(deductions);
  const baseAfterDeductions = round2(base - deductionsTotal);
  const grossEarnings = round2(base + commission + bonusesTotal);
  const netPay = round2(baseAfterDeductions + commission + bonusesTotal);
  return { base, commission, bonuses, deductions, bonusesTotal, deductionsTotal, baseAfterDeductions, grossEarnings, netPay };
}

export function money(amount: number, currency: string) {
  const locale = currency === "GBP" ? "en-GB" : "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(amount || 0);
  } catch {
    return `${(amount || 0).toFixed(2)} ${currency}`;
  }
}

/** 28/09/2026, as on a UK payslip. */
function ukDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
// Brand ink family: the bars are a step lighter than the ink so white text
// reads; cells are a cool grey with a hint of the brand lilac.
const BAR = hex("#1a1a1d");
const INK = hex("#0f0f11");
const MUTED = hex("#5f5f66");
const CELL = hex("#EEEDF4");
const RULE = hex("#1a1a1d");
const WHITE = rgb(1, 1, 1);

const LOGO_URL = "https://vexon-os.example/brand/vexon-logo-dark.png";
async function fetchLogo(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function renderPdf(row: PayslipRow): Promise<Uint8Array> {
  const t = computePayslip(row);
  const cur = row.currency || "USD";
  const period = `${MONTHS[row.month - 1] ?? row.month} ${row.year}`;

  const doc = await PDFDocument.create();
  doc.setTitle(`Payslip ${period} - ${row.employee_name ?? ""}`);
  doc.setAuthor(LEGAL_ENTITY.name);
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = page.getWidth();
  const H = page.getHeight();
  const M = 36;
  const X0 = M, X1 = W - M, TW = X1 - X0;

  // The standard fonts only know WinAnsi; swap anything else for "?".
  const safe = (s: string) => String(s ?? "").replace(/[^\u0000-ÿ–—‘’“”•…€]/g, "?");
  const text = (s: string, x: number, y: number, size = 9.5, f: PDFFont = font, color = INK) =>
    page.drawText(safe(s), { x, y, size, font: f, color });
  const right = (s: string, xr: number, y: number, size = 9.5, f: PDFFont = font, color = INK) => {
    const v = safe(s);
    page.drawText(v, { x: xr - f.widthOfTextAtSize(v, size), y, size, font: f, color });
  };
  const centre = (s: string, xl: number, xr: number, y: number, size = 9.5, f: PDFFont = font, color = INK) => {
    const v = safe(s);
    page.drawText(v, { x: xl + (xr - xl - f.widthOfTextAtSize(v, size)) / 2, y, size, font: f, color });
  };
  const fit = (s: string, width: number, size: number, f: PDFFont = font) => {
    let v = safe(s);
    if (f.widthOfTextAtSize(v, size) <= width) return v;
    while (v.length > 1 && f.widthOfTextAtSize(v + "…", size) > width) v = v.slice(0, -1);
    return v + "…";
  };
  const rect = (x: number, y: number, w: number, h: number, color = CELL) =>
    page.drawRectangle({ x, y, width: w, height: h, color });
  const vline = (x: number, yTop: number, yBot: number) =>
    page.drawLine({ start: { x, y: yTop }, end: { x, y: yBot }, thickness: 0.6, color: RULE });

  // ── Masthead: small logo, title, company. Plain, no colour band.
  let y = H - M;
  const logoBytes = await fetchLogo();
  const logo = logoBytes ? await doc.embedPng(logoBytes).catch(() => null) : null;
  if (logo) {
    const lw = 92, lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: X0, y: y - lh, width: lw, height: lh });
  } else {
    text("Meridian", X0, y - 16, 16, bold);
  }
  right("PAYSLIP", X1, y - 14, 15, bold);
  right(period, X1, y - 28, 9.5, font, MUTED);
  y -= 46;

  // ── Header grid: two bars of labels over value cells (like the sample).
  const BAR_H = 15, VAL_H = 22;
  const headerRow = (cols: Array<{ label: string; value: string; w: number }>) => {
    rect(X0, y - BAR_H, TW, BAR_H, BAR);
    rect(X0, y - BAR_H - VAL_H, TW, VAL_H, CELL);
    let x = X0;
    cols.forEach((c, i) => {
      centre(c.label, x, x + c.w, y - BAR_H + 4.5, 7.5, bold, WHITE);
      centre(fit(c.value || "—", c.w - 10, 10), x, x + c.w, y - BAR_H - 14.5, 10);
      if (i > 0) vline(x, y - BAR_H, y - BAR_H - VAL_H);
      x += c.w;
    });
    y -= BAR_H + VAL_H;
  };
  headerRow([
    { label: "EMPLOYER", value: LEGAL_ENTITY.name, w: TW * 0.36 },
    { label: "EMPLOYEE NAME", value: row.employee_name ?? "", w: TW * 0.42 },
    { label: "PAY DATE", value: ukDate(row.pay_date), w: TW * 0.22 },
  ]);
  headerRow([
    { label: "DEPARTMENT", value: row.designation ?? "", w: TW * 0.36 },
    { label: "PAYSLIP NO.", value: row.payslip_no ?? "", w: TW * 0.21 },
    { label: "PAY PERIOD", value: period, w: TW * 0.21 },
    { label: "CURRENCY", value: cur, w: TW * 0.22 },
  ]);

  // ── Body: employee details | earnings | deductions.
  const C1 = TW * 0.27, C2 = TW * 0.38, C3 = TW - C1 - C2;
  const xa = X0, xb = X0 + C1, xc = X0 + C1 + C2;
  rect(X0, y - BAR_H, TW, BAR_H, BAR);
  centre("EMPLOYEE DETAILS", xa, xb, y - BAR_H + 4.5, 7.5, bold, WHITE);
  centre("EARNINGS", xb, xc, y - BAR_H + 4.5, 7.5, bold, WHITE);
  centre("DEDUCTIONS", xc, X1, y - BAR_H + 4.5, 7.5, bold, WHITE);
  y -= BAR_H;

  const earnings: Array<[string, number]> = [["Basic pay", t.base]];
  if (t.commission) earnings.push(["Commission", t.commission]);
  for (const b of t.bonuses) earnings.push([b.label || "Bonus", Number(b.amount) || 0]);
  const deductions: Array<[string, number]> = t.deductions.map((d) => [d.label || "Deduction", Number(d.amount) || 0]);
  const details: Array<[string, string]> = [["Email", row.employee_email ?? ""]];
  if (row.days_worked != null) details.push(["Days worked", String(Number(row.days_worked))]);
  if (row.leave_balance != null) details.push(["Leave balance", `${Number(row.leave_balance)} days`]);

  const LINE_H = 15;
  const bodyRows = Math.max(9, earnings.length, deductions.length + (t.deductionsTotal > 0 ? 3 : 1), details.length * 2 + 1);
  const bodyH = bodyRows * LINE_H + 12;
  rect(X0, y - bodyH, TW, bodyH, CELL);
  vline(xb, y, y - bodyH);
  vline(xc, y, y - bodyH);

  let ly = y - 16;
  for (const [k, v] of details) {
    text(k.toUpperCase(), xa + 8, ly, 7, bold, MUTED);
    ly -= 11;
    text(fit(v || "—", C1 - 16, 9), xa + 8, ly, 9);
    ly -= LINE_H + 2;
  }
  let ey = y - 16;
  for (const [k, v] of earnings) {
    text(fit(k, C2 - 90, 9.5), xb + 8, ey, 9.5);
    right(money(v, cur), xc - 8, ey, 9.5);
    ey -= LINE_H;
  }
  let dy = y - 16;
  if (deductions.length === 0) {
    text("None this period", xc + 8, dy, 9.5, font, MUTED);
    dy -= LINE_H;
  }
  for (const [k, v] of deductions) {
    text(fit(k, C3 - 90, 9.5), xc + 8, dy, 9.5);
    right(money(v, cur), X1 - 8, dy, 9.5);
    dy -= LINE_H;
  }
  if (t.deductionsTotal > 0) {
    dy -= 4;
    text("Taken from basic pay only.", xc + 8, dy, 7.5, font, MUTED);
    dy -= LINE_H;
    text("Basic pay after deductions", xc + 8, dy, 9);
    right(money(t.baseAfterDeductions, cur), X1 - 8, dy, 9, bold);
  }
  y -= bodyH;

  // ── Totals strip: dark label cells, white value cells, net pay boxed.
  const SH = 30;
  const cells = [
    { label: "TOTAL EARNINGS", value: money(t.grossEarnings, cur) },
    { label: "TOTAL DEDUCTIONS", value: money(t.deductionsTotal, cur) },
    { label: "NET PAY", value: money(t.netPay, cur), strong: true },
  ];
  const cw = TW / cells.length;
  cells.forEach((c, i) => {
    const x = X0 + i * cw;
    const lw = cw * 0.5;
    rect(x, y - SH, lw, SH, BAR);
    rect(x + lw, y - SH, cw - lw, SH, WHITE);
    centre(c.label, x, x + lw, y - SH / 2 - 2.5, 7, bold, WHITE);
    centre(c.value, x + lw, x + cw, y - SH / 2 - 3.5, c.strong ? 11.5 : 10, c.strong ? bold : font);
  });
  page.drawRectangle({ x: X0, y: y - SH, width: TW, height: SH, borderColor: RULE, borderWidth: 0.8 });
  // Outer frame round the whole grid.
  const gridTop = H - M - 46;
  page.drawRectangle({ x: X0, y: y - SH, width: TW, height: gridTop - (y - SH), borderColor: RULE, borderWidth: 0.8 });
  y -= SH + 10;

  right(
    t.deductionsTotal > 0
      ? "Net pay = basic pay after deductions + commission + bonuses"
      : "Net pay = basic pay + commission + bonuses",
    X1, y, 7.5, font, MUTED,
  );
  y -= 18;

  if (row.notes && row.notes.trim()) {
    const words = safe(row.notes.trim()).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(cand, 9) > TW - 16) { lines.push(line); line = w; } else line = cand;
    }
    if (line) lines.push(line);
    const nh = BAR_H + lines.length * 12 + 10;
    rect(X0, y - BAR_H, TW, BAR_H, BAR);
    text("NOTES", X0 + 8, y - BAR_H + 4.5, 7.5, bold, WHITE);
    rect(X0, y - nh, TW, nh - BAR_H, CELL);
    page.drawRectangle({ x: X0, y: y - nh, width: TW, height: nh, borderColor: RULE, borderWidth: 0.8 });
    let ny = y - BAR_H - 13;
    for (const l of lines) { text(l, X0 + 8, ny, 9); ny -= 12; }
    y -= nh + 12;
  }

  // Footer
  page.drawLine({ start: { x: X0, y: 52 }, end: { x: X1, y: 52 }, thickness: 0.5, color: CELL });
  text("Generated by Vexon OS. Questions about this payslip: accounts@meridiansales.example", X0, 40, 7.5, font, MUTED);
  text(LEGAL_LINE, X0, 29, 7, font, MUTED);

  return await doc.save();
}
