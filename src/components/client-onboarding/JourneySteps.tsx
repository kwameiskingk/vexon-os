// Per-type step bodies for the client onboarding deck. Presentational plus the
// minimum wiring each type needs; every completion goes through the
// client-onboarding edge function (server-side locking), never direct writes.
//
// 3 Sep: one card per step. Bodies render in two modes — "complete" (the live
// card) and "edit" (the deck's Previous → Edit on an already-finished card,
// which calls update_answers instead of complete_step). New types: yes_no
// (question → Yes uploads/lists, No is done) and the form with sections,
// richer question types and pre-fill.
//
// 7 Sep (Marcus's review): copy in a British corporate register with no
// speaker; the booking card shows the client's email (editable) and lets
// them add guests to the invitation; a yes_no card can insist on an upload
// even after "Not yet" (config.no_requires_upload, the pitch deck) and offer
// a guide and a template; side-by-side buttons breathe (gap-4).
//
// 11 Sep (Marcus's 8 Sep walkthrough): nothing pops out. The onboarding form
// renders its sections inside the card with a progress bar at the bottom,
// the guide reads inline, and no body draws its own advance button any more:
// each registers the card's universal "Mark complete · next task" through
// usePrimaryAction, with a hint saying what is still needed while it is
// disabled. Step-specific controls (Open the link, Connect my calendar, the
// Yes / No choice, the decline line) stay inside the body.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { BookingSlotPicker } from "@/components/bookings/BookingSlotPicker";
import { usePrimaryAction, type PrimaryAction } from "@/components/onboarding-deck/CardAction";
import { useFollowAlong } from "@/components/onboarding-deck/DeckCard";
import { InlineDocument } from "@/components/onboarding-deck/InlineDocument";
import { useSandboxBookingContext } from "@/hooks/useSandboxBookingContext";
import {
  useBookingContext,
  useConnectCalendarUrl,
  useSaveFormDraft,
  type JourneyTask,
} from "@/hooks/useClientJourney";
import { submitForm, usePublicForm } from "@/hooks/useForms";
import { toJourneyQuestions } from "@/lib/forms/schema";

export interface StepCtx {
  clientProfileId: string;
  contactName: string;
  clientEmail: string;
  clientPhone: string;
  companyName: string;
  calendarConnected: boolean;
  completing: boolean;
  /** complete → complete_step; edit → update_answers (deck review mode). */
  mode: "complete" | "edit";
  onComplete: (payload: Record<string, unknown>) => void;
  onCancelEdit?: () => void;
  /** Demo portal renders with inert handlers and no Supabase. */
  demo?: boolean;
  /**
   * Dev Center sandbox (3 Sep): every card is completable and nothing is
   * written. Uploads keep only the filename in memory, the booking card
   * runs the real slot picker but confirming simulates, calendar connect
   * simulates, form drafts stay in memory.
   */
  sandbox?: boolean;
}

export interface FormQuestion {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  help?: string;
  section?: string;
  options?: string[];
  /** Pre-fill from the client profile: company_name | contact_name | email */
  prefill?: string;
  /** 2 Oct: one answer only (still stored as a one-item list). */
  single?: boolean;
  /** 2 Oct: shown only when another answer matches (an Enquire jump rule). */
  show_when?: { key: string; equals?: string; not_equals?: string };
}

export type AnswerMap = Record<string, unknown>;

/** 2 Oct: a question behind a jump rule only shows when its condition holds. */
export function isVisibleQuestion(q: FormQuestion, answers: AnswerMap): boolean {
  if (!q.show_when) return true;
  const v = answers[q.show_when.key];
  const picked = Array.isArray(v) ? v.map((x) => String(x)) : typeof v === "string" && v ? [v] : [];
  if (q.show_when.equals !== undefined) return picked.includes(q.show_when.equals);
  if (q.show_when.not_equals !== undefined) return picked.length > 0 && !picked.includes(q.show_when.not_equals);
  return true;
}

export const primaryBtn =
  "bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 text-white border-0 shadow-[0_8px_24px_-8px_rgba(154,86,208,.55)]";

/**
 * The light secondary button. `bg-none` matters: the Button default variant
 * paints a dark gradient as a background-image, which a plain `bg-white`
 * cannot override (different CSS property), so unselected Yes buttons used
 * to render dark purple with purple text (Marcus, 4 Sep).
 */
export const secondaryBtn =
  "bg-none bg-white text-violet-700 border border-violet-200 hover:bg-violet-50 hover:text-violet-800 shadow-none";

/** The row two side-by-side actions share (they were almost touching). */
export const actionRow = "flex flex-wrap items-center gap-4";

const EDITABLE_TYPES = ["form", "yes_no", "text_list", "upload"];
export const isEditableType = (t: string) => EDITABLE_TYPES.includes(t);

/** Edit mode relabels the universal button and adds a quiet Cancel beside it. */
function editExtras(ctx: StepCtx): Pick<PrimaryAction, "label" | "secondary"> {
  if (ctx.mode !== "edit") return {};
  return {
    label: "Save changes",
    secondary: ctx.onCancelEdit ? { label: "Cancel", onClick: ctx.onCancelEdit } : null,
  };
}

export function StepBody({ task, ctx }: { task: JourneyTask; ctx: StepCtx }) {
  switch (task.step_type) {
    case "form":
      return <FormStep task={task} ctx={ctx} />;
    case "yes_no":
      return <YesNoStep task={task} ctx={ctx} />;
    case "booking":
      return <BookingStep task={task} ctx={ctx} />;
    case "calendar_connect":
      return <CalendarConnectStep ctx={ctx} />;
    case "upload":
      return <UploadStep task={task} ctx={ctx} />;
    case "text_list":
      return <TextListStep task={task} ctx={ctx} />;
    case "read_document":
      return <ReadDocumentStep task={task} ctx={ctx} />;
    case "link":
      return <LinkStep task={task} ctx={ctx} />;
    default:
      return <ConfirmStep ctx={ctx} />;
  }
}

/** A card with nothing to fill in: the universal button completes it. */
function ConfirmStep({ ctx }: { ctx: StepCtx }) {
  usePrimaryAction({ onClick: () => ctx.onComplete({}), busy: ctx.completing, disabled: ctx.demo });
  return null;
}

/* ── Shared upload helper ───────────────────────────────────────────────── */

async function uploadFiles(files: File[], clientProfileId: string, stepKey: string, sandbox?: boolean): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
    // Sandbox: the file never leaves the browser; only its name is kept.
    if (sandbox) {
      paths.push(`sandbox/${safeName}`);
      continue;
    }
    const path = `uploads/${clientProfileId}/${stepKey}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${safeName}`;
    const { error } = await supabase.storage.from("client-onboarding-assets").upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    paths.push(path);
  }
  return paths;
}

export const fileLabel = (path: string) => path.split("/").pop()?.replace(/^[a-z_]+-[a-z0-9]+-[a-z0-9]{4}-/, "") ?? path;

export function FileDropZone({
  accept,
  multiple,
  busy,
  onFiles,
  hint,
}: {
  accept?: string;
  multiple?: boolean;
  busy: boolean;
  onFiles: (files: File[]) => void;
  hint?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files || [])); }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors",
        over ? "border-violet-500 bg-violet-50" : "border-violet-200 bg-white/60 hover:bg-violet-50/60",
        busy && "opacity-60 pointer-events-none",
      )}
    >
      <input type="file" className="hidden" accept={accept || undefined} multiple={multiple} disabled={busy} onChange={(e) => onFiles(Array.from(e.target.files || []))} />
      <span className="h-11 w-11 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white flex items-center justify-center">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
      </span>
      <span className="text-sm font-medium">{busy ? "Uploading…" : "Drop a file here or click to choose one"}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function FileChips({ paths, onRemove }: { paths: string[]; onRemove?: (p: string) => void }) {
  if (paths.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {paths.map((p) => (
        <li key={p} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 text-xs">
          <FileText className="h-3.5 w-3.5" /> {fileLabel(p)}
          {onRemove && (
            <button type="button" onClick={() => onRemove(p)} className="ml-1 text-emerald-700/70 hover:text-emerald-900"><X className="h-3 w-3" /></button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── Form ────────────────────────────────────────────────────────────────── */

const prefillValue = (q: FormQuestion, ctx: StepCtx): unknown => {
  switch (q.prefill) {
    case "company_name": return ctx.companyName || "";
    case "email": return ctx.clientEmail || "";
    case "contact_name": {
      const parts = (ctx.contactName || "").trim().split(/\s+/);
      return q.type === "fullname" ? { first: parts[0] ?? "", last: parts.slice(1).join(" ") } : ctx.contactName || "";
    }
    default: return undefined;
  }
};

export const isAnswered = (q: FormQuestion, v: unknown): boolean => {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some((x) => String(x ?? "").trim().length > 0);
  return String(v).trim().length > 0;
};

export function answerToText(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.values(o).map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  }
  return String(v);
}

function initialAnswers(questions: FormQuestion[], task: JourneyTask, ctx: StepCtx): AnswerMap {
  const saved = (task.answers ?? {}) as AnswerMap;
  const out: AnswerMap = {};
  for (const q of questions) {
    const existing = saved[q.key];
    out[q.key] = isAnswered(q, existing) ? existing : (prefillValue(q, ctx) ?? (q.type === "checkbox" ? [] : ""));
  }
  return out;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * 20 Sep (the owner): the onboarding form is authored in Enquire (Form Builder →
 * "Client onboarding"). The step's config carries `enquire_slug`; the card
 * renders the LIVE Enquire questions with this same section-at-a-time look,
 * saves drafts to the journey as before, and on completion also files the
 * answers as an Enquire response (so they show under Responses) before the
 * journey step completes. Without `enquire_slug` the snapshot questions are
 * used exactly as before.
 */
function FormStep({ task, ctx }: { task: JourneyTask; ctx: StepCtx }) {
  const enquireSlug = typeof task.config?.enquire_slug === "string" ? (task.config.enquire_slug as string) : undefined;
  const enquire = usePublicForm(enquireSlug);
  const questions = useMemo(() => {
    if (enquireSlug && enquire.data?.schema) return toJourneyQuestions(enquire.data.schema).questions as FormQuestion[];
    return (task.config?.questions as FormQuestion[] | undefined) ?? [];
  }, [task.config, enquireSlug, enquire.data]);
  const sectionOrder = useMemo(() => {
    if (enquireSlug && enquire.data?.schema) return toJourneyQuestions(enquire.data.schema).sections;
    return (task.config?.sections as string[] | undefined) ?? [];
  }, [task.config, enquireSlug, enquire.data]);
  const fileToEnquire = async (a: AnswerMap) => {
    if (!enquireSlug || !enquire.data?.schema || ctx.demo || ctx.sandbox) return;
    const byId: Record<string, unknown> = {};
    for (const q of enquire.data.schema.questions) if (a[q.ref] !== undefined) byId[q.id] = a[q.ref];
    try {
      await submitForm({ slug: enquireSlug, token: `journey-${task.id}`, answers: byId, hidden: { client_profile_id: ctx.clientProfileId, company: ctx.companyName }, referrer: "client-onboarding" });
    } catch (e) { console.error("[onboarding] Enquire copy failed (journey answers still saved)", e); }
  };
  const inline = task.config?.inline === true || questions.length <= 2;
  const [answers, setAnswers] = useState<AnswerMap>(() => initialAnswers(questions, task, ctx));
  const seededFor = useRef(questions.length);
  useEffect(() => {
    // Enquire questions arrive after first render: seed saved/prefilled values once they do.
    if (questions.length && seededFor.current === 0) { seededFor.current = questions.length; setAnswers(initialAnswers(questions, task, ctx)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);
  const draft = useSaveFormDraft();
  const dirtyRef = useRef(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Save-as-you-go (live mode only): flush a draft 1.5s after the last change.
  useEffect(() => {
    if (!dirtyRef.current || ctx.demo || ctx.sandbox || ctx.mode === "edit") return;
    const t = setTimeout(() => {
      draft.mutate({ step_key: task.step_key, answers }, { onSuccess: () => setSavedAt(new Date()) });
      dirtyRef.current = false;
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  const setAnswer = (key: string, value: unknown) => {
    dirtyRef.current = true;
    setAnswers((a) => ({ ...a, [key]: value }));
  };

  // Hidden questions (a jump rule whose condition is not met) neither count
  // nor block completion.
  const visible = questions.filter((q) => isVisibleQuestion(q, answers));
  const required = visible.filter((q) => q.required !== false);
  const answeredCount = visible.filter((q) => isAnswered(q, answers[q.key])).length;
  const missing = required.filter((q) => !isAnswered(q, answers[q.key]));

  usePrimaryAction({
    onClick: () => { void fileToEnquire(answers).finally(() => ctx.onComplete({ answers })); },
    disabled: missing.length > 0 || ctx.demo || (!!enquireSlug && !enquire.data),
    busy: ctx.completing,
    hint: missing.length > 0 ? `${plural(missing.length, "required answer")} still to go.` : "Everything is complete.",
    ...editExtras(ctx),
  });

  if (enquireSlug && enquire.isLoading) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading the form…</p>;
  }
  if (enquireSlug && !enquire.isLoading && !enquire.data) {
    return <p className="text-sm text-muted-foreground">The onboarding form isn't published yet. Your CSM will sort this out.</p>;
  }
  if (inline) {
    return (
      <div className="space-y-4">
        {visible.map((q) => (
          <QuestionField key={q.key} q={q} value={answers[q.key]} onChange={(v) => setAnswer(q.key, v)} />
        ))}
      </div>
    );
  }

  return (
    <InlineForm
      questions={visible}
      sections={sectionOrder}
      answers={answers}
      onAnswer={setAnswer}
      answeredCount={answeredCount}
      savedAt={ctx.mode === "edit" ? null : savedAt}
      saving={draft.isPending}
    />
  );
}

/**
 * The onboarding form inside the card (Marcus, 8 Sep): section pills, the
 * current section's questions, Back / Next section, and the progress bar
 * along the bottom so they can see how far through they are while typing.
 */
function InlineForm({
  questions, sections, answers, onAnswer, answeredCount, savedAt, saving,
}: {
  questions: FormQuestion[];
  sections: string[];
  answers: AnswerMap;
  onAnswer: (key: string, value: unknown) => void;
  answeredCount: number;
  savedAt: Date | null;
  saving: boolean;
}) {
  const sectionNames = useMemo(() => {
    const fromQs = Array.from(new Set(questions.map((q) => q.section || "Questions")));
    const ordered = sections.filter((s) => fromQs.includes(s));
    for (const s of fromQs) if (!ordered.includes(s)) ordered.push(s);
    return ordered;
  }, [questions, sections]);
  const [idx, setIdx] = useState(0);
  const current = sectionNames[idx] ?? sectionNames[0];
  const inSection = questions.filter((q) => (q.section || "Questions") === current);
  const topRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  // 28 Sep: with the explainer playing in the corner (follow-along), a
  // change of section moves the video to that section's chapter.
  const followAlong = useFollowAlong();
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    followAlong.seekChapter(idx);
    // Only on a section change; the follow-along handle is stable while docked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const counts = sectionNames.map((s) => {
    const qs = questions.filter((q) => (q.section || "Questions") === s);
    return { s, total: qs.length, done: qs.filter((q) => isAnswered(q, answers[q.key])).length };
  });
  const pct = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  return (
    <div ref={topRef} className="space-y-6 scroll-mt-24">
      <nav className="flex flex-wrap gap-2" aria-label="Form sections">
        {counts.map((c, i) => (
          <button
            key={c.s}
            type="button"
            onClick={() => setIdx(i)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              i === idx
                ? "bg-violet-600 border-violet-600 text-white"
                : c.done === c.total
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                  : "bg-white border-violet-200 text-violet-800 hover:bg-violet-50",
            )}
          >
            {c.done === c.total ? <Check className="h-3 w-3" /> : <span className="tabular-nums">{c.done}/{c.total}</span>}
            {c.s}
          </button>
        ))}
      </nav>

      <div>
        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-violet-600">Section {idx + 1} of {sectionNames.length}</p>
        <h3 className="text-xl font-heading font-semibold leading-tight mt-1">{current}</h3>
      </div>

      <div key={current} className="space-y-6">
        {inSection.map((q) => (
          <QuestionField key={q.key} q={q} index={questions.indexOf(q) + 1} value={answers[q.key]} onChange={(v) => onAnswer(q.key, v)} large />
        ))}
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-violet-100">
        <Button variant="ghost" size="sm" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
        <span className="flex-1 text-[11px] text-muted-foreground text-center">
          {saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Saves as you type."}
        </span>
        {idx < sectionNames.length - 1 ? (
          <Button variant="outline" size="sm" className={secondaryBtn} onClick={() => setIdx((i) => i + 1)}>
            Next section <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Last section</span>
        )}
      </div>

      <div className="rounded-2xl border border-violet-100 bg-white/70 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">{answeredCount} of {questions.length} answered</p>
          <span className="text-xs font-semibold text-violet-700 tabular-nums">{pct}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-violet-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

const inputCls = "bg-white border-violet-200/80 focus-visible:ring-violet-500 h-11 text-[15px]";
const isEmailAddress = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function QuestionField({ q, value, onChange, index, autoFocus, large }: {
  q: FormQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  index?: number;
  autoFocus?: boolean;
  large?: boolean;
}) {
  const type = q.type ?? "text";
  const label = (
    <label className={cn("block font-medium text-foreground", large ? "text-[15px]" : "text-sm")}>
      {index != null && <span className="text-violet-500 font-mono text-xs mr-2">{index}.</span>}
      {q.label}
      {q.required !== false && <span className="text-fuchsia-500 ml-1">*</span>}
    </label>
  );
  const help = q.help ? <p className="text-xs text-muted-foreground leading-relaxed">{q.help}</p> : null;

  if (type === "textarea") {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
        {label}
        <Textarea rows={large ? 4 : 3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className="bg-white border-violet-200/80 focus-visible:ring-violet-500 text-[15px]" autoFocus={autoFocus} placeholder="Type your answer…" />
        {help}
      </motion.div>
    );
  }
  if (type === "checkbox") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    // A single-answer question (Enquire "choice") swaps the pick; the others toggle.
    const toggle = (opt: string) =>
      onChange(q.single ? (arr.includes(opt) ? [] : [opt]) : arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt]);
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
        {label}
        <div className="flex flex-wrap gap-2">
          {(q.options ?? []).map((opt) => {
            const on = arr.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => toggle(opt)}
                className={cn("rounded-full border px-4 py-2 text-sm transition-colors text-left", on ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-white hover:bg-violet-50")}>
                {on && <Check className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />}{opt}
              </button>
            );
          })}
        </div>
        {help}
      </motion.div>
    );
  }
  if (type === "fullname") {
    const o = (value && typeof value === "object" ? value : {}) as { first?: string; last?: string };
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
        {label}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input className={inputCls} placeholder="First name" value={o.first ?? ""} onChange={(e) => onChange({ ...o, first: e.target.value })} autoFocus={autoFocus} />
          <Input className={inputCls} placeholder="Last name" value={o.last ?? ""} onChange={(e) => onChange({ ...o, last: e.target.value })} />
        </div>
        {help}
      </motion.div>
    );
  }
  if (type === "address") {
    const o = (value && typeof value === "object" ? value : {}) as Record<string, string>;
    const set = (k: string, v: string) => onChange({ ...o, [k]: v });
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
        {label}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input className={cn(inputCls, "sm:col-span-2")} placeholder="Street address" value={o.line1 ?? ""} onChange={(e) => set("line1", e.target.value)} autoFocus={autoFocus} />
          <Input className={cn(inputCls, "sm:col-span-2")} placeholder="Street address line 2" value={o.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} />
          <Input className={inputCls} placeholder="City" value={o.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          <Input className={inputCls} placeholder="State / Province" value={o.state ?? ""} onChange={(e) => set("state", e.target.value)} />
          <Input className={inputCls} placeholder="Postal / Zip code" value={o.postcode ?? ""} onChange={(e) => set("postcode", e.target.value)} />
          <Input className={inputCls} placeholder="Country" value={o.country ?? ""} onChange={(e) => set("country", e.target.value)} />
        </div>
        {help}
      </motion.div>
    );
  }
  const htmlType = type === "email" ? "email" : type === "phone" ? "tel" : type === "number" ? "number" : "text";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
      {label}
      <Input type={htmlType} className={cn(inputCls, "max-w-xl")} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} placeholder={type === "email" ? "name@company.com" : type === "phone" ? "+44 …" : "Type your answer…"} />
      {help}
    </motion.div>
  );
}

/* ── Yes / No (3 Sep) ───────────────────────────────────────────────────── */

function YesNoStep({ task, ctx }: { task: JourneyTask; ctx: StepCtx }) {
  const cfg = task.config ?? {};
  const mode = String(cfg.on_yes ?? "upload");
  const wantsUpload = mode === "upload" || mode === "upload_or_list";
  const wantsList = mode === "list" || mode === "upload_or_list";
  // Pitch deck (Marcus, 4 Sep): "Not yet" does not complete the card. It
  // reveals the guide and the template, and the upload stays required.
  const noRequiresUpload = cfg.no_requires_upload === true && wantsUpload;
  // 11 Sep (Marcus, 8 Sep): every card must receive something. Unless the
  // builder allows "No" for this card, there is no choice to make: the
  // upload / list appears straight away and the server refuses "no".
  const mandatory = cfg.allow_no !== true && !noRequiresUpload;
  const saved = (task.answers ?? {}) as { answer?: string; items?: string[]; file_paths?: string[] };
  const [answer, setAnswer] = useState<"yes" | "no" | null>(
    mandatory ? "yes" : ctx.mode === "edit" ? (saved.answer as "yes" | "no" | null) ?? null : null,
  );
  const [paths, setPaths] = useState<string[]>(saved.file_paths ?? []);
  const [items, setItems] = useState<string[]>(saved.items?.length ? saved.items : [""]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const filled = items.map((i) => i.trim()).filter(Boolean);
  const min = Number(cfg.min_items ?? 1);
  const canSave = (wantsUpload && paths.length > 0) || (wantsList && filled.length >= min);
  const guideUrl = typeof cfg.no_guide_url === "string" && cfg.no_guide_url ? cfg.no_guide_url : null;
  const templateUrl = typeof cfg.template_url === "string" && cfg.template_url ? cfg.template_url : null;
  const showHelpers = mandatory || answer === "no" || (guideUrl && answer === null && !noRequiresUpload);
  const showWork = answer === "yes" || (answer === "no" && noRequiresUpload);

  usePrimaryAction({
    onClick: () => ctx.onComplete({ answer: "yes", file_paths: paths, items: filled }),
    disabled: !showWork || !canSave || busy || ctx.demo,
    busy: ctx.completing && answer !== "no",
    hint: !showWork
      ? "Choose an answer above."
      : canSave
        ? null
        : wantsUpload && wantsList
          ? "Upload a file or add at least one entry."
          : wantsUpload
            ? "Upload the file first."
            : `Add at least ${plural(min, "entry")}.`,
    ...editExtras(ctx),
  });

  const onFiles = async (files: File[]) => {
    if (files.length === 0 || ctx.demo) return;
    setBusy(true);
    setErr(null);
    try {
      const up = await uploadFiles(cfg.multiple === false ? files.slice(0, 1) : files, ctx.clientProfileId, task.step_key, ctx.sandbox);
      setPaths((p) => (cfg.multiple === false ? up : [...p, ...up]));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const choice = (
    <div className={actionRow}>
      <Button
        size="lg"
        className={cn("rounded-full px-6", answer === "yes" ? primaryBtn : secondaryBtn)}
        onClick={() => setAnswer("yes")}
        disabled={ctx.completing}
      >
        <Check className="h-4 w-4 mr-2" /> {String(cfg.yes_label ?? "Yes, I have this")}
      </Button>
      <Button
        size="lg"
        className={cn("rounded-full px-6", secondaryBtn, answer === "no" && "bg-violet-50")}
        disabled={ctx.completing || ctx.demo}
        onClick={() => {
          setAnswer("no");
          if (!noRequiresUpload) ctx.onComplete({ answer: "no" });
        }}
      >
        {ctx.completing && answer === "no" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {String(cfg.no_label ?? "No, not at present")}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-lg font-medium font-heading">{String(cfg.question ?? task.label)}</p>
      {!mandatory && choice}
      {answer === "no" && noRequiresUpload && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          No problem. The guide and template below will help you put one together. This card remains open until a deck has been uploaded.
        </motion.div>
      )}
      {showHelpers && (guideUrl || templateUrl) && (
        <div className={actionRow}>
          {guideUrl && (
            <Button asChild variant="outline" className={secondaryBtn}>
              <a href={guideUrl} target="_blank" rel="noreferrer">
                <FileText className="h-4 w-4 mr-1.5" /> {String(cfg.no_guide_label ?? "Read the guide")} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </a>
            </Button>
          )}
          {templateUrl && (
            <Button asChild variant="outline" className={secondaryBtn}>
              <a href={templateUrl} target="_blank" rel="noreferrer">
                <FileText className="h-4 w-4 mr-1.5" /> {String(cfg.template_label ?? "Download the template")} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </a>
            </Button>
          )}
        </div>
      )}
      {answer === "no" && noRequiresUpload && !guideUrl && !templateUrl && (
        <p className="text-xs text-muted-foreground">The guide and template have not been added yet. Please upload your deck when it is ready.</p>
      )}
      {showWork && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {wantsUpload && (
            <div className="space-y-2">
              <FileDropZone accept={typeof cfg.accept === "string" ? cfg.accept : undefined} multiple={cfg.multiple !== false} busy={busy} onFiles={onFiles}
                hint={cfg.multiple !== false ? "You may add more than one file" : undefined} />
              <FileChips paths={paths} onRemove={(p) => setPaths((x) => x.filter((y) => y !== p))} />
              {err && <p className="text-sm text-red-500">{err}</p>}
            </div>
          )}
          {wantsList && (
            <div className="space-y-2">
              {wantsUpload && <p className="text-xs text-muted-foreground">Or enter them below</p>}
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className={inputCls} value={item} placeholder={String(cfg.placeholder ?? "Add an entry…")}
                    onChange={(e) => setItems((arr) => arr.map((v, j) => (j === i ? e.target.value : v)))} />
                  <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground"
                    onClick={() => setItems((arr) => (arr.length > 1 ? arr.filter((_, j) => j !== i) : [""]))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="border-violet-200" onClick={() => setItems((arr) => [...arr, ""])}>
                <Plus className="h-4 w-4 mr-1" /> Add another
              </Button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

/* ── Booking (onboarding call) ───────────────────────────────────────────── */

function BookingStep({ task, ctx }: { task: JourneyTask; ctx: StepCtx }) {
  const liveQuery = useBookingContext(ctx.demo || ctx.sandbox ? null : task.step_key);
  // Sandbox: resolve the event straight from the booking tables (no journey
  // exists), so the picker shows the host's live availability.
  const sandboxQuery = useSandboxBookingContext(ctx.sandbox ? String(task.config?.event_slug ?? "") : null);
  const { data: bctx, isLoading, error } = ctx.sandbox ? sandboxQuery : liveQuery;
  const [slot, setSlot] = useState<string | null>(null);
  // Marcus (4 Sep): show the email the invitation goes to (pre-filled, but
  // editable) and let the client add guests to the invitation.
  const [email, setEmail] = useState(ctx.clientEmail || "");
  const [guests, setGuests] = useState<string[]>([]);
  const [guestDraft, setGuestDraft] = useState("");
  const [phone, setPhone] = useState(ctx.clientPhone || "");
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const emailOk = isEmailAddress(email.trim());
  const ready = !isLoading && !error && !!bctx?.event_type_id;

  const book = async () => {
    if (!slot || !emailOk || !bctx) return;
    if (ctx.sandbox) {
      // Simulated: no booking-create call, nothing lands on anyone's calendar.
      ctx.onComplete({ booking_id: "sandbox", starts_at: slot, invite_email: email.trim(), guests });
      return;
    }
    setBooking(true);
    setBookError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("booking-create", {
        body: {
          event_type_id: bctx.event_type_id,
          host_user_id: bctx.host_user_id,
          starts_at: slot,
          prospect_name: ctx.contactName,
          prospect_email: email.trim(),
          prospect_mobile: phone || undefined,
          guest_emails: guests,
          source: "admin",
          prospect_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      if (fnErr || data?.error || !data?.booking_id) {
        throw new Error(data?.error || fnErr?.message || "Booking failed. Try another slot.");
      }
      ctx.onComplete({ booking_id: data.booking_id });
    } catch (e) {
      setBookError(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setBooking(false);
    }
  };

  usePrimaryAction(
    ctx.demo || !ready
      ? { onClick: () => undefined, disabled: true, hint: ctx.demo ? "The live slot picker appears here (demo)." : null }
      : {
          onClick: book,
          disabled: !slot || !emailOk,
          busy: booking || ctx.completing,
          hint: !slot
            ? "Choose a time above."
            : !emailOk
              ? "Enter a valid email address for the invitation."
              : ctx.sandbox
                ? "Sandbox: confirming only simulates the booking."
                : "The invitation is sent as soon as you confirm.",
        },
  );

  const addGuest = () => {
    const v = guestDraft.trim().toLowerCase();
    if (!v) return;
    if (!isEmailAddress(v)) {
      setBookError("Please enter a valid email address for the guest.");
      return;
    }
    setBookError(null);
    if (!guests.includes(v) && v !== email.trim().toLowerCase() && guests.length < 5) setGuests((g) => [...g, v]);
    setGuestDraft("");
  };

  if (ctx.demo) {
    return <p className="text-sm text-muted-foreground">The live slot picker appears here (demo).</p>;
  }
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-violet-500" />;
  if (error || !bctx?.event_type_id) {
    return (
      <p className="text-sm text-muted-foreground">
        {(error as Error | null)?.message || "The onboarding call has not been configured yet. Your Customer Success Manager will be in touch."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-100 bg-white/70 p-3">
        <BookingSlotPicker
          eventTypeId={bctx.event_type_id}
          hostUserId={bctx.host_user_id}
          value={slot}
          onSelect={setSlot}
          timezone={bctx.lock_timezone || "Europe/London"}
          timezoneLabel={!bctx.lock_timezone || bctx.lock_timezone === "Europe/London" ? "UK time" : undefined}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Send the invitation to</label>
          <Input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          {!emailOk && email.trim().length > 0 && <p className="text-xs text-amber-700">Please enter a valid email address.</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Mobile number for an SMS reminder <span className="text-muted-foreground font-normal">(optional)</span></label>
          <Input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 …" />
        </div>
      </div>
      <div className="space-y-1.5 max-w-2xl">
        <label className="text-sm font-medium">Add guests to the invitation <span className="text-muted-foreground font-normal">(optional)</span></label>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="email"
            className={inputCls}
            value={guestDraft}
            onChange={(e) => setGuestDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGuest(); } }}
            placeholder="colleague@company.com"
          />
          <Button variant="outline" className={cn(secondaryBtn, "h-11 shrink-0")} disabled={!guestDraft.trim() || guests.length >= 5} onClick={addGuest}>
            <Plus className="h-4 w-4 mr-1" /> Add guest
          </Button>
        </div>
        {guests.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1">
            {guests.map((g) => (
              <li key={g} className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 text-violet-800 border border-violet-200 px-3 py-1 text-xs">
                {g}
                <button type="button" onClick={() => setGuests((x) => x.filter((y) => y !== g))} className="ml-1 text-violet-500 hover:text-violet-800" aria-label={`Remove ${g}`}>
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Anyone added here receives the same calendar invitation. Up to five guests.</p>
      </div>
      {bookError && <p className="text-sm text-red-500">{bookError}</p>}
      <p className="text-xs text-muted-foreground">
        {ctx.sandbox
          ? "Sandbox: these are the host's real open slots, but confirming only simulates the booking. Nothing is created."
          : `${bctx.duration_minutes ? `${bctx.duration_minutes} minutes. ` : ""}A calendar invitation with a video link${phone ? " and an SMS confirmation" : ""} will be sent straight away.`}
      </p>
    </div>
  );
}

/* ── Calendar connect ────────────────────────────────────────────────────── */

function CalendarConnectStep({ ctx }: { ctx: StepCtx }) {
  const connectUrl = useConnectCalendarUrl();

  // Marking the card complete is the check: the server only accepts it once
  // a calendar is actually connected, so "I have connected, check now" is
  // simply the universal button.
  usePrimaryAction({
    onClick: () => ctx.onComplete({}),
    disabled: ctx.demo,
    busy: ctx.completing,
    hint: ctx.calendarConnected
      ? null
      : ctx.sandbox
        ? "Sandbox: connecting is simulated."
        : "Connect your calendar first. We check the connection when you mark this complete.",
  });

  const startConnect = async () => {
    if (ctx.sandbox) {
      // Simulated: no OAuth round-trip in the sandbox.
      ctx.onComplete({});
      return;
    }
    const res = await connectUrl.mutateAsync();
    if (res?.already_connected) {
      ctx.onComplete({});
      return;
    }
    if (res?.connect_url) window.open(res.connect_url, "_blank", "noopener");
  };

  if (ctx.calendarConnected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
        <CheckCircle2 className="h-4 w-4" /> Calendar connected
      </span>
    );
  }
  return (
    <div className="space-y-3">
      <Button className={primaryBtn} disabled={connectUrl.isPending || ctx.demo} onClick={startConnect}>
        {connectUrl.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calendar className="h-4 w-4 mr-2" />}
        Connect my calendar
      </Button>
      <p className="text-xs text-muted-foreground">
        {ctx.sandbox
          ? "Sandbox: connecting is simulated here. In the live flow a new tab opens for Google or Microsoft consent."
          : "Google Workspace and Microsoft 365 are both supported. A new tab will open; approve access, then return here."}
      </p>
    </div>
  );
}

/* ── Upload ──────────────────────────────────────────────────────────────── */

function UploadStep({ task, ctx }: { task: JourneyTask; ctx: StepCtx }) {
  const saved = (task.answers ?? {}) as { file_paths?: string[] };
  const [paths, setPaths] = useState<string[]>(saved.file_paths ?? (task.file_path ? [task.file_path] : []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const accept = String(task.config?.accept ?? "");
  const multiple = task.config?.multiple === true;

  usePrimaryAction({
    onClick: () => ctx.onComplete({ file_paths: paths }),
    disabled: paths.length === 0 || busy || ctx.demo,
    busy: ctx.completing,
    hint: paths.length === 0 ? "Upload the file first." : null,
    ...editExtras(ctx),
  });

  const onFiles = async (files: File[]) => {
    if (files.length === 0 || ctx.demo) return;
    setBusy(true);
    setErr(null);
    try {
      const up = await uploadFiles(multiple ? files : files.slice(0, 1), ctx.clientProfileId, task.step_key, ctx.sandbox);
      setPaths((p) => (multiple ? [...p, ...up] : up));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <FileDropZone accept={accept} multiple={multiple} busy={busy} onFiles={onFiles} />
      <FileChips paths={paths} onRemove={(p) => setPaths((x) => x.filter((y) => y !== p))} />
      {err && <p className="text-sm text-red-500">{err}</p>}
      {ctx.mode === "complete" && <DeclineOption task={task} ctx={ctx} label="I do not have this to hand" />}
    </div>
  );
}

/* ── Text list ───────────────────────────────────────────────────────────── */

function TextListStep({ task, ctx }: { task: JourneyTask; ctx: StepCtx }) {
  const existing = ((task.answers as { items?: string[] } | null)?.items ?? []) as string[];
  const [items, setItems] = useState<string[]>(existing.length > 0 ? existing : [""]);
  const placeholder = String(task.config?.placeholder ?? "Add an entry…");
  const min = Number(task.config?.min_items ?? 1);
  const filled = items.map((i) => i.trim()).filter(Boolean);

  usePrimaryAction({
    onClick: () => ctx.onComplete({ items: filled }),
    disabled: filled.length < min || ctx.demo,
    busy: ctx.completing,
    hint: filled.length < min ? `Add at least ${plural(min, "entry")}.` : `${plural(filled.length, "entry")} ready to save.`,
    ...editExtras(ctx),
  });

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input className={inputCls} value={item} placeholder={placeholder}
            onChange={(e) => setItems((arr) => arr.map((v, j) => (j === i ? e.target.value : v)))} />
          <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground"
            onClick={() => setItems((arr) => (arr.length > 1 ? arr.filter((_, j) => j !== i) : arr))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className={cn(actionRow, "pt-1")}>
        <Button size="sm" variant="outline" className="border-violet-200" onClick={() => setItems((arr) => [...arr, ""])}>
          <Plus className="h-4 w-4 mr-1" /> Add another
        </Button>
      </div>
      {ctx.mode === "complete" && <DeclineOption task={task} ctx={ctx} label="I do not have a list" />}
    </div>
  );
}

/* ── Explicit decline ────────────────────────────────────────────────────────
 * Daniel's ruling (26 Aug call): a list step is never silently skippable —
 * the client either provides it or says, on the record, that they haven't got
 * one. The decline is stored on the task and shown to the CSM. Set
 * config.allow_decline = false in the flow builder to make a step mandatory.
 */
function DeclineOption({ task, ctx, label }: { task: JourneyTask; ctx: StepCtx; label: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (task.config?.allow_decline === false) return null;

  if (!open) {
    return (
      <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setOpen(true)} disabled={ctx.completing}>
        {label}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-violet-200 p-3 space-y-2 bg-white/60">
      <p className="text-xs text-muted-foreground">No problem. Please let us know why, so that your Customer Success Manager has the full picture.</p>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: we do not keep a warm-lead list" className="h-9 text-sm bg-white" />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={ctx.completing || ctx.demo} onClick={() => ctx.onComplete({ declined: true, reason })}>
          {ctx.completing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm: nothing to add"}
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

/* ── Read document / link ────────────────────────────────────────────────── */

function ReadDocumentStep({ task, ctx }: { task: JourneyTask; ctx: StepCtx }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    if (task.document_path && !ctx.demo) {
      supabase.storage.from("client-onboarding-assets").createSignedUrl(task.document_path, 3600)
        .then(({ data, error }) => {
          if (cancelled) return;
          if (data?.signedUrl) setUrl(data.signedUrl);
          else if (error) setFailed(true);
        });
    }
    return () => { cancelled = true; };
  }, [task.document_path, ctx.demo]);

  usePrimaryAction({
    onClick: () => ctx.onComplete({}),
    disabled: ctx.demo,
    busy: ctx.completing,
    hint: task.document_path ? "Scroll through the whole guide, then mark this complete." : null,
  });

  if (!task.document_path) {
    return (
      <p className="text-sm text-muted-foreground">Your Customer Success Manager will share the guide with you. Please confirm once you have read it.</p>
    );
  }
  return (
    <InlineDocument
      title={task.label}
      url={url}
      loading={!url && !failed && !ctx.demo}
      error={failed ? "The document could not be loaded. Please tell your Customer Success Manager, then confirm once you have read it another way." : ctx.demo ? "The guide opens here in the live flow." : null}
    />
  );
}

function LinkStep({ task, ctx }: { task: JourneyTask; ctx: StepCtx }) {
  const [opened, setOpened] = useState(false);
  usePrimaryAction({
    onClick: () => ctx.onComplete({}),
    disabled: (!!task.link_url && !opened) || ctx.demo,
    busy: ctx.completing,
    hint: task.link_url && !opened ? "Open the link first, then come back and mark this complete." : null,
  });
  if (!task.link_url) return null;
  return (
    <Button asChild variant="outline" className={secondaryBtn}>
      <a href={task.link_url} target="_blank" rel="noreferrer" onClick={() => setOpened(true)}>
        <Link2 className="h-4 w-4 mr-1.5" /> Open the link <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
      </a>
    </Button>
  );
}

/* ── Review-mode summary (deck "Previous") ───────────────────────────────── */

export function taskSummary(task: JourneyTask): string[] {
  const a = (task.answers ?? {}) as Record<string, unknown>;
  if (a.declined) return [`Nothing to add${a.reason ? `: "${String(a.reason)}"` : ""}`];
  switch (task.step_type) {
    case "form": {
      const qs = (task.config?.questions as FormQuestion[] | undefined) ?? [];
      const n = qs.filter((q) => isAnswered(q, a[q.key])).length;
      if (task.config?.inline || qs.length <= 2) return qs.map((q) => `${q.label}: ${answerToText(a[q.key]) || "—"}`);
      return [`${n} of ${qs.length} questions answered`];
    }
    case "yes_no": {
      if (a.answer === "no") return ["Answered: not at present"];
      const out: string[] = [];
      const files = Array.isArray(a.file_paths) ? (a.file_paths as string[]) : [];
      const items = Array.isArray(a.items) ? (a.items as string[]) : [];
      if (files.length) out.push(`${files.length} file${files.length === 1 ? "" : "s"}: ${files.map(fileLabel).join(", ")}`);
      if (items.length) out.push(...items.map((i) => `• ${i}`));
      return out.length ? out : ["Complete"];
    }
    case "text_list": {
      const items = Array.isArray(a.items) ? (a.items as string[]) : [];
      return items.length ? items.map((i) => `• ${i}`) : ["Complete"];
    }
    case "upload": {
      const files = Array.isArray(a.file_paths) ? (a.file_paths as string[]) : task.file_path ? [task.file_path] : [];
      return files.length ? files.map(fileLabel) : ["Uploaded"];
    }
    case "booking":
      return ["Your onboarding call is booked. The invitation is in your inbox."];
    case "calendar_connect":
      return ["Calendar connected"];
    default:
      return ["Complete"];
  }
}
