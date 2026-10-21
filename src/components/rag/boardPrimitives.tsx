// Board design-system primitives (2026-07-23 rebuild) — shared by Nadia's
// Metrics & Insights board and the setter RAG pill so the two surfaces can
// never drift. Pure presentation over the existing RAG machinery: state
// values come from ragState.ts unchanged; this file only maps them onto the
// token palette (rag-crit / rag-watch / rag-steady).
//
// Domain note kept intact from the locked rulings: an explicitly-absent
// setter ("Off today") renders NEUTRAL, never critical — the design spec's
// off-today-as-critical treatment was overruled (FIX 8: absence is "off, not
// underperforming", and unmarked days stay live).

import { cn } from "@/lib/utils";
import type { RagState } from "@/lib/targets/ragState";

/** Spec state vocabulary: crit / watch / steady. green and no_target both
 *  land on steady (quiet); absence is handled by callers via absentToday. */
export type BoardState = "crit" | "watch" | "steady";

export const toBoardState = (state: RagState): BoardState =>
  state === "red" ? "crit" : state === "amber" ? "watch" : "steady";

/** Tailwind token classes per board state — the ONLY four elements that may
 *  carry state colour are rail, progress fill, pill, and the declining dot. */
export const BOARD_STATE = {
  crit: {
    rail: "bg-rag-crit",
    fill: "bg-rag-crit",
    pillBg: "bg-rag-critBg",
    pillText: "text-rag-crit",
    dot: "bg-rag-crit",
    text: "text-rag-crit",
  },
  watch: {
    rail: "bg-rag-watch",
    fill: "bg-rag-watch",
    pillBg: "bg-rag-watchBg",
    pillText: "text-rag-watch",
    dot: "bg-rag-watch",
    text: "text-rag-watch",
  },
  steady: {
    rail: "bg-rag-steady",
    fill: "bg-rag-steady",
    pillBg: "bg-rag-steadyBg",
    pillText: "text-rag-steady",
    dot: "bg-rag-steady",
    text: "text-rag-steady",
  },
} as const;

/** Setter-facing state words (approved mapping). */
export const BOARD_STATE_WORD: Record<RagState, string> = {
  red: "Off track",
  amber: "Needs work",
  green: "On track",
  no_target: "No targets",
};

/** Manager-facing pill labels. */
export const BOARD_PILL_LABEL: Record<RagState, string | null> = {
  red: "Critical",
  amber: "Watch",
  green: null, // rationing rule — steady never shouts
  no_target: "No target", // kept as Nadia's set-targets cue (deliberate deviation)
};

export const isOverTarget = (value: number, target: number | null): boolean =>
  target != null && target > 0 && value > target;

/** Mono over-target affordance — the bar caps at 100%, this does not. */
export function OverCaret({ className }: { className?: string }) {
  return (
    <span aria-label="over target" className={cn("micro-label text-txt-muted align-top", className)}>
      ▲
    </span>
  );
}

/**
 * §4 progress bar. Width = clamp(0, value/target, 1); no faked sliver at 0;
 * capped at 100% (over-target is the caller's OverCaret beside the number).
 * `state` colours the fill; no target → empty track only.
 */
export function BoardProgress({
  value,
  target,
  state,
  className,
  slim = false,
}: {
  value: number;
  target: number | null;
  state: BoardState;
  className?: string;
  slim?: boolean;
}) {
  const pct =
    target != null && target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-[6px] bg-surface-track shadow-trackInset",
        slim ? "h-[7px]" : "h-2",
        className,
      )}
    >
      {pct > 0 && (
        <div
          className={cn(
            "h-full rounded-[6px] transition-[width] duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,.35)]",
            BOARD_STATE[state].fill,
          )}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}

/**
 * Metric well — used by the RAG pill's expanded panel (and any future
 * well-based surface). Label at --text-muted when the label carries the
 * daily/weekly grain (load-bearing, AA); value Satoshi; live target suffix.
 */
export function MetricWell({
  label,
  value,
  target,
  suffix = "",
  state,
  neutral = false,
}: {
  label: string;
  value: number;
  target: number | null;
  suffix?: string;
  state: BoardState;
  neutral?: boolean;
}) {
  const over = isOverTarget(value, target);
  return (
    <div className="min-w-0 rounded-well border border-[hsl(var(--border-subtle))] bg-muted/40 px-3 py-2.5 shadow-wellInset">
      <p className="micro-label uppercase text-txt-muted truncate">{label}</p>
      <p className="mt-1 font-heading text-lg font-semibold text-txt-primary tabular-nums leading-none">
        {value}
        {suffix}
        {over && <OverCaret className="ml-0.5" />}
        <span className="text-[11px] font-medium text-txt-faint font-sans">
          {" "}/ {target != null ? `${target}${suffix}` : "—"}
        </span>
      </p>
      <BoardProgress
        value={neutral ? 0 : value}
        target={target}
        state={state}
        slim
        className="mt-2"
      />
    </div>
  );
}
