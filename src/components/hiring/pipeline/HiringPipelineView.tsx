// The hiring pipeline as a Kanban board.
//
// ONE component, three mounts — the CEO's HR & Hiring view, Ops Command
// Hiring, and the TA's Candidate Tracking tab. What differs between them is
// props, not code: `canAct` gates dragging and the panel's stage actions.
//
// Columns are the forward flow (LCT Booked → Hired); the terminal lanes
// (LCT Failed, Not Suitable, Bypass) live in a collapsed "Closed" section
// below the board. Dragging a card between columns writes stage_key ONLY —
// pipeline_stage, status and the stage dates are derived by the M4 DB
// trigger and must never be written from here. Drops into Offer or Hired
// confirm first, because the trigger stamps offer_letter_date /
// accepted_date on those moves and both feed CEO tiles.
//
// Moves to the closed lanes are deliberately NOT draggable: they carry a
// typed reason, which a drag can't capture — use the card's side panel
// (StageActions) for those.

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AlertTriangle, ChevronDown, GripVertical, Loader2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  FLOW_STAGES,
  PIPELINE_STAGES,
  stageLabel,
  stageMeta,
  type StageKey,
} from "@/lib/hiringPipeline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useHiringPipeline,
  useMoveCandidateStage,
  type PipelineCandidateRow,
} from "@/hooks/useHiringPipeline";
import { useOfferHandoffs } from "@/hooks/useFinalInterview";
import { useBookingEvent, bookCandidateSlot, FINAL_INTERVIEW_EVENT_SLUG } from "@/hooks/useBookingEvent";
import { BookingSlotPicker, utcToLondonParts } from "@/components/bookings/BookingSlotPicker";
import { CandidatePipelineDetail } from "./CandidatePipelineDetail";

interface HiringPipelineViewProps {
  /** False = read-only: no dragging, no stage actions in the panel. */
  canAct?: boolean;
  /** True on the CEO's HR & Hiring mount: the detail panel's final-interview
      questions become editable and the Pass on action appears. */
  ceoView?: boolean;
  /** Rendered inside the detail sheet, under the actions. */
  detailFooter?: (candidate: PipelineCandidateRow) => React.ReactNode;
  /** Rendered between the board and the Closed section — the TA mount slots
      its Still-to-call list and Onboarding progress here (Run 3 ordering:
      Pipeline → To call → Onboarding → Closed). */
  belowBoardSlot?: React.ReactNode;
}

// The board's forward flow, left to right.
// The board's columns ARE the forward flow, minus Screening (those sit in the
// Call List tab). Derived from PIPELINE_STAGES rather than written out, so a
// stage added to the vocabulary shows up here instead of silently vanishing
// from the board — which is exactly what happened to Trial Day on 15 Sep.
const ACTIVE_COLUMNS: StageKey[] = FLOW_STAGES.filter((s) => s.key !== "screening").map((s) => s.key);

// Terminal lanes, shown collapsed below the board.
// 22 Sep: `booked` and `lct_passed` are retired but kept as lanes so no row
// can ever become invisible. Empty lanes are not rendered, so once the last
// LCT candidate is moved on they disappear by themselves.
const CLOSED_LANES: StageKey[] = ["lct_failed", "not_suitable", "bypass", "left", "booked", "lct_passed"];

/** Retired lanes only appear while they still hold somebody. */
const RETIRED_LANES: StageKey[] = ["booked", "lct_passed"];

// Drops into these stages stamp a CEO-tile date via the M4 trigger
// (ceo_trial_call_date for the LCT verdicts, offer_letter_date for offer,
// accepted_date for hired) — they confirm before committing. lct_failed is
// listed for completeness: the Closed lanes aren't drop targets today, but
// if they ever become one the guard is already in place.
const CONFIRM_STAGES = new Set<StageKey>(["final_interview", "lct_failed", "offer", "hired"]);

const CONFIRM_COPY: Partial<Record<StageKey, string>> = {
  final_interview:
    "Book the interview on Marcus's calendar now, or hand the scheduling to the TA.",
  lct_failed:
    "This stamps today as the trial date, which feeds the CEO hiring metrics.",
  offer:
    "This stamps today as the offer date, which feeds the CEO hiring metrics. Offer terms (wage, start date) can be added from the candidate's panel.",
  hired:
    "This stamps today as the acceptance date, which feeds the CEO hiring metrics.",
};

// Per-stage column dressing. Keyed by stage_key — the shared tone enum
// (progress/good/bad/warn) is too coarse for a board where four in-flight
// stages sat side by side in the same blue. Low-alpha tints, never solid
// fills (house rule). The hiringPipeline.ts tone enum is untouched; this
// map is the board's own vocabulary. Left to right the flow reads:
// sky → emerald → violet → fuchsia → orange → cyan → emerald, so no two
// adjacent columns share a hue. Closed lanes keep red / red / amber.
interface StageAccent {
  header: string;
  dot: string;
  count: string;
  ring: string;
}

// Written out literally so Tailwind's scanner sees every class name —
// dynamic template strings would be purged from the build.
const STAGE_ACCENTS: Partial<Record<StageKey, StageAccent>> = {
  booked: {
    header: "bg-sky-500/10 border-b-sky-500/20",
    dot: "bg-sky-500",
    count: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    ring: "ring-sky-500/40 bg-sky-500/[0.06]",
  },
  lct_passed: {
    header: "bg-emerald-500/10 border-b-emerald-500/20",
    dot: "bg-emerald-500",
    count: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/40 bg-emerald-500/[0.06]",
  },
  final_interview: {
    header: "bg-violet-500/10 border-b-violet-500/20",
    dot: "bg-violet-500",
    count: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    ring: "ring-violet-500/40 bg-violet-500/[0.06]",
  },
  trial_day: {
    header: "bg-fuchsia-500/10 border-b-fuchsia-500/20",
    dot: "bg-fuchsia-500",
    count: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
    ring: "ring-fuchsia-500/40 bg-fuchsia-500/[0.06]",
  },
  offer: {
    header: "bg-orange-500/10 border-b-orange-500/20",
    dot: "bg-orange-500",
    count: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    ring: "ring-orange-500/40 bg-orange-500/[0.06]",
  },
  onboarding: {
    header: "bg-cyan-500/10 border-b-cyan-500/20",
    dot: "bg-cyan-500",
    count: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
    ring: "ring-cyan-500/40 bg-cyan-500/[0.06]",
  },
  hired: {
    header: "bg-emerald-500/10 border-b-emerald-500/20",
    dot: "bg-emerald-500",
    count: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/40 bg-emerald-500/[0.06]",
  },
  lct_failed: {
    header: "bg-red-500/[0.08] border-b-red-500/20",
    dot: "bg-red-500",
    count: "bg-red-500/10 text-red-700 dark:text-red-300",
    ring: "ring-red-500/40 bg-red-500/[0.06]",
  },
  not_suitable: {
    header: "bg-red-500/[0.08] border-b-red-500/20",
    dot: "bg-red-500",
    count: "bg-red-500/10 text-red-700 dark:text-red-300",
    ring: "ring-red-500/40 bg-red-500/[0.06]",
  },
  bypass: {
    header: "bg-amber-500/10 border-b-amber-500/20",
    dot: "bg-amber-500",
    count: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    ring: "ring-amber-500/40 bg-amber-500/[0.06]",
  },
  left: {
    header: "bg-slate-500/10 border-b-slate-500/20",
    dot: "bg-slate-500",
    count: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    ring: "ring-slate-500/40 bg-slate-500/[0.06]",
  },
};

const NEUTRAL_ACCENT: StageAccent = {
  header: "bg-muted/60 border-b-border",
  dot: "bg-muted-foreground/50",
  count: "bg-muted text-muted-foreground",
  ring: "ring-border bg-muted/40",
};

const accentFor = (stage: StageKey): StageAccent =>
  STAGE_ACCENTS[stage] ?? NEUTRAL_ACCENT;

const fmtDate = (d: string | null) => (d ? format(parseISO(d), "d MMM") : null);
const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : null);

/** The date/time this candidate is waiting on, for the card's footer line. */
function cardWhen(c: PipelineCandidateRow): string | null {
  switch (c.stage_key) {
    case "trial_day":
      return fmtDate(c.trial_day_date);
    case "booked":
      return [fmtDate(c.lct_booked_date), fmtTime(c.lct_booked_time)].filter(Boolean).join(" · ") || null;
    case "final_interview":
      return [fmtDate(c.sdr_interview_date), fmtTime(c.final_interview_time)].filter(Boolean).join(" · ") || null;
    case "lct_passed":
    case "lct_failed":
      return fmtDate(c.ceo_trial_call_date);
    case "offer":
      return fmtDate(c.offer_letter_date);
    case "hired":
      return fmtDate(c.accepted_date);
    default:
      return null;
  }
}

const fullName = (c: PipelineCandidateRow) =>
  `${c.first_name} ${c.last_name}`.trim() || "Unknown";

// ── Card ──────────────────────────────────────────────────────────────────

function CandidateCard({
  candidate,
  draggable,
  offerHandoff,
  onOpen,
}: {
  candidate: PipelineCandidateRow;
  draggable: boolean;
  /** CEO clicked "Pass on" — the TA owns the offer details now. */
  offerHandoff?: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: candidate.id,
    disabled: !draggable,
  });

  // CEO chose "Send to TA": the card glows until the TA books the final
  // interview from its side panel (Run 3).
  const needsScheduling =
    candidate.stage_key === "trial_day" && !candidate.sdr_interview_date;

  // Chase flag (Marcus's spec): at Final Interview with no CV on file. The
  // PipelineTrackingView banner and the card's side panel both point back here.
  const missingCv =
    candidate.stage_key === "final_interview" && !candidate.cv_file;

  // Drag listeners live on a dedicated grip, not the card itself, so
  // click/Enter on the card always opens the panel — including for keyboard
  // users, for whom Enter on the grip starts a keyboard drag instead.
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative rounded-md border border-border bg-background shadow-sm transition-shadow hover:shadow",
        needsScheduling &&
          "border-amber-500/60 ring-2 ring-amber-500/30 bg-amber-500/[0.05] shadow-[0_0_12px_rgba(245,158,11,0.25)]",
        isDragging && "opacity-40",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn("w-full px-3.5 py-2.5 text-left", draggable && "pr-9")}
      >
        <CardBody candidate={candidate} />
        {needsScheduling && (
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            Needs final-interview date
          </span>
        )}
        {offerHandoff && (
          <span className="mt-1.5 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            Offer details needed
          </span>
        )}
        {missingCv && (
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            No CV
          </span>
        )}
      </button>
      {draggable && (
        <button
          type="button"
          aria-label={`Drag ${fullName(candidate)} to another stage`}
          {...listeners}
          {...attributes}
          className="absolute right-1 top-1/2 -translate-y-1/2 cursor-grab touch-none rounded p-1.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Shared between the in-column card and the drag overlay, so the thing under
// the pointer looks exactly like the thing being moved.
function CardBody({ candidate }: { candidate: PipelineCandidateRow }) {
  const when = cardWhen(candidate);
  return (
    <>
      <p className="truncate text-sm font-medium text-foreground">{fullName(candidate)}</p>
      {candidate.mobile_phone && (
        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <Phone className="h-3 w-3 shrink-0" />
          {candidate.mobile_phone}
        </p>
      )}
      {candidate.email && (
        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <Mail className="h-3 w-3 shrink-0" />
          {candidate.email}
        </p>
      )}
      {when && (
        <p className="mt-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{when}</p>
      )}
    </>
  );
}

// ── Column ────────────────────────────────────────────────────────────────

function StageColumn({
  stage,
  items,
  draggable,
  handoffs,
  onOpen,
}: {
  stage: StageKey;
  items: PipelineCandidateRow[];
  draggable: boolean;
  handoffs?: Map<string, string>;
  onOpen: (c: PipelineCandidateRow) => void;
}) {
  const meta = stageMeta(stage)!;
  const accent = accentFor(stage);
  const { setNodeRef, isOver } = useDroppable({ id: `col-${stage}` });

  // flex-1 + min-width: the columns share the full row width equally on a wide
  // screen; below ~n×15rem they stop shrinking and the wrapper's
  // overflow-x-auto takes over as a horizontal scroll.
  return (
    <section className="flex min-w-[15rem] flex-1 flex-col rounded-lg border border-border bg-card">
      <header className={cn("rounded-t-lg border-b px-3 py-2", accent.header)}>
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", accent.dot)} />
          <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
          <span
            className={cn(
              "ml-auto rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums",
              accent.count,
            )}
          >
            {items.length}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta.hint}</p>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2.5 rounded-b-lg p-2.5 transition-colors min-h-[8rem]",
          isOver && cn("ring-2 ring-inset", accent.ring),
        )}
      >
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-2 py-4 text-center text-xs text-muted-foreground">
            {draggable ? "Drop a candidate here" : "Nobody at this stage"}
          </p>
        ) : (
          items.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              draggable={draggable}
              offerHandoff={handoffs?.has(c.id)}
              onOpen={() => onOpen(c)}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ── The board ─────────────────────────────────────────────────────────────

export function HiringPipelineView({
  canAct = false,
  ceoView = false,
  detailFooter,
  belowBoardSlot,
}: HiringPipelineViewProps) {
  const { data: result, isLoading, isError } = useHiringPipeline();
  const { data: handoffs } = useOfferHandoffs();
  const move = useMoveCandidateStage();
  const [selected, setSelected] = useState<PipelineCandidateRow | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    candidate: PipelineCandidateRow;
    toStage: StageKey;
  } | null>(null);
  // Final-interview booking captured inside the LCT Passed confirm (Run 2).
  const [fiDate, setFiDate] = useState("");
  const [fiTime, setFiTime] = useState("");
  // Live slot on Marcus's calendar; manual entry stays as the fallback.
  const [fiSlot, setFiSlot] = useState<string | null>(null);
  const [fiManual, setFiManual] = useState(false);
  const { data: fiEvent } = useBookingEvent(FINAL_INTERVIEW_EVENT_SLUG);
  const [closedOpen, setClosedOpen] = useState(false);
  const [hiredOpen, setHiredOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const rows = useMemo(() => result?.data ?? [], [result]);
  const migrationPending = result?.migrationPending ?? false;
  const draggable = canAct && !migrationPending;

  const byStage = useMemo(() => {
    const map = new Map<StageKey, PipelineCandidateRow[]>();
    for (const s of PIPELINE_STAGES) map.set(s.key, []);
    for (const r of rows) {
      // Pre-M4 every stage_key is null; park those under screening so the
      // roster is still visible (with the banner explaining why).
      const key = (r.stage_key ?? "screening") as StageKey;
      map.get(key)?.push(r);
    }
    return map;
  }, [rows]);

  // stage_key = 'screening' rows aren't on the board's forward flow — they
  // still live in the Call List. Surfaced in the Closed section only when
  // any exist, so no candidate is ever invisible.
  const screeningRows = byStage.get("screening") ?? [];
  const hiredRows = byStage.get("hired") ?? [];
  const closedCount =
    CLOSED_LANES.reduce((n, s) => n + (byStage.get(s)?.length ?? 0), 0) + screeningRows.length;

  const commit = (
    candidate: PipelineCandidateRow,
    toStage: StageKey,
    opts?: { sendToTa?: boolean },
  ) => {
    move.mutate(
      {
        candidateId: candidate.id,
        toStage,
        candidateName: fullName(candidate),
        // Entering Final Interview with this null fires the CV chase alert.
        cvFile: candidate.cv_file,
        // Passing the trial either schedules the final interview there and
        // then (the card auto-moves on that day), or hands the scheduling to
        // the TA — her card glows until she books it.
        ...(toStage === "final_interview"
          ? opts?.sendToTa
            ? { notifyTaToSchedule: true }
            : { finalInterviewDate: fiDate || null, finalInterviewTime: fiTime || null }
          : {}),
      },
      {
        onSuccess: () => {
          toast.success(`${fullName(candidate)} moved to ${stageLabel(toStage)}`);
          // Live slot picked → book Marcus's calendar and invite the candidate
          // (Google Meet event + invite + SMS + reminders). The stage move is
          // already committed, so a booking hiccup loses nothing.
          if (
            toStage === "final_interview" && !opts?.sendToTa &&
            fiSlot && fiEvent && !fiManual
          ) {
            void bookCandidateSlot({
              eventTypeId: fiEvent.eventTypeId,
              hostUserId: fiEvent.hostUserId,
              startsAt: fiSlot,
              name: fullName(candidate),
              email: candidate.email,
              mobile: candidate.mobile_phone,
            }).then((booked) => {
              if (booked.ok) {
                toast.success("Final interview booked on Marcus's calendar — invite sent");
                if (candidate.mobile_phone && booked.smsSent === false) {
                  toast.warning("The confirmation SMS didn't send — the number may be invalid.");
                }
              } else toast.error(`Interview date saved, but the calendar booking failed: ${booked.error}`);
            });
          }
        },
        onError: (err) =>
          toast.error(
            `Couldn't move ${fullName(candidate)}: ${err instanceof Error ? err.message : "unknown error"}`,
          ),
      },
    );
  };

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const overId = over.id as string;
    if (!overId.startsWith("col-")) return;
    const toStage = overId.slice(4) as StageKey;
    const candidate = rows.find((r) => r.id === (active.id as string));
    if (!candidate || candidate.stage_key === toStage) return;
    if (CONFIRM_STAGES.has(toStage)) {
      setFiDate("");
      setFiTime("");
      setFiSlot(null);
      setFiManual(false);
      setPendingMove({ candidate, toStage });
    } else {
      commit(candidate, toStage);
    }
  };

  const activeCandidate = activeId ? rows.find((r) => r.id === activeId) : null;
  const selectedLive = selected ? rows.find((r) => r.id === selected.id) ?? selected : null;

  return (
    <div className="space-y-4">
      {migrationPending && (
        <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-foreground">
            The pipeline migration hasn&apos;t been run yet, so stages can&apos;t load and
            moves are disabled. Run section <strong>M4</strong> of{" "}
            <code className="text-xs">docs/pending-migrations/2026-08-14-ta-portal-and-hiring-pipeline.sql</code>.
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading pipeline…</p>
      ) : isError ? (
        <p className="px-4 py-8 text-center text-sm text-destructive">
          Couldn&apos;t load the pipeline — try refreshing.
        </p>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto pb-1">
            <div className="flex items-stretch gap-3">
              {ACTIVE_COLUMNS.map((stage) => (
                <StageColumn
                  key={stage}
                  stage={stage}
                  items={byStage.get(stage) ?? []}
                  draggable={draggable}
                  handoffs={handoffs}
                  onOpen={setSelected}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeCandidate ? (
              <div className="w-60 rounded-md border border-border bg-background px-3.5 py-2.5 shadow-lg">
                <CardBody candidate={activeCandidate} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {belowBoardSlot}

      {/* 22 Sep (the owner): Hired is no longer a board column — Elena wants to
          see who is moving, with the hired list underneath. */}
      <section className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setHiredOpen((o) => !o)}
          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
          aria-expanded={hiredOpen}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              !hiredOpen && "-rotate-90",
            )}
          />
          <h3 className="text-sm font-semibold text-foreground">Hired</h3>
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-px text-[11px] font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
            {hiredRows.length}
          </span>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
            Onboarding complete
          </span>
        </button>
        {hiredOpen && (
          <div className="flex flex-wrap gap-1.5 border-t border-border p-3">
            {hiredRows.length === 0 ? (
              <p className="px-1 py-1.5 text-xs text-muted-foreground">Nobody hired yet.</p>
            ) : (
              hiredRows.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className="rounded border border-border/60 bg-background px-2.5 py-1.5 text-left hover:bg-muted/50"
                >
                  <p className="truncate text-xs font-medium text-foreground">{fullName(c)}</p>
                  {c.accepted_date && (
                    <p className="truncate text-[11px] text-muted-foreground">{fmtDate(c.accepted_date)}</p>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </section>

      {/* Closed lanes — collapsed by default. Display-only: moving someone
          here carries a typed reason, which happens in the side panel. */}
      <section className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setClosedOpen((o) => !o)}
          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
          aria-expanded={closedOpen}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              !closedOpen && "-rotate-90",
            )}
          />
          <h3 className="text-sm font-semibold text-foreground">Closed</h3>
          <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums text-muted-foreground">
            {closedCount}
          </span>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
            Not taken forward, not suitable, bypass, left
          </span>
        </button>

        {closedOpen && (
          <div className="grid grid-cols-1 gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
            {CLOSED_LANES.filter((stage) => (byStage.get(stage)?.length ?? 0) > 0 || !RETIRED_LANES.includes(stage)).map((stage) => {
              const meta = stageMeta(stage)!;
              const accent = accentFor(stage);
              const items = byStage.get(stage) ?? [];
              return (
                <div key={stage} className="rounded-md border border-border/60">
                  <div className={cn("flex items-center gap-2 rounded-t-md border-b px-2.5 py-1.5", accent.header)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", accent.dot)} />
                    <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                    <span className={cn("ml-auto rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums", accent.count)}>
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-1.5 p-2">
                    {items.length === 0 ? (
                      <p className="px-1 py-1.5 text-xs text-muted-foreground">Nobody here.</p>
                    ) : (
                      items.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelected(c)}
                          className="w-full rounded border border-border/60 bg-background px-2.5 py-1.5 text-left hover:bg-muted/50"
                        >
                          <p className="truncate text-xs font-medium text-foreground">{fullName(c)}</p>
                          {c.exit_reason && (
                            <p className="truncate text-[11px] text-muted-foreground">{c.exit_reason}</p>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}

            {screeningRows.length > 0 && (
              <div className="rounded-md border border-border/60 sm:col-span-2 lg:col-span-4">
                <div className="flex items-center gap-2 rounded-t-md border-b border-border bg-muted/60 px-2.5 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                  <span className="text-xs font-semibold text-foreground">
                    Screening — not yet booked
                  </span>
                  <span className="ml-auto rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums text-muted-foreground">
                    {screeningRows.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2">
                  {screeningRows.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelected(c)}
                      className="rounded border border-border/60 bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/50"
                    >
                      {fullName(c)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Confirm dialog for the two CEO-date-stamping stages. */}
      <Dialog open={pendingMove !== null} onOpenChange={(o) => !o && setPendingMove(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Move to {stageLabel(pendingMove?.toStage)}
              {pendingMove ? ` — ${fullName(pendingMove.candidate)}` : ""}
            </DialogTitle>
            <DialogDescription>
              {(pendingMove && CONFIRM_COPY[pendingMove.toStage]) ??
                "This move stamps a date that feeds the CEO hiring metrics."}
            </DialogDescription>
          </DialogHeader>
          {/* Passing the trial books the final interview in the same breath
              (Run 2 ruling). Run 3: the CEO can instead hand the scheduling
              to the TA — her card glows until she books it. */}
          {pendingMove?.toStage === "final_interview" && (
            <div className="space-y-2 min-w-0">
              <div className="flex items-center justify-between">
                <Label htmlFor="fi-date">Final interview date &amp; time</Label>
                {fiEvent && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline hover:text-primary"
                    onClick={() => {
                      setFiManual((m) => !m);
                      setFiSlot(null);
                      setFiDate("");
                      setFiTime("");
                    }}
                  >
                    {fiManual ? "Use Marcus's live availability" : "Enter manually"}
                  </button>
                )}
              </div>
              {fiEvent && !fiManual ? (
                <BookingSlotPicker
                  eventTypeId={fiEvent.eventTypeId}
                  hostUserId={fiEvent.hostUserId}
                  value={fiSlot}
                  onSelect={(startsAt) => {
                    setFiSlot(startsAt);
                    if (startsAt) {
                      const { date, time } = utcToLondonParts(startsAt);
                      setFiDate(date);
                      setFiTime(time);
                    } else {
                      setFiDate("");
                      setFiTime("");
                    }
                  }}
                />
              ) : (
              <div className="flex gap-2">
                <Input
                  id="fi-date"
                  type="date"
                  className="flex-1"
                  value={fiDate}
                  onChange={(e) => setFiDate(e.target.value)}
                />
                <Input
                  type="time"
                  className="w-32"
                  value={fiTime}
                  onChange={(e) => setFiTime(e.target.value)}
                />
              </div>
              )}
              <p className="text-xs text-muted-foreground">
                {ceoView ? (
                  <>
                    Schedule it here and the card moves itself to Final
                    Interview on that day — or use <strong>Send to TA</strong>{" "}
                    below and the TA books it (their card glows until they do).
                  </>
                ) : (
                  "Schedule it here — the card moves itself to Final Interview on that day."
                )}
              </p>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2 sm:space-x-0">
            <Button variant="outline" onClick={() => setPendingMove(null)}>
              Cancel
            </Button>
            {/* CEO-only: the TA scheduling for herself needs no hand-off. */}
            {pendingMove?.toStage === "final_interview" && ceoView && (
              <Button
                variant="outline"
                disabled={move.isPending}
                onClick={() => {
                  if (pendingMove)
                    commit(pendingMove.candidate, pendingMove.toStage, { sendToTa: true });
                  setPendingMove(null);
                }}
              >
                Send to TA to schedule
              </Button>
            )}
            <Button
              disabled={move.isPending || (pendingMove?.toStage === "final_interview" && !fiDate)}
              onClick={() => {
                if (pendingMove) commit(pendingMove.candidate, pendingMove.toStage);
                setPendingMove(null);
              }}
            >
              {move.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pendingMove?.toStage === "final_interview" ? "Confirm & schedule" : "Confirm move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CandidatePipelineDetail
        candidate={selectedLive}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        canAct={canAct && !migrationPending}
        ceoView={ceoView}
        footerSlot={selectedLive && detailFooter ? detailFooter(selectedLive) : undefined}
      />
    </div>
  );
}
