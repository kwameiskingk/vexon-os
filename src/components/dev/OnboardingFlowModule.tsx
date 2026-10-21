// Dev Center · Onboarding Flow builder (Run 3, tabs + HR checklist 3 Sep).
//
// Flow tab: authors the onboarding_step_templates table — the step list every
// NEW starter is seeded with when the TA creates their profile. Edits here do
// NOT touch people already onboarding (their steps were copied at seed
// time); that is deliberate, so a flow change never yanks a checklist out
// from under someone mid-way.
//
// Ordering is the house manual-integer pattern (sort_order), phases are the
// two fixed ones (pre_start / day_one), and a step is one of: checkoff,
// link_confirm (open a link, then confirm), question (typed answer),
// read_document (full-screen reader), upload_proof, confirm_email (the
// mailbox yes/no card), quiz (7 Sep: the whole card is a quiz). A Loom or
// YouTube URL on any step becomes the card's media pane; the description is
// the card's intro copy. Any step may carry a quiz that gates completion,
// and a done label (past tense) for the finish card and Elena's sheet.
//
// HR checklist tab: the master list behind "Elena's checklist" in every
// starter's sheet (hr_starter_checklist_templates).

import { useRef, useState } from "react";
import { toast } from "sonner";
import { MediaFields } from "@/components/onboarding-deck/MediaFields";
import { OnboardingFlowSettingsPanel } from "@/components/dev/OnboardingFlowSettingsPanel";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import {
  uploadFlowDocument,
  useDeleteFlowStep,
  useOnboardingFlowTemplates,
  useSaveFlowStep,
  type FlowStepInput,
  type OnboardingFlowRow,
} from "@/hooks/useOnboardingFlow";
import {
  slugifyChecklistKey,
  useHrChecklistTemplates,
  useSaveChecklistTemplate,
  type HrChecklistTemplate,
} from "@/hooks/useHrStarterChecklist";
import { DEFAULT_PASS_MARK, PHASE_LABELS, type QuizDefinition, type QuizQuestion } from "@/lib/onboardingSteps";

type Tab = "flow" | "checklist";

export function OnboardingFlowModule() {
  const [tab, setTab] = useState<Tab>("flow");
  const tabs: { id: Tab; label: string }[] = [
    { id: "flow", label: "Flow" },
    { id: "checklist", label: "HR checklist" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {tabs.map((t) => (
          <button key={t.id} className={t.id === tab ? "dc-btn dc-btn-primary" : "dc-btn"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <span className="flex-1" />
        {/* WYSIWYG sandbox: the real starter deck over the flow AS CURRENTLY
            SAVED here, every card completable, nothing written. */}
        <a className="dc-btn dc-btn-primary shrink-0" href="/onboarding/sandbox" target="_blank" rel="noreferrer">
          Run the flow (sandbox) ↗
        </a>
      </div>
      {tab === "flow" ? <FlowTab /> : <ChecklistTab />}
    </div>
  );
}

/* ── Flow tab ─────────────────────────────────────────────────────────────── */

const EMPTY_DRAFT: FlowStepInput = {
  label: "",
  phase: "pre_start",
  step_type: "checkoff",
  link_url: null,
  video_url: null,
  thumbnail_path: null,
  video_path: null,
  intro_video_path: null,
  intro_video_url: null,
  done_label: null,
  quiz: null,
  question_prompt: null,
  sort_order: 0,
  enabled: true,
};

interface Readiness {
  docsReady: boolean;
  descReady: boolean;
  /** 4 Sep media migration: thumbnail_path / video_path columns exist. */
  mediaReady: boolean;
  /** 7 Sep refinement migration: quiz / done_label columns exist. */
  quizReady: boolean;
  /** 8 Sep intro-video migration: intro_video_path / intro_video_url exist. */
  introReady: boolean;
}

function FlowTab() {
  const { data: result } = useOnboardingFlowTemplates();
  const rows = result?.data ?? [];
  const migrationPending = result?.migrationPending ?? false;
  const ready: Readiness = {
    docsReady: result?.docsReady ?? false,
    descReady: result?.descReady ?? false,
    mediaReady: result?.mediaReady ?? false,
    introReady: result?.introReady ?? false,
    quizReady: result?.quizReady ?? false,
  };
  const save = useSaveFlowStep();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<FlowStepInput>(EMPTY_DRAFT);

  const nextOrder =
    rows.length > 0 ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1;

  const createStep = async () => {
    if (!draft.label.trim()) {
      toast.error("The step needs a label");
      return;
    }
    try {
      await save.mutateAsync(cleanDraft({ ...draft, sort_order: draft.sort_order || nextOrder }, ready));
      toast.success("Step added. New starters get it from now on");
      setAdding(false);
      setDraft(EMPTY_DRAFT);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  };

  if (migrationPending) {
    return (
      <div className="dc-surface p-6">
        <p className="text-sm text-[var(--dc-text)]">
          The flow-builder table doesn&apos;t exist yet. Run{" "}
          <span className="dc-mono text-xs">
            docs/pending-migrations/2026-08-18-onboarding-flow-builder.sql
          </span>{" "}
          in the hosted SQL editor, then reopen this module. Until then, new
          starters are seeded from the built-in default flow.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="dc-mono text-[11px] text-[var(--dc-text-dim)]">
        This flow seeds every NEW starter at profile creation. People already
        onboarding keep the deck they were given. Paste a Loom or YouTube link
        in the video field to make it the card&apos;s media pane; the description
        is what Elena says on the card.
        {!ready.descReady && (
          <span className="text-[var(--dc-amber)]"> Descriptions and the mailbox card type need the 3 Sep migration (20260903160000_sdr_deck_hr_checklist.sql).</span>
        )}
      </p>

      {!adding ? (
        <button className="dc-btn dc-btn-primary" onClick={() => {
          setDraft({ ...EMPTY_DRAFT, sort_order: nextOrder });
          setAdding(true);
        }}>
          <Plus className="h-3 w-3" /> Add step
        </button>
      ) : (
        <div className="dc-surface p-4 space-y-2">
          <StepFields draft={draft} onChange={setDraft} ready={ready} />
          <div className="flex justify-end gap-2">
            <button className="dc-btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="dc-btn dc-btn-primary" onClick={createStep}>
              Save step
            </button>
          </div>
        </div>
      )}

      {/* 11 Sep: the section-end screen and the closing video are not cards. */}
      <OnboardingFlowSettingsPanel />

      {(["pre_start", "day_one"] as const).map((phase) => {
        const phaseRows = rows.filter((r) => r.phase === phase);
        return (
          <div key={phase} className="dc-surface">
            <div className="border-b border-[var(--dc-border)]/60 px-4 py-2">
              <span className="dc-mono text-[11px] uppercase tracking-wide text-[var(--dc-text-dim)]">
                {PHASE_LABELS[phase]} · {phaseRows.length} step{phaseRows.length === 1 ? "" : "s"}
              </span>
            </div>
            {phaseRows.length === 0 ? (
              <p className="dc-mono p-4 text-center text-xs text-[var(--dc-text-dim)]">
                No steps in this phase.
              </p>
            ) : (
              phaseRows.map((r) => <StepEditor key={r.id} row={r} ready={ready} />)
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Drop questions that are not usable (blank prompt, fewer than two options). */
function cleanQuiz(quiz: QuizDefinition | null | undefined): QuizDefinition | null {
  if (!quiz) return null;
  const questions = quiz.questions
    .map((q) => ({
      prompt: q.prompt.trim(),
      options: q.options.map((o) => o.trim()).filter(Boolean),
      answer: q.answer,
    }))
    .filter((q) => q.prompt && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length);
  if (questions.length === 0) return null;
  return { questions, pass_mark: quiz.pass_mark || DEFAULT_PASS_MARK };
}

/** Trim strings and drop columns the database doesn't have yet. */
function cleanDraft(draft: FlowStepInput, ready: Readiness): FlowStepInput {
  const { document_path, description, thumbnail_path, video_path, intro_video_path, intro_video_url, done_label, quiz, ...rest } = draft;
  return {
    ...rest,
    label: draft.label.trim(),
    link_url: draft.link_url?.trim() || null,
    video_url: draft.video_url?.trim() || null,
    question_prompt: draft.question_prompt?.trim() || null,
    ...(ready.mediaReady
      ? { thumbnail_path: thumbnail_path || null, video_path: video_path || null }
      : {}),
    ...(ready.docsReady ? { document_path: document_path ?? null } : {}),
    ...(ready.descReady ? { description: description?.trim() || null } : {}),
    ...(ready.quizReady ? { done_label: done_label?.trim() || null, quiz: cleanQuiz(quiz) } : {}),
    ...(ready.introReady
      ? { intro_video_path: intro_video_path || null, intro_video_url: intro_video_url?.trim() || null }
      : {}),
  };
}

function StepEditor({ row, ready }: { row: OnboardingFlowRow; ready: Readiness }) {
  const save = useSaveFlowStep();
  const del = useDeleteFlowStep();
  const [draft, setDraft] = useState<FlowStepInput>({
    id: row.id,
    label: row.label,
    phase: row.phase,
    step_type: row.step_type,
    link_url: row.link_url,
    video_url: row.video_url,
    thumbnail_path: row.thumbnail_path ?? null,
    video_path: row.video_path ?? null,
    intro_video_path: row.intro_video_path ?? null,
    intro_video_url: row.intro_video_url ?? null,
    document_path: row.document_path ?? null,
    description: row.description ?? null,
    done_label: row.done_label ?? null,
    quiz: parseQuizDraft(row.quiz),
    question_prompt: row.question_prompt,
    sort_order: row.sort_order,
    enabled: row.enabled,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty =
    (draft.done_label ?? "") !== (row.done_label ?? "") ||
    JSON.stringify(cleanQuiz(draft.quiz)) !== JSON.stringify(cleanQuiz(parseQuizDraft(row.quiz))) ||
    draft.label !== row.label ||
    draft.phase !== row.phase ||
    draft.step_type !== row.step_type ||
    (draft.link_url ?? "") !== (row.link_url ?? "") ||
    (draft.video_url ?? "") !== (row.video_url ?? "") ||
    (draft.thumbnail_path ?? "") !== (row.thumbnail_path ?? "") ||
    (draft.video_path ?? "") !== (row.video_path ?? "") ||
    (draft.intro_video_path ?? "") !== (row.intro_video_path ?? "") ||
    (draft.intro_video_url ?? "") !== (row.intro_video_url ?? "") ||
    (draft.document_path ?? "") !== (row.document_path ?? "") ||
    (draft.description ?? "") !== (row.description ?? "") ||
    (draft.question_prompt ?? "") !== (row.question_prompt ?? "") ||
    draft.sort_order !== row.sort_order ||
    draft.enabled !== row.enabled;

  const persist = async () => {
    try {
      const clean = cleanDraft(draft, ready);
      await save.mutateAsync({ ...clean, label: clean.label || row.label });
      toast.success("Step saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  };

  const destroy = async () => {
    try {
      await del.mutateAsync(row.id);
      toast.success("Step deleted from the flow");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    }
  };

  return (
    <div className="border-b border-[var(--dc-border)]/60 p-4 last:border-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="dc-mono text-[10px] text-[var(--dc-text-dim)]">{row.step_key}</span>
        <div className="flex items-center gap-1.5">
          {!row.enabled && <span className="dc-pill">disabled</span>}
          {dirty && (
            <button className="dc-btn dc-btn-primary" onClick={persist}>
              Save
            </button>
          )}
          {confirmDelete ? (
            <>
              <button className="dc-btn" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
              <button className="dc-btn dc-btn-danger" onClick={destroy}>
                Really delete
              </button>
            </>
          ) : (
            <button className="dc-btn dc-btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <StepFields draft={draft} onChange={setDraft} ready={ready} />
    </div>
  );
}

/** The stored jsonb as an editable draft (keeps partially-written questions). */
function parseQuizDraft(raw: unknown): QuizDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { questions?: unknown; pass_mark?: unknown };
  const questions: QuizQuestion[] = Array.isArray(o.questions)
    ? o.questions.map((q) => {
        const qq = (q ?? {}) as { prompt?: unknown; options?: unknown; answer?: unknown };
        return {
          prompt: typeof qq.prompt === "string" ? qq.prompt : "",
          options: Array.isArray(qq.options) ? qq.options.map((x) => String(x ?? "")) : ["", ""],
          answer: Number.isInteger(Number(qq.answer)) ? Number(qq.answer) : 0,
        };
      })
    : [];
  if (questions.length === 0) return null;
  const pm = Number(o.pass_mark);
  return { questions, pass_mark: Number.isFinite(pm) && pm > 0 ? pm : DEFAULT_PASS_MARK };
}

function StepFields({
  draft,
  onChange,
  ready,
}: {
  draft: FlowStepInput;
  onChange: (d: FlowStepInput) => void;
  ready: Readiness;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const pickDocument = async (file: File) => {
    setUploading(true);
    try {
      const path = await uploadFlowDocument(file);
      onChange({ ...draft, document_path: path });
      toast.success("Document uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="dc-input flex-1"
          placeholder="Card title, what the starter reads"
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
        />
        <input
          className="dc-input w-20"
          type="number"
          title="Order"
          value={draft.sort_order}
          onChange={(e) => onChange({ ...draft, sort_order: Number(e.target.value) || 0 })}
        />
      </div>
      {ready.descReady && (
        <textarea
          className="dc-input w-full min-h-[64px]"
          placeholder="The card's intro copy (the card speaks; no name is shown), optional"
          value={draft.description ?? ""}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
      )}
      {ready.quizReady && (
        <input
          className="dc-input w-full"
          placeholder="Done label, past tense, shown once complete (e.g. Headset ordered), optional"
          value={draft.done_label ?? ""}
          onChange={(e) => onChange({ ...draft, done_label: e.target.value })}
        />
      )}
      <div className="flex gap-2">
        <select
          className="dc-select"
          value={draft.phase}
          onChange={(e) => onChange({ ...draft, phase: e.target.value })}
        >
          <option value="pre_start">Before you start</option>
          <option value="day_one">Day one</option>
        </select>
        <select
          className="dc-select"
          value={draft.step_type}
          onChange={(e) => onChange({ ...draft, step_type: e.target.value })}
        >
          <option value="checkoff">Tick off (video optional)</option>
          <option value="link_confirm">Open a link, then confirm</option>
          <option value="question">Answer a question</option>
          {ready.docsReady && <option value="read_document">Read a document</option>}
          {ready.docsReady && <option value="upload_proof">Upload proof</option>}
          {ready.docsReady && <option value="profile_photo">Profile photo (becomes their avatar)</option>}
          {ready.descReady && <option value="confirm_email">Confirm mailbox (yes/no + email)</option>}
          {ready.quizReady && <option value="quiz">Quiz (the whole card)</option>}
        </select>
        <label className="dc-label flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => onChange({ ...draft, enabled: e.target.checked })}
          />
          enabled
        </label>
      </div>
      {(draft.step_type === "link_confirm" || draft.step_type === "upload_proof" || draft.step_type === "checkoff") && (
        <textarea
          className="dc-input w-full min-h-[44px]"
          placeholder={
            draft.step_type === "link_confirm"
              ? "Link the starter opens (calendar, handbook…). One URL per line for several buttons."
              : "Optional links shown on the card as buttons, one URL per line (e.g. the Amazon and Takealot headset pages)"
          }
          value={draft.link_url ?? ""}
          onChange={(e) => onChange({ ...draft, link_url: e.target.value })}
        />
      )}
      {(draft.step_type === "question" || draft.step_type === "confirm_email") && (
        <input
          className="dc-input"
          placeholder={draft.step_type === "confirm_email" ? "The yes/no question on the card" : "Question prompt the starter answers"}
          value={draft.question_prompt ?? ""}
          onChange={(e) => onChange({ ...draft, question_prompt: e.target.value })}
        />
      )}
      {draft.step_type === "read_document" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="dc-btn"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
            {draft.document_path ? "Replace document" : "Upload document (PDF)"}
          </button>
          {draft.document_path && (
            <span className="dc-mono truncate text-[10px] text-[var(--dc-text-dim)]">
              {draft.document_path.split("/").pop()}
            </span>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickDocument(f);
            }}
          />
        </div>
      )}
      {draft.step_type === "upload_proof" && (
        <p className="dc-mono text-[10px] text-[var(--dc-text-dim)]">
          The starter drops in a photo, screenshot or PDF (e.g. their headset
          order); saving it completes the card and Elena can view it.
        </p>
      )}
      {draft.step_type === "profile_photo" && (
        <p className="dc-mono text-[10px] text-[var(--dc-text-dim)]">
          Image only. The upload becomes the starter's Vexon OS avatar straight
          away and a private copy lands in Employee Hub → Documents, where HR
          downloads it for Google Workspace.
        </p>
      )}
      {ready.quizReady && (
        <QuizEditor
          whole={draft.step_type === "quiz"}
          quiz={draft.quiz ?? null}
          onChange={(quiz) => onChange({ ...draft, quiz })}
        />
      )}
      {ready.introReady && (
        <MediaFields
          mode="intro"
          value={{
            thumbnailPath: "",
            videoPath: draft.intro_video_path ?? "",
            videoUrl: draft.intro_video_url ?? "",
          }}
          onChange={(patch) =>
            onChange({
              ...draft,
              ...(patch.videoPath !== undefined ? { intro_video_path: patch.videoPath || null } : {}),
              ...(patch.videoUrl !== undefined ? { intro_video_url: patch.videoUrl } : {}),
            })
          }
        />
      )}
      {ready.mediaReady ? (
        <MediaFields
          value={{
            thumbnailPath: draft.thumbnail_path ?? "",
            videoPath: draft.video_path ?? "",
            videoUrl: draft.video_url ?? "",
          }}
          onChange={(patch) =>
            onChange({
              ...draft,
              ...(patch.thumbnailPath !== undefined ? { thumbnail_path: patch.thumbnailPath || null } : {}),
              ...(patch.videoPath !== undefined ? { video_path: patch.videoPath || null } : {}),
              ...(patch.videoUrl !== undefined ? { video_url: patch.videoUrl } : {}),
            })
          }
        />
      ) : (
        <input
          className="dc-input"
          placeholder="Video URL (Loom or YouTube), becomes the card's media pane, optional"
          value={draft.video_url ?? ""}
          onChange={(e) => onChange({ ...draft, video_url: e.target.value })}
        />
      )}
    </div>
  );
}

/* ── Quiz editor (7 Sep) ──────────────────────────────────────────────────── */

const EMPTY_QUESTION: QuizQuestion = { prompt: "", options: ["", ""], answer: 0 };

function QuizEditor({
  whole,
  quiz,
  onChange,
}: {
  whole: boolean;
  quiz: QuizDefinition | null;
  onChange: (q: QuizDefinition | null) => void;
}) {
  const questions = quiz?.questions ?? [];
  const passMark = quiz?.pass_mark ?? DEFAULT_PASS_MARK;
  const set = (next: QuizQuestion[], pm = passMark) => onChange(next.length ? { questions: next, pass_mark: pm } : null);
  const update = (i: number, patch: Partial<QuizQuestion>) =>
    set(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  if (!whole && questions.length === 0) {
    return (
      <button type="button" className="dc-btn" onClick={() => set([{ ...EMPTY_QUESTION }])}>
        <Plus className="h-3 w-3" /> Add a quiz to this card
      </button>
    );
  }

  return (
    <div className="rounded-md border border-[var(--dc-border)]/60 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="dc-mono text-[11px] uppercase tracking-wide text-[var(--dc-text-dim)]">
          {whole ? "Quiz" : "Quiz at the end of this card"} · {questions.length} question{questions.length === 1 ? "" : "s"}
        </span>
        <span className="flex-1" />
        <label className="dc-label flex items-center gap-1.5">
          pass mark
          <input
            className="dc-input w-16"
            type="number"
            min={1}
            max={100}
            value={passMark}
            onChange={(e) => set(questions, Math.min(100, Math.max(1, Number(e.target.value) || DEFAULT_PASS_MARK)))}
          />
          %
        </label>
        {!whole && (
          <button type="button" className="dc-btn dc-btn-danger" title="Remove the quiz" onClick={() => onChange(null)}>
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {questions.map((q, i) => (
        <div key={i} className="space-y-1.5 rounded border border-[var(--dc-border)]/40 p-2">
          <div className="flex gap-2">
            <span className="dc-mono w-5 shrink-0 pt-1.5 text-[10px] text-[var(--dc-text-dim)]">{i + 1}.</span>
            <input
              className="dc-input flex-1"
              placeholder="Question"
              value={q.prompt}
              onChange={(e) => update(i, { prompt: e.target.value })}
            />
            <button type="button" className="dc-btn dc-btn-danger" onClick={() => set(questions.filter((_, j) => j !== i))}>
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-1 pl-7">
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`quiz-answer-${i}`}
                  title="Correct answer"
                  checked={q.answer === oi}
                  onChange={() => update(i, { answer: oi })}
                />
                <input
                  className="dc-input flex-1"
                  placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                  value={opt}
                  onChange={(e) => update(i, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })}
                />
                {q.options.length > 2 && (
                  <button
                    type="button"
                    className="dc-btn"
                    onClick={() =>
                      update(i, {
                        options: q.options.filter((_, k) => k !== oi),
                        answer: q.answer === oi ? 0 : q.answer > oi ? q.answer - 1 : q.answer,
                      })
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {q.options.length < 6 && (
              <button type="button" className="dc-btn" onClick={() => update(i, { options: [...q.options, ""] })}>
                <Plus className="h-3 w-3" /> Option
              </button>
            )}
            <p className="dc-mono text-[10px] text-[var(--dc-text-dim)]">Select the radio button next to the correct answer.</p>
          </div>
        </div>
      ))}
      <button type="button" className="dc-btn" onClick={() => set([...questions, { ...EMPTY_QUESTION }])}>
        <Plus className="h-3 w-3" /> Add question
      </button>
    </div>
  );
}

/* ── HR checklist tab ─────────────────────────────────────────────────────── */

function ChecklistTab() {
  const { data } = useHrChecklistTemplates();
  const save = useSaveChecklistTemplate();
  const rows = data?.data ?? [];
  const [newLabel, setNewLabel] = useState("");

  if (data?.migrationPending) {
    return (
      <div className="dc-surface p-6">
        <p className="text-sm text-[var(--dc-text)]">
          The HR checklist tables don&apos;t exist yet. Run{" "}
          <span className="dc-mono text-xs">supabase/migrations/20260903160000_sdr_deck_hr_checklist.sql</span>{" "}
          in the hosted SQL editor, then reopen this tab.
        </p>
      </div>
    );
  }

  const add = async () => {
    const label = newLabel.trim();
    if (!label) return;
    const base = slugifyChecklistKey(label);
    const key = rows.some((r) => r.key === base) ? `${base}_${Date.now().toString(36)}` : base;
    const sort_order = rows.length > 0 ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1;
    try {
      await save.mutateAsync({ key, label, sort_order, enabled: true });
      toast.success("Added. It appears on every starter sheet opened from now on");
      setNewLabel("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  };

  return (
    <div className="space-y-4">
      <p className="dc-mono text-[11px] text-[var(--dc-text-dim)]">
        Elena&apos;s own to-dos per starter, shown as tick boxes in each starter&apos;s
        sheet (Candidate Tracking → Onboarding progress). Items are created for
        a starter the first time their sheet is opened; disabling a template
        stops it appearing for new starters but keeps existing ticks.
      </p>
      <div className="dc-surface">
        {rows.length === 0 ? (
          <p className="dc-mono p-4 text-center text-xs text-[var(--dc-text-dim)]">No checklist items yet.</p>
        ) : (
          rows.map((r) => <ChecklistTemplateEditor key={r.key} row={r} />)
        )}
      </div>
      <div className="dc-surface p-4 flex gap-2">
        <input
          className="dc-input flex-1"
          placeholder="New checklist item, e.g. Added to payroll"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <button className="dc-btn dc-btn-primary" disabled={!newLabel.trim() || save.isPending} onClick={add}>
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
    </div>
  );
}

function ChecklistTemplateEditor({ row }: { row: HrChecklistTemplate }) {
  const save = useSaveChecklistTemplate();
  const [draft, setDraft] = useState<HrChecklistTemplate>(row);
  const dirty = draft.label !== row.label || draft.sort_order !== row.sort_order || draft.enabled !== row.enabled;

  const persist = async () => {
    try {
      await save.mutateAsync({ ...draft, label: draft.label.trim() || row.label });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  };

  return (
    <div className="border-b border-[var(--dc-border)]/60 p-3 last:border-0 flex items-center gap-2">
      <span className="dc-mono w-40 shrink-0 truncate text-[10px] text-[var(--dc-text-dim)]" title={row.key}>{row.key}</span>
      <input
        className="dc-input flex-1"
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
      />
      <input
        className="dc-input w-20"
        type="number"
        title="Order"
        value={draft.sort_order}
        onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })}
      />
      <label className="dc-label flex items-center gap-1.5">
        <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
        enabled
      </label>
      {!row.enabled && <span className="dc-pill">disabled</span>}
      {dirty && (
        <button className="dc-btn dc-btn-primary" disabled={save.isPending} onClick={persist}>
          Save
        </button>
      )}
    </div>
  );
}
