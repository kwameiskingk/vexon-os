// Client invoice PDF (9 Oct 2026, Marcus's ask on the 8 Oct EOD call).
//
// This is Marcus's Google Doc "*MAKE A COPY* Invoice Template" drawn as a
// PDF, nothing more. the owner, 9 Oct: "take the actual template… don't recreate
// it, and don't make it any different." Every position below comes from the
// .docx itself (Letter page, 0.5in margins, Roboto 9pt / Merriweather Black
// 20pt, two tables with 1pt black borders, the logo anchored top-right) and
// was checked against the doc on screen in the call recording. If the
// template changes, change the constants here, not the callers.
//
// Fonts and the logo are the files embedded in that .docx, served from
// vexon-os.example/brand/invoice (public/brand/invoice in the repo). If any of
// them cannot be fetched the standard fonts stand in so an invoice is never
// blocked by a missing asset — but it will not look identical.

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "https://esm.sh/pdf-lib@1.17.1";
import * as fontkitModule from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
// esm.sh exposes fontkit as a default export at runtime; its .d.ts says otherwise.
// deno-lint-ignore no-explicit-any
const fontkit = ((fontkitModule as any).default ?? fontkitModule) as Parameters<PDFDocument["registerFontkit"]>[0];

export const INVOICE_ISSUER = {
  // the owner, 9 Oct (after the first live test): the trading name is Meridian now,
  // not Meridian Sales Partners as the old template read. Registered entity is
  // Meridian Sales Partners Ltd (legalEntity.ts); the footer numbers below are that company's.
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

export const DEFAULT_LINE_DESCRIPTION = "Lead Generation Monthly Retainer";
export const DEFAULT_VAT_RATE = 20;

export interface InvoiceInput {
  invoiceNumber: string;
  /** YYYY-MM-DD */
  issueDate: string;
  /** YYYY-MM-DD */
  dueDate: string;
  billToName: string;
  /** Free text, one line per address line. */
  billToAddress: string;
  lineDescription: string;
  /** Pounds, excluding VAT. */
  amountExVat: number;
  /** Percent, e.g. 20. */
  vatRate: number;
}

export interface InvoiceAssets {
  robotoRegular?: Uint8Array | null;
  robotoBold?: Uint8Array | null;
  merriweatherBlack?: Uint8Array | null;
  logoPng?: Uint8Array | null;
}

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

// Twin of src/lib/invoices/invoiceMaths.ts — keep in step by hand.
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

/** 2026-10-09 → 20261009. Marcus, 9 Oct: one number, no slashes (slashes read as a date). */
export function invoiceNumberBase(issueDate: string): string {
  return String(issueDate ?? "").slice(0, 10).replace(/-/g, "");
}

/** 2026-10-09 → 09/10/2026 (the template's UK date). */
export function ukDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

export async function loadInvoiceAssets(base?: string): Promise<InvoiceAssets> {
  const root = (base || Deno.env.get("INVOICE_ASSET_BASE") || "https://vexon-os.example/brand/invoice").replace(/\/$/, "");
  const get = async (file: string): Promise<Uint8Array | null> => {
    try {
      const res = await fetch(`${root}/${file}`);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  };
  const [robotoRegular, robotoBold, merriweatherBlack, logoPng] = await Promise.all([
    get("Roboto-Regular.ttf"), get("Roboto-Bold.ttf"), get("MerriweatherBlack.ttf"), get("vexon-logo.png"),
  ]);
  return { robotoRegular, robotoBold, merriweatherBlack, logoPng };
}

// ── Template geometry (points, measured from the top-left of the page) ─────
const PAGE_W = 612, PAGE_H = 792;      // US Letter, as the .docx
const M = 36;                          // 0.5in margins
const X0 = M, X1 = PAGE_W - M;         // 36 … 576
const BODY = 9;                        // Roboto 9pt everywhere except the title
const LINE = 12.4;                     // 9pt Roboto at Word's 1.15 line spacing
const TITLE_SIZE = 20;                 // Merriweather Black
const BLACK = rgb(0, 0, 0);
const HEADER_FILL = rgb(0xd9 / 255, 0xd9 / 255, 0xd9 / 255);
const COL2_X = 428;                    // second column of the header section ("Bill to")
const VALUE_X = 102;                   // where the invoice number / dates start
const T1_TOP = 258.7, T1_ROW = 22.3, T1_SPLIT = X0 + 456, T1_PAD = 5;
const T2_TOP = 459.4, T2_FIRST_ROW = 23.8, T2_ROW = 12, T2_SPLIT = X0 + 147, T2_PAD = 5.4;

export async function renderInvoicePdf(input: InvoiceInput, assets: InvoiceAssets = {}): Promise<Uint8Array> {
  const totals = computeInvoiceTotals(input.amountExVat, input.vatRate);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Invoice ${input.invoiceNumber}`);
  doc.setAuthor(INVOICE_BANK.name);
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const embed = async (bytes: Uint8Array | null | undefined, fallback: StandardFonts): Promise<PDFFont> => {
    if (bytes && bytes.length > 0) {
      try {
        return await doc.embedFont(bytes, { subset: true });
      } catch (e) {
        console.error("[client-invoice-pdf] font embed failed, using standard font", e);
      }
    }
    return doc.embedFont(fallback);
  };
  const regular = await embed(assets.robotoRegular, StandardFonts.Helvetica);
  const bold = await embed(assets.robotoBold, StandardFonts.HelveticaBold);
  const title = await embed(assets.merriweatherBlack, StandardFonts.TimesRomanBold);
  const usingStandard = !assets.robotoRegular;
  // Standard fonts only know WinAnsi; the embedded Roboto knows much more.
  const safe = (s: string) => usingStandard ? String(s ?? "").replace(/[^\u0000-ÿ–—‘’“”•…€]/g, "?") : String(s ?? "");

  const Y = (top: number) => PAGE_H - top;
  const text = (s: string, x: number, top: number, f: PDFFont = regular, size = BODY) =>
    page.drawText(safe(s), { x, y: Y(top), size, font: f, color: BLACK });
  const right = (s: string, xr: number, top: number, f: PDFFont = regular, size = BODY) => {
    const v = safe(s);
    page.drawText(v, { x: xr - f.widthOfTextAtSize(v, size), y: Y(top), size, font: f, color: BLACK });
  };
  const hline = (x1: number, x2: number, top: number, thickness = 1) =>
    page.drawLine({ start: { x: x1, y: Y(top) }, end: { x: x2, y: Y(top) }, thickness, color: BLACK });
  const vline = (x: number, top: number, bottom: number, thickness = 1) =>
    page.drawLine({ start: { x, y: Y(top) }, end: { x, y: Y(bottom) }, thickness, color: BLACK });
  const wrap = (s: string, width: number, f: PDFFont = regular, size = BODY): string[] => {
    const out: string[] = [];
    for (const raw of String(s ?? "").split(/\r?\n/)) {
      const words = raw.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { continue; }
      let line = "";
      for (const w of words) {
        const probe = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(safe(probe), size) <= width || !line) line = probe;
        else { out.push(line); line = w; }
      }
      if (line) out.push(line);
    }
    return out;
  };

  // ── Title + logo ──────────────────────────────────────────────────────────
  text("Invoice", X0, 54, title, TITLE_SIZE);
  const logo = assets.logoPng ? await doc.embedPng(assets.logoPng).catch(() => null) : null;
  if (logo) {
    // The .docx anchors a 265.5×51.75pt frame at (344.25, 24.6) with the
    // picture inset 1.7% left / 6.7% right; drawn at the picture's own ratio.
    const w = 243;
    const h = w * (logo.height / logo.width);
    const centreTop = 47.5;
    page.drawImage(logo, { x: 348.6, y: Y(centreTop + h / 2), width: w, height: h });
  } else {
    right("Meridian", X1, 54, bold, 20);
  }

  // ── Invoice number + dates (left column) ──────────────────────────────────
  let top = 84;
  text("Invoice Number", X0, top, bold); text(input.invoiceNumber, VALUE_X, top, bold);
  top += LINE; text("Date of issue", X0, top); text(ukDate(input.issueDate), VALUE_X, top);
  top += LINE; text("Date Due", X0, top); text(ukDate(input.dueDate), VALUE_X, top);

  // ── Issuer address (left) and Bill to (right column) ──────────────────────
  top = 133.2;
  text(INVOICE_ISSUER.name, X0, top, bold);
  for (const line of INVOICE_ISSUER.addressLines) { top += LINE; text(line, X0, top); }

  // the owner, 9 Oct: "Bill to" sits on the same line as the issuer name, not
  // one line down as the old template had it.
  let billTop = top - LINE * INVOICE_ISSUER.addressLines.length;
  text("Bill to", COL2_X, billTop, bold);
  const billWidth = X1 - COL2_X;
  for (const line of wrap(input.billToName, billWidth, bold)) { billTop += LINE; text(line, COL2_X, billTop, bold); }
  for (const line of wrap(input.billToAddress, billWidth)) { billTop += LINE; text(line, COL2_X, billTop); }

  // ── Items table ───────────────────────────────────────────────────────────
  const vatLabel = `VAT (${Number.isInteger(totals.rate) ? totals.rate : totals.rate.toFixed(1)}%)`;
  const descLines = wrap(input.lineDescription || DEFAULT_LINE_DESCRIPTION, T1_SPLIT - X0 - 2 * T1_PAD);
  const descRowH = Math.max(T1_ROW, 2 * T1_PAD + 1.2 + descLines.length * (LINE - 1.5));
  const rows: Array<{ h: number; fill?: boolean; draw: (rowTop: number) => void }> = [
    { h: T1_ROW, fill: true, draw: (t) => { text("Item Description", X0 + T1_PAD, t + 14.5); text("Amount", T1_SPLIT + T1_PAD, t + 14.5); } },
    { h: descRowH, draw: (t) => {
      descLines.forEach((l, i) => text(l, X0 + T1_PAD, t + 14.5 + i * (LINE - 1.5)));
      right(fmtGBP(totals.net), X1 - T1_PAD, t + 14.5);
    } },
    { h: T1_ROW, draw: (t) => { text(vatLabel, X0 + T1_PAD, t + 14.5); right(fmtGBP(totals.vat), X1 - T1_PAD, t + 14.5); } },
    { h: T1_ROW, draw: (t) => {
      right("Total Due", T1_SPLIT - T1_PAD, t + 14.5, bold);
      // Template: the £ sign is regular weight, the figure is bold.
      const figure = fmtGBP(totals.total).slice(1);
      const figureW = bold.widthOfTextAtSize(figure, BODY);
      page.drawText(figure, { x: X1 - T1_PAD - figureW, y: Y(t + 14.5), size: BODY, font: bold, color: BLACK });
      page.drawText(safe("£"), { x: X1 - T1_PAD - figureW - regular.widthOfTextAtSize(safe("£"), BODY), y: Y(t + 14.5), size: BODY, font: regular, color: BLACK });
    } },
  ];
  let rowTop = T1_TOP;
  for (const r of rows) {
    if (r.fill) page.drawRectangle({ x: X0, y: Y(rowTop + r.h), width: X1 - X0, height: r.h, color: HEADER_FILL });
    r.draw(rowTop);
    hline(X0, X1, rowTop);
    rowTop += r.h;
  }
  const t1Bottom = rowTop;
  hline(X0, X1, t1Bottom);
  vline(X0, T1_TOP, t1Bottom); vline(T1_SPLIT, T1_TOP, t1Bottom); vline(X1, T1_TOP, t1Bottom);

  // ── Wire instructions ─────────────────────────────────────────────────────
  // Marcus, 9 Oct (after the first live invoice): the "Being the sum of" line
  // and the amount in words are gone; the bank block moves up to take their
  // place. Everything below the items table keeps its distance from it, so a
  // long description pushes the rest down rather than overlapping.
  const shift = t1Bottom - (T1_TOP + 4 * T1_ROW) - 62;
  text("Please wire funds to our banking instructions:", X0, 431 + shift);

  // ── Bank table ────────────────────────────────────────────────────────────
  const bank: Array<[string, string]> = [
    ["Name", INVOICE_BANK.name],
    ["Account Type", INVOICE_BANK.accountType],
    ["Account Number", INVOICE_BANK.accountNumber],
    ["Sort Code", INVOICE_BANK.sortCode],
    ["IBAN", INVOICE_BANK.iban],
    ["SWIFT BIC", INVOICE_BANK.swift],
  ];
  const t2Top = T2_TOP + shift;
  let bTop = t2Top;
  bank.forEach(([k, v], i) => {
    const h = i === 0 ? T2_FIRST_ROW : T2_ROW;
    hline(X0, X1, bTop);
    text(k, X0 + T2_PAD, bTop + (i === 0 ? 9.2 : 9));
    text(v, T2_SPLIT + T2_PAD, bTop + (i === 0 ? 9.2 : 9));
    bTop += h;
  });
  hline(X0, X1, bTop);
  vline(X0, t2Top, bTop); vline(T2_SPLIT, t2Top, bTop); vline(X1, t2Top, bTop);

  // ── Footer (page footer in the .docx: 0.5in from the bottom edge) ─────────
  text(`Company Registration Number: ${INVOICE_ISSUER.companyNumber}`, X0, 741.4);
  text(`VAT Registration Number: ${INVOICE_ISSUER.vatNumber}`, X0, 753.8);

  return doc.save();
}
