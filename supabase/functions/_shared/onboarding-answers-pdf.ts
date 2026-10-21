// Client onboarding form answers as a PDF in the client's Documents
// (the owner, 6 Oct 2026): "when a client completes the onboarding forms in the
// client onboarding deck, a saved document (PDF) of the questions and the
// client's answers must appear in the Documents section of that client's
// profile".
//
// One file per form card, overwritten when the client edits their answers:
//   storage  receipts/<client_profile_id>/onboarding/<step_key>.pdf
//   row      client_receipts (document_category 'onboarding_form'), one per
//            file_path, updated in place on a rebuild
// The existing receipts policies already give staff (is_admin_role) and the
// client themself read access; nothing new is granted.
//
// Styled like the deck's form card: soft lilac page, white question cards,
// answer "fields" with a lilac border, ink type, the brand band on top.
// pdf-lib is drawn server-side so the file is the same wherever it is opened.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { LEGAL_LINE } from "./legalEntity.ts";

// deno-lint-ignore no-explicit-any
type Svc = any;

export interface AnswerQuestion {
  key: string;
  label: string;
  type?: string;
  section?: string;
  help?: string;
  show_when?: { key: string; equals?: string; not_equals?: string };
}

export interface AnswersPdfInput {
  companyName: string;
  contactName?: string | null;
  cardTitle: string;
  submittedAt: Date;
  questions: AnswerQuestion[];
  sections?: string[];
  answers: Record<string, unknown>;
}

const LOGO_URL = "https://vexon-os.example/brand/vexon-logo-white.png";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex("#0f0f11");
const MUTED = hex("#5f5f66");
const ACCENT = hex("#5a5a5a");
const PAGE_BG = hex("#f5f5f6");
const FIELD_BG = hex("#fafafa");
const FIELD_LINE = hex("#E4DCF5");
const CARD_LINE = hex("#ECE7F7");
const WHITE = rgb(1, 1, 1);
const GRAD_BRAND = ["#dedede", "#9e9e9e", "#6b7a90"];

function mix(a: string, b: string, t: number) {
  const c = (i: number) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t);
  return rgb(c(1) / 255, c(3) / 255, c(5) / 255);
}
function gradientRect(page: PDFPage, x: number, y: number, w: number, h: number, stops: string[]) {
  const n = 64;
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const seg = t < 0.5 ? mix(stops[0], stops[1], t * 2) : mix(stops[1], stops[2], (t - 0.5) * 2);
    page.drawRectangle({ x: x + i * sw, y, width: sw + 0.6, height: h, color: seg });
  }
}

/** Answers are strings, lists (tick boxes) or objects (full name, address). */
export function answerText(v: unknown, type?: string): string {
  if (v == null) return "";
  const sep = type === "fullname" ? " " : ", ";
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>).map((x) => String(x ?? "").trim()).filter(Boolean).join(sep);
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v).trim();
}

/** Mirrors the deck: a question with show_when is only asked when it matches. */
function isShown(q: AnswerQuestion, answers: Record<string, unknown>): boolean {
  const rule = q.show_when;
  if (!rule) return true;
  const raw = answers[rule.key];
  const values = Array.isArray(raw) ? raw.map(String) : raw == null ? [] : [String(raw)];
  if (rule.equals != null) return values.includes(rule.equals);
  if (rule.not_equals != null) return !values.includes(rule.not_equals);
  return true;
}

function longDate(d: Date) {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

async function fetchLogo(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function renderAnswersPdf(input: AnswersPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${input.cardTitle} - ${input.companyName}`);
  doc.setAuthor("Meridian Sales Partners Ltd");
  doc.setSubject("Client onboarding answers");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await fetchLogo();
  const logo = logoBytes ? await doc.embedPng(logoBytes).catch(() => null) : null;

  const PW = 595.28, PH = 841.89, M = 40;
  const CX = M, CW = PW - 2 * M;      // card box
  const IX = CX + 20, IW = CW - 40;   // content inside the card
  const FOOT = 56;

  // The standard fonts only know WinAnsi; swap anything else for "?".
  const safe = (s: string) => String(s ?? "").replace(/[^\u0000-ÿ–—‘’“”•…€]/g, "?");
  const wrap = (s: string, f: PDFFont, size: number, width: number): string[] => {
    const out: string[] = [];
    for (const para of safe(s).split(/\r?\n/)) {
      const words = para.split(/\s+/).filter(Boolean);
      if (words.length === 0) { out.push(""); continue; }
      let line = "";
      for (let w of words) {
        // Break a single over-long word (a URL) across lines.
        while (f.widthOfTextAtSize(w, size) > width) {
          let cut = w.length - 1;
          while (cut > 1 && f.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
          if (line) { out.push(line); line = ""; }
          out.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        const cand = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(cand, size) > width) { out.push(line); line = w; } else line = cand;
      }
      if (line) out.push(line);
    }
    return out;
  };

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = (first: boolean) => {
    page = doc.addPage([PW, PH]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: PAGE_BG });
    if (first) {
      gradientRect(page, 0, PH - 92, PW, 92, GRAD_BRAND);
      if (logo) {
        const lw = 112, lh = (logo.height / logo.width) * lw;
        page.drawImage(logo, { x: M, y: PH - 46 - lh / 2, width: lw, height: lh });
      } else {
        page.drawText("Meridian", { x: M, y: PH - 54, size: 22, font: bold, color: WHITE });
      }
      const eyebrow = "CLIENT ONBOARDING";
      page.drawText(eyebrow, { x: PW - M - bold.widthOfTextAtSize(eyebrow, 9), y: PH - 50, size: 9, font: bold, color: WHITE });
      y = PH - 92 - 30;
    } else {
      gradientRect(page, 0, PH - 6, PW, 6, GRAD_BRAND);
      y = PH - 36;
    }
  };
  const ensure = (h: number) => { if (y - h < FOOT) newPage(false); };
  const text = (s: string, x: number, yy: number, size: number, f: PDFFont, color = INK) =>
    page.drawText(safe(s), { x, y: yy, size, font: f, color });

  newPage(true);

  // Title block, like the deck card heading.
  for (const l of wrap(input.cardTitle, bold, 20, CW)) { text(l, CX, y, 20, bold); y -= 24; }
  y -= 2;
  text(input.companyName, CX, y, 11, bold, MUTED); y -= 15;
  const who = input.contactName ? `Submitted by ${input.contactName}, ` : "Submitted ";
  text(`${who}${longDate(input.submittedAt)}`, CX, y, 9.5, font, MUTED);
  y -= 24;

  // Group by section in the form's own order; unsectioned questions first.
  const shown = input.questions.filter((q) => isShown(q, input.answers));
  const order = [undefined, ...(input.sections ?? [])];
  for (const q of shown) if (q.section && !order.includes(q.section)) order.push(q.section);
  const groups = order
    .map((sec) => ({ sec, qs: shown.filter((q) => (q.section ?? undefined) === sec) }))
    .filter((g) => g.qs.length > 0);

  for (const g of groups) {
    if (g.sec) {
      ensure(60);
      text(g.sec.toUpperCase(), CX, y, 8.5, bold, ACCENT);
      y -= 14;
    }
    for (const q of g.qs) {
      const label = wrap(q.label, bold, 10.5, IW);
      const value = answerText(input.answers[q.key], q.type);
      const valueLines = value ? wrap(value, font, 10, IW - 20) : ["Not answered"];
      const fieldH = valueLines.length * 13 + 14;
      // card: 26pt to the first label baseline, 13pt per label line, 8pt to
      // the answer field, the field, 16pt bottom padding.
      const cardH = 26 + (label.length - 1) * 13 + 8 + fieldH + 16;
      if (cardH > PH - 92 - FOOT) {
        // A very long answer: draw it unboxed across pages.
        ensure(40);
        for (const l of label) { text(l, CX, y, 10.5, bold); y -= 13; }
        y -= 4;
        for (const l of valueLines) { ensure(14); text(l, CX + 10, y, 10, font); y -= 13; }
        y -= 14;
        continue;
      }
      ensure(cardH + 10);
      const top = y;
      page.drawRectangle({ x: CX, y: top - cardH, width: CW, height: cardH, color: WHITE, borderColor: CARD_LINE, borderWidth: 1 });
      const yy = top - 26;
      label.forEach((l, i) => text(l, IX, yy - i * 13, 10.5, bold));
      const fTop = yy - (label.length - 1) * 13 - 8;
      page.drawRectangle({ x: IX, y: fTop - fieldH, width: IW, height: fieldH, color: FIELD_BG, borderColor: FIELD_LINE, borderWidth: 1 });
      let vy = fTop - 16;
      for (const l of valueLines) {
        text(l, IX + 10, vy, 10, font, value ? INK : MUTED);
        vy -= 13;
      }
      y = top - cardH - 10;
    }
    y -= 8;
  }

  // Footer on every page.
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 40 }, end: { x: PW - M, y: 40 }, thickness: 0.5, color: FIELD_LINE });
    p.drawText(safe(LEGAL_LINE), { x: M, y: 27, size: 7, font, color: MUTED });
    const pg = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pg, { x: PW - M - font.widthOfTextAtSize(pg, 7.5), y: 27, size: 7.5, font, color: MUTED });
  });

  return await doc.save();
}

/**
 * Build the PDF for one completed form card and file it in the client's
 * Documents. Never throws: a failed PDF must not undo the client's answers.
 */
export async function fileAnswersPdf(
  svc: Svc,
  opts: {
    clientProfileId: string;
    companyName: string;
    contactName?: string | null;
    stepKey: string;
    cardTitle: string;
    questions: AnswerQuestion[];
    sections?: string[];
    answers: Record<string, unknown>;
    uploadedBy: string | null;
  },
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const submittedAt = new Date();
    const bytes = await renderAnswersPdf({ ...opts, submittedAt });
    const path = `${opts.clientProfileId}/onboarding/${opts.stepKey}.pdf`;
    const { error: upErr } = await svc.storage.from("receipts").upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) return { ok: false, error: upErr.message };

    const title = `Onboarding form: ${opts.cardTitle}`;
    const fileName = `${opts.companyName} - ${opts.cardTitle}.pdf`.replace(/[\\/:*?"<>|]+/g, "-");
    const description = `Answers submitted in the onboarding deck, ${longDate(submittedAt)}.`;
    const { data: existing } = await svc
      .from("client_receipts")
      .select("id")
      .eq("client_profile_id", opts.clientProfileId)
      .eq("file_path", path)
      .maybeSingle();
    const row = { title, description, file_name: fileName, document_category: "onboarding_form", uploaded_by: opts.uploadedBy };
    const { error: rowErr } = existing
      ? await svc.from("client_receipts").update({ ...row, created_at: submittedAt.toISOString() }).eq("id", existing.id)
      : await svc.from("client_receipts").insert({ ...row, client_profile_id: opts.clientProfileId, file_path: path });
    if (rowErr) return { ok: false, error: rowErr.message };
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
