// The full-width bar above the deck (Marcus, 8 Sep: "card 2 of 11 front and
// centre, they should not have to look for it"): the card counter large on
// the left, the percentage on the right, the animated gradient bar
// underneath. 11 Sep (the owner): no stage pills — the person on the deck should
// not see the section names; the card's own badge still names its stage.

import { motion } from "motion/react";

export interface DeckStage {
  key: string;
  title: string;
  state: "complete" | "active" | "locked";
}

export function ProgressBar({ progress, step, total, label, finished }: {
  /** Kept on the props for the decks' rail data; not rendered since 11 Sep (the owner: the client and the SDR should not see the stage names). */
  stages?: DeckStage[];
  progress: number;
  step: number;
  total: number;
  /** The shown card's title, under the counter. */
  label?: string | null;
  finished: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 backdrop-blur-xl px-5 py-4 shadow-[0_18px_40px_-28px_rgba(126,63,181,.4)]">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-violet-600">{finished ? "Complete" : "Your progress"}</p>
          <p className="mt-1 text-2xl sm:text-3xl font-heading font-bold tracking-tight leading-none tabular-nums">
            {finished ? "All cards complete" : `Card ${step} of ${total}`}
          </p>
          {label && !finished && <p className="mt-1.5 text-sm text-muted-foreground truncate">{label}</p>}
        </div>
        <p className="text-sm font-semibold text-violet-700 tabular-nums">{progress}% complete</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-violet-100 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 20 }}
        />
      </div>
    </div>
  );
}
