// Vexon OS Forms (18 Sep 2026): the Typeform replacement. One JSON schema per
// form — questions, logic rules, endings, scoring — stored on public.forms
// (draft in `schema`, live copy in `published_schema`). This file is the
// single source of truth for the shape and the walk; the edge function
// form-submit carries an identical copy of the pure logic in
// supabase/functions/_shared/form-logic.ts (Deno can't import from src).
// Keep the two in step.

export type QuestionType =
  | "short_text" | "long_text" | "email" | "phone" | "website" | "number"
  | "yes_no" | "choice" | "multi_choice" | "dropdown" | "date" | "file" | "statement"
  /** 20 Sep: composite answers for the client onboarding form. full_name = {first,last}; address = {line1,line2,city,state,postcode,country} */
  | "full_name" | "address"
  /** 20 Sep (Typeform parity): rating 1..scale, opinion_scale 0..scale, ranking = ordered choices, legal = must tick */
  | "rating" | "opinion_scale" | "ranking" | "legal";

export interface Choice { id: string; label: string; points?: number }

/** Picture or video shown with a question / welcome / ending (Enquire, 19 Sep).
 *  url: image (png/jpg/gif/webp/svg), direct video (mp4/webm), or a YouTube /
 *  Loom / Vimeo page link — the renderer embeds the right thing. */
export interface Media { url: string; alt?: string; position?: "above" | "side" }

export interface Question {
  id: string;
  /** Stable key used for prefill/recall (name, email, phone, company, …). */
  ref: string;
  type: QuestionType;
  title: string;
  help?: string;
  required: boolean;
  placeholder?: string;
  choices?: Choice[];
  /** file: accepted extensions, e.g. ".pdf,.doc,.docx" */
  accept?: string;
  media?: Media | null;
  /** Grouping label. The public renderer ignores it; the onboarding deck shows one section at a time. */
  section?: string;
  /** rating: number of stars (default 5); opinion_scale: top of the 0..N scale (default 10) */
  scale?: number;
  scale_labels?: { low?: string; high?: string };
}

export type LogicOp = "eq" | "neq" | "in" | "answered" | "not_answered";

export interface LogicRule {
  id: string;
  question_id: string;
  op: LogicOp;
  value?: string | string[];
  action: "jump" | "end";
  /** question id (jump) or ending id (end) */
  target: string;
}

export type EndingKind = "message" | "redirect" | "booking";

export interface Ending {
  id: string;
  kind: EndingKind;
  title: string;
  body?: string;
  /** redirect */
  url?: string;
  append_answers?: boolean;
  /** booking: booking_event_types.slug */
  event_slug?: string;
  /** reporting tag: qualified | price_qualified | unqualified | shortlisted | rejected | … */
  outcome?: string;
  media?: Media | null;
}

export interface Scoring {
  enabled: boolean;
  /** 0–100. Below this the response is flagged (and optionally routed). */
  threshold_pct: number;
  /** ending id used instead of the default when below threshold */
  below_threshold_ending?: string | null;
}

export interface FormSchema {
  welcome?: { title: string; body?: string; button?: string; media?: Media | null; time_hint?: string } | null;
  questions: Question[];
  logic: LogicRule[];
  endings: Ending[];
  default_ending: string;
  hidden: string[];
  scoring: Scoring;
}

export type FormKind = "lead" | "hiring" | "general";
export type FormStatus = "draft" | "live" | "closed";
export type FormSink = "none" | "marketing_leads" | "cv_screenings";

export interface FormRow {
  id: string;
  slug: string;
  name: string;
  kind: FormKind;
  status: FormStatus;
  schema: FormSchema;
  published_schema: FormSchema | null;
  sink: FormSink;
  notify_role: string | null;
  webhook_url: string | null;
  /** 20 Sep: an email per completed response (comma list in settings) and one-click push to Close. */
  notify_emails?: string[] | null;
  close_push?: boolean | null;
  /** appearance: "aurora" (default, dark glass on the brand wash) | "light" | "plain" */
  /** branding: false hides the Meridian logo and the "Powered by Enquire" line (23 Sep, Marcus: the
   *  SDR application must not carry Meridian while the rebrand is not public). Colours stay. */
  theme: { accent?: string; logo?: boolean; branding?: boolean; appearance?: "aurora" | "light" | "plain" } | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface FormResponseRow {
  id: string;
  form_id: string;
  token: string;
  answers: Record<string, unknown>;
  hidden: Record<string, string>;
  ending_id: string | null;
  outcome: string | null;
  score: number | null;
  max_score: number | null;
  score_pct: number | null;
  is_partial: boolean;
  is_test: boolean;
  started_at: string;
  completed_at: string | null;
  referrer: string | null;
  marketing_lead_id: string | null;
  cv_screening_id: string | null;
  booking_id: string | null;
  created_at: string;
  /** 20 Sep: Elena's "who have I looked at" — tags, a reviewed mark, notes, and the Close lead once pushed. */
  tags?: string[] | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  notes?: string | null;
  close_lead_id?: string | null;
  close_pushed_at?: string | null;
}

export type Answers = Record<string, unknown>;

export const uid = () => Math.random().toString(36).slice(2, 10);

export const emptySchema = (): FormSchema => ({
  welcome: null,
  questions: [],
  logic: [],
  endings: [{ id: "end_default", kind: "message", title: "Thanks, we've got it.", body: "", outcome: "submitted" }],
  default_ending: "end_default",
  hidden: [],
  scoring: { enabled: false, threshold_pct: 70, below_threshold_ending: null },
});

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  short_text: "Short text", long_text: "Long text", email: "Email", phone: "Phone", website: "Website",
  number: "Number", yes_no: "Yes / No", choice: "Multiple choice", multi_choice: "Multiple choice (pick many)",
  dropdown: "Dropdown", date: "Date", file: "File upload", statement: "Statement (no answer)",
  full_name: "Full name (first + last)", address: "Address (street, city, postcode…)",
  rating: "Rating (stars)", opinion_scale: "Opinion scale (0–10)", ranking: "Ranking (put in order)", legal: "Legal / consent tick",
};

export const hasChoices = (t: QuestionType) => t === "yes_no" || t === "choice" || t === "multi_choice" || t === "dropdown";

/* ── pure logic (mirrored in _shared/form-logic.ts) ─────────────────────── */

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === "" ? [] : [String(v)];

export function isAnswered(q: Question, v: unknown): boolean {
  if (q.type === "statement") return true;
  if (q.type === "file") return !!v && typeof v === "object" && !!(v as { path?: string }).path;
  if (q.type === "full_name" || q.type === "address") {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    return Object.values(v as Record<string, unknown>).some((x) => String(x ?? "").trim() !== "");
  }
  if (q.type === "legal") return String(v ?? "") === "Yes";
  if (q.type === "ranking") return Array.isArray(v) && v.length > 0;
  if (v && typeof v === "object" && !Array.isArray(v)) return false;
  return asList(v).some((s) => s.trim() !== "");
}

/** Composite answers ({first,last} / address) flattened to one line. */
export function compositeText(v: unknown): string {
  if (!v || typeof v !== "object" || Array.isArray(v)) return "";
  return Object.values(v as Record<string, unknown>).map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
}

export function ruleMatches(rule: LogicRule, answer: unknown): boolean {
  const list = asList(answer);
  switch (rule.op) {
    case "answered": return list.length > 0;
    case "not_answered": return list.length === 0;
    case "eq": return list.includes(String(rule.value ?? ""));
    case "neq": return list.length > 0 && !list.includes(String(rule.value ?? ""));
    case "in": return asList(rule.value).some((v) => list.includes(v));
    default: return false;
  }
}

export type WalkStep = { kind: "question"; question: Question } | { kind: "ending"; ending: Ending };

export function endingById(schema: FormSchema, id: string | null | undefined): Ending {
  return schema.endings.find((e) => e.id === id) ?? schema.endings.find((e) => e.id === schema.default_ending) ?? schema.endings[0];
}

/** Score = sum of chosen points; max = sum of each scored question's best choice. */
export function computeScore(schema: FormSchema, answers: Answers, path?: Question[]): { score: number; max: number; pct: number | null } {
  const qs = path ?? schema.questions;
  let score = 0, max = 0;
  for (const q of qs) {
    if (!hasChoices(q.type) || !q.choices?.length) continue;
    const pts = q.choices.map((c) => c.points ?? 0);
    const best = q.type === "multi_choice" ? pts.filter((p) => p > 0).reduce((a, b) => a + b, 0) : Math.max(...pts, 0);
    if (best <= 0) continue;
    max += best;
    const chosen = asList(answers[q.id]);
    for (const c of q.choices) if (chosen.includes(c.label) || chosen.includes(c.id)) score += c.points ?? 0;
  }
  return { score, max, pct: max > 0 ? Math.round((100 * score) / max) : null };
}

/**
 * What comes after `fromId` (null = the start) given the answers so far.
 * Logic rules on the current question run in order; first match wins.
 * Falling off the end applies the scoring threshold, then the default ending.
 */
export function nextStep(schema: FormSchema, answers: Answers, fromId: string | null): WalkStep {
  const qs = schema.questions;
  const finish = (): WalkStep => {
    if (schema.scoring.enabled && schema.scoring.below_threshold_ending) {
      const { pct } = computeScore(schema, answers, walkPath(schema, answers));
      if (pct !== null && pct < schema.scoring.threshold_pct) return { kind: "ending", ending: endingById(schema, schema.scoring.below_threshold_ending) };
    }
    return { kind: "ending", ending: endingById(schema, schema.default_ending) };
  };
  if (fromId === null) return qs[0] ? { kind: "question", question: qs[0] } : finish();
  const idx = qs.findIndex((q) => q.id === fromId);
  if (idx < 0) return finish();
  for (const rule of schema.logic.filter((r) => r.question_id === fromId)) {
    if (!ruleMatches(rule, answers[fromId])) continue;
    if (rule.action === "end") return { kind: "ending", ending: endingById(schema, rule.target) };
    const t = qs.find((q) => q.id === rule.target);
    if (t) return { kind: "question", question: t };
  }
  return qs[idx + 1] ? { kind: "question", question: qs[idx + 1] } : finish();
}

/** The questions actually visited for these answers (server replay + scoring). */
export function walkPath(schema: FormSchema, answers: Answers): Question[] {
  const path: Question[] = [];
  const seen = new Set<string>();
  let cur: string | null = null;
  for (let guard = 0; guard < schema.questions.length + 2; guard++) {
    const qs = schema.questions;
    const idx = cur === null ? -1 : qs.findIndex((q) => q.id === cur);
    let next: Question | null = null;
    if (cur === null) next = qs[0] ?? null;
    else {
      let routed = false;
      for (const rule of schema.logic.filter((r) => r.question_id === cur)) {
        if (!ruleMatches(rule, answers[cur])) continue;
        routed = true;
        if (rule.action === "end") { next = null; break; }
        next = qs.find((q) => q.id === rule.target) ?? null;
        break;
      }
      if (!routed) next = qs[idx + 1] ?? null;
    }
    if (!next || seen.has(next.id)) break;
    seen.add(next.id); path.push(next); cur = next.id;
  }
  return path;
}

/** Replay the whole walk: the ending this set of answers lands on. */
export function finalEnding(schema: FormSchema, answers: Answers): Ending {
  const path = walkPath(schema, answers);
  const last = path[path.length - 1];
  return (nextStep(schema, answers, last ? last.id : null) as { ending?: Ending }).ending ?? endingById(schema, schema.default_ending);
}

/** @ref recall: "Thanks @name" → "Thanks the owner". */
export function recall(text: string, schema: FormSchema, answers: Answers): string {
  return text.replace(/@([a-z_][a-z0-9_]*)/gi, (m, ref) => {
    const q = schema.questions.find((x) => x.ref === ref);
    if (!q) return m;
    const v = answers[q.id];
    const s = asList(v).join(", ");
    return s || "";
  });
}

/** Answers keyed by ref (what sinks, webhooks and prefill use). */
export function answersByRef(schema: FormSchema, answers: Answers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of schema.questions) {
    const v = answers[q.id];
    if (v === undefined || v === null || v === "") continue;
    out[q.ref] = q.type === "file" ? String((v as { name?: string }).name ?? "") : (q.type === "full_name" || q.type === "address") ? compositeText(v) : asList(v).join(", ");
  }
  return out;
}

/** Answers keyed by question title (the shape Elena's screening list already shows). */
export function answersByTitle(schema: FormSchema, answers: Answers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of schema.questions) {
    if (q.type === "statement") continue;
    const v = answers[q.id];
    if (v === undefined || v === null || v === "") continue;
    out[q.title] = q.type === "file" ? String((v as { name?: string }).name ?? "") : (q.type === "full_name" || q.type === "address") ? compositeText(v) : asList(v).join(", ");
  }
  return out;
}

/* ── Client onboarding deck (20 Sep): the deck renders an Enquire form with its
   own card look. This turns Enquire questions into the deck's FormQuestion
   shape (key = ref, label = title, deck types) so the journey snapshot,
   validation, the Documents tab and the CSM sheet keep working unchanged. */
export interface JourneyFormQuestion {
  key: string; label: string; type: string; required: boolean;
  help?: string; section?: string; options?: string[]; prefill?: string;
  /** choice / dropdown: one answer only (the deck still stores it as a one-item list). */
  single?: boolean;
  /** 2 Oct: shown only when the named question's answer matches (derived from a jump rule). */
  show_when?: { key: string; equals?: string; not_equals?: string };
}
const DECK_TYPE: Partial<Record<QuestionType, string>> = {
  short_text: "text", long_text: "textarea", email: "email", phone: "phone", website: "text", number: "number",
  yes_no: "checkbox", choice: "checkbox", multi_choice: "checkbox", dropdown: "checkbox", date: "text",
  full_name: "fullname", address: "address",
};
const DECK_PREFILL: Record<string, string> = { company_name: "company_name", email: "email", your_name: "contact_name", contact_name: "contact_name" };
export function toJourneyQuestions(schema: FormSchema): { questions: JourneyFormQuestion[]; sections: string[] } {
  const questions: JourneyFormQuestion[] = [];
  const sections: string[] = [];
  for (const q of schema.questions) {
    if (q.type === "statement" || q.type === "file") continue;
    const section = q.section?.trim() || undefined;
    if (section && !sections.includes(section)) sections.push(section);
    questions.push({
      key: q.ref, label: q.title, type: DECK_TYPE[q.type] ?? "text", required: q.required !== false,
      ...(q.help ? { help: q.help } : {}), ...(section ? { section } : {}),
      ...(q.choices?.length ? { options: q.choices.map((c) => c.label) } : {}),
      ...(q.type === "choice" || q.type === "dropdown" ? { single: true } : {}),
      ...(DECK_PREFILL[q.ref] ? { prefill: DECK_PREFILL[q.ref] } : {}),
    });
  }
  // 2 Oct (Marcus): the deck shows every question at once, so a jump rule
  // becomes "show these only when". A rule "A neq V -> jump to T" hides the
  // questions between A and T unless A's answer is V; "A eq V -> jump to T"
  // hides them when it is. Other operators are left to the public form.
  const order = schema.questions.map((q) => q.id);
  for (const rule of schema.logic) {
    if (rule.action !== "jump" || (rule.op !== "eq" && rule.op !== "neq") || typeof rule.value !== "string") continue;
    const from = order.indexOf(rule.question_id);
    const to = order.indexOf(rule.target);
    if (from < 0 || to <= from + 1) continue;
    const source = schema.questions[from];
    const between = new Set(schema.questions.slice(from + 1, to).map((q) => q.ref));
    const labelOf = source.choices?.find((c) => c.id === rule.value)?.label ?? rule.value;
    for (const jq of questions) {
      if (!between.has(jq.key) || jq.show_when) continue;
      jq.show_when = rule.op === "neq" ? { key: source.ref, equals: labelOf } : { key: source.ref, not_equals: labelOf };
    }
  }
  return { questions, sections };
}

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "form";
