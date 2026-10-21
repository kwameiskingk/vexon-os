// The shared onboarding DECK (3 Sep). One big card per step, the next few
// peeking out behind it in brand tints; complete a card and it slides to the
// back with a small burst of confetti while the next comes forward.
// "Previous" brings a finished card back for review; a deck can let the
// owner edit a reviewed card in place. When every card is done the last card
// is the finish card (rendered by the owner).
//
// 11 Sep (Marcus's 8 Sep walkthrough): the progress rail beside the greeting
// became a full-width bar above the deck with "Card 2 of 12" front and
// centre; the advance button lives in each card's bottom bar (DeckCard).
// An owner can also put a card of its own in front of the deck for a moment
// (`override`: the welcome video before the first card, the closing video
// before the finish card).
//
// Generic on purpose: the deck knows nothing about clients, SDRs or
// Supabase. It takes an ordered list of {key, stageKey, done, locked} items,
// a list of stages for the bar, and render functions for the card body and
// the finish card. The client deck, the SDR deck and both sandboxes sit on
// top of it, so the look and the interactions stay identical everywhere.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import logoGradient from "@/assets/vexon-logo-dark.svg";
import { Backdrop } from "./Backdrop";
import { ProgressBar, type DeckStage } from "./ProgressBar";
import { celebrateCard, celebrateFinish } from "./celebrate";

export interface DeckItem {
  key: string;
  stageKey: string;
  label: string;
  done: boolean;
  /** A locked card can never be the active one (client stages lock server-side). */
  locked?: boolean;
}

export interface DeckRenderCtx {
  index: number;
  total: number;
  /** A finished card brought back with "Previous". */
  reviewing: boolean;
  /** Review mode with the body open for re-saving. */
  editing: boolean;
  startEdit: () => void;
  stopEdit: () => void;
}

export interface DeckOverride {
  /** Which card the bar should say is showing (0-based). */
  index: number;
  /** Shown under the counter in the bar. */
  label?: string;
  render: () => ReactNode;
}

export interface DeckProps {
  items: DeckItem[];
  stages: DeckStage[];
  /** 0..100 */
  progress: number;
  /** Text next to the wordmark (company name, "New starter onboarding"). */
  headerLabel?: ReactNode;
  /** Right side of the header (Sign out, or the Sandbox chip + Reset). */
  headerRight?: ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Sits between the bar and the deck: the SDR "finish pre-start first" alert. */
  notice?: ReactNode;
  /** Something the owner wants in front of the deck for now (welcome / closing video). */
  override?: DeckOverride | null;
  renderCard: (item: DeckItem, ctx: DeckRenderCtx) => ReactNode;
  renderFinish: () => ReactNode;
  /**
   * Shown when nothing is actionable but the deck is not finished: every
   * open card is locked (the SDR deck waiting for HR to release day one).
   * Falls back to renderFinish when not given.
   */
  renderWaiting?: () => ReactNode;
}

const FINISH_KEY = "__finish";

export function Deck({
  items, stages, progress, headerLabel, headerRight, eyebrow, title, subtitle, notice, override, renderCard, renderFinish, renderWaiting,
}: DeckProps) {
  const total = items.length;
  const cardKeys = useMemo(() => [...items.map((i) => i.key), FINISH_KEY], [items]);
  const doneCount = items.filter((c) => c.done).length;
  const activeIndex = useMemo(() => {
    const i = items.findIndex((c) => !c.done && !c.locked);
    return i === -1 ? items.length : i;
  }, [items]);
  const allDone = activeIndex === items.length && items.every((c) => c.done);
  // Nothing to act on, yet not finished: the open cards are all locked.
  const waiting = activeIndex === items.length && !allDone;

  // Review mode: a finished card brought back to the front.
  const [review, setReview] = useState<{ index: number; editing: boolean } | null>(null);
  const shownIndex = override ? override.index : review ? review.index : activeIndex;
  const shownKey = override
    ? `__override:${override.index}`
    : waiting && !review
      ? "__waiting"
      : cardKeys[shownIndex] ?? FINISH_KEY;
  const shownItem = items[shownIndex];
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  // Celebrate: small burst when a card completes, big when the deck finishes.
  const prevDone = useRef(doneCount);
  const prevAllDone = useRef(allDone);
  useEffect(() => {
    if (allDone && !prevAllDone.current) celebrateFinish();
    else if (doneCount > prevDone.current) celebrateCard();
    prevDone.current = doneCount;
    prevAllDone.current = allDone;
  }, [doneCount, allDone]);

  // Leave review automatically once the underlying card changes (e.g. after an edit saved).
  useEffect(() => {
    if (review && review.index >= activeIndex && !review.editing) setReview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // Only finished cards can be reviewed; a locked, unfinished card is skipped.
  const goPrevious = () => {
    let target = (review ? review.index : activeIndex) - 1;
    while (target >= 0 && !items[target]?.done) target -= 1;
    if (target < 0) return;
    setDirection("back");
    setReview({ index: target, editing: false });
  };
  const goNextInReview = () => {
    if (!review) return;
    setDirection("forward");
    const target = review.index + 1;
    if (target >= activeIndex || !items[target]?.done) setReview(null);
    else setReview({ index: target, editing: false });
  };
  const backToCurrent = () => {
    setDirection("forward");
    setReview(null);
  };

  const peekKeys = cardKeys.slice(shownIndex + 1, shownIndex + 4);
  const barIndex = waiting && !review ? doneCount : Math.min(shownIndex + 1, total);
  const barLabel = override ? override.label ?? shownItem?.label : waiting && !review ? undefined : shownItem?.label;
  const canGoPrevious = items.slice(0, review ? review.index : activeIndex).some((c) => c.done);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f5f5f6] text-foreground">
      <Backdrop />

      {/* header */}
      <header className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logoGradient} alt="Vexon OS" className="h-8 w-auto object-contain" />
          <span className="hidden sm:block h-5 w-px bg-violet-200" />
          <p className="hidden sm:block text-sm text-muted-foreground">{headerLabel}</p>
        </div>
        {headerRight}
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pb-24 pt-8">
        {/* greeting */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-violet-600">{eyebrow}</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold font-heading tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm sm:text-[15px]">{subtitle}</p>
        </motion.div>

        {/* progress bar: front and centre */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-6">
          <ProgressBar stages={stages} progress={progress} step={barIndex} total={total} label={barLabel} finished={allDone && !override} />
        </motion.div>

        {notice && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
            {notice}
          </motion.div>
        )}

        {/* deck */}
        <div className="relative mt-8 sm:mt-10">
          {/* peek layers */}
          <div className="absolute inset-x-0 top-0 pointer-events-none" aria-hidden>
            {peekKeys.map((k, i) => (
              <motion.div
                key={k}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 - i * 0.18, y: -14 * (i + 1), scale: 1 - 0.035 * (i + 1) }}
                transition={{ type: "spring", stiffness: 160, damping: 22 }}
                className={cn(
                  "absolute inset-x-0 h-24 rounded-[28px] origin-top shadow-[0_18px_40px_-24px_rgba(126,63,181,.45)]",
                  i === 0 ? "bg-violet-200" : i === 1 ? "bg-violet-300/80" : "bg-fuchsia-300/60",
                )}
                style={{ zIndex: 5 - i }}
              />
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={shownKey + (review?.editing ? ":edit" : "")}
              initial={direction === "forward" ? { opacity: 0, y: 36, scale: 0.97 } : { opacity: 0, y: 56, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={direction === "forward" ? { opacity: 0, y: -22, scale: 0.94, rotate: -1.2 } : { opacity: 0, y: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 190, damping: 24, mass: 0.9 }}
              className="relative z-10"
            >
              {override
                ? override.render()
                : waiting && !review
                  ? (renderWaiting ?? renderFinish)()
                : shownItem
                  ? renderCard(shownItem, {
                      index: shownIndex,
                      total,
                      reviewing: !!review && !review.editing,
                      editing: !!review?.editing,
                      startEdit: () => setReview({ index: shownIndex, editing: true }),
                      stopEdit: () => setReview({ index: shownIndex, editing: false }),
                    })
                  : renderFinish()}
            </motion.div>
          </AnimatePresence>

          {/* deck controls */}
          {!override && (
            <div className="mt-5 flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                disabled={!canGoPrevious || !!review?.editing}
                onClick={goPrevious}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Previous
              </Button>
              {review && !review.editing && (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={goNextInReview}>
                    Next <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                  <Button variant="outline" className="border-violet-200 bg-white/70" onClick={backToCurrent}>
                    Back to current step
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * The "Sandbox" chip + Reset both sandboxes put in the deck header.
 *
 * 11 Sep (Marcus hit the old one-click Reset mid-walkthrough and lost the
 * run): Reset now opens a small dialog — go back to a chosen card, or start
 * over — and asks once more before it clears anything.
 */
export function SandboxHeaderControls({ cards, onReset, onExit, exitLabel = "Back to Dev Center" }: {
  /** The deck's cards in order; finished ones are offered as "go back to". */
  cards: Array<{ key: string; label: string; done: boolean }>;
  /** null = start over; otherwise clear that card and everything after it. */
  onReset: (fromKey: string | null) => void;
  onExit?: () => void;
  exitLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const finished = cards.filter((c) => c.done);
  const chosen = choice ? cards.find((c) => c.key === choice) : null;

  const close = () => {
    setOpen(false);
    setConfirming(false);
    setChoice(null);
  };
  const apply = () => {
    onReset(choice);
    close();
  };

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Sandbox · nothing is saved
      </span>
      <Button variant="outline" size="sm" className="border-violet-200 bg-white/70" onClick={() => setOpen(true)}>
        Reset
      </Button>
      {onExit && (
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={onExit}>
          {exitLabel}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{confirming ? "Are you sure?" : "Reset the run"}</DialogTitle>
            <DialogDescription>
              {confirming
                ? chosen
                  ? `This clears "${chosen.label}" and every card after it. You will be back on that card.`
                  : "This clears every card. You will be back at the very beginning."
                : "Go back to a card you have already finished, or start the whole run again. Nothing here is saved anywhere."}
            </DialogDescription>
          </DialogHeader>

          {!confirming && (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => setChoice(null)}
                className={cn(
                  "w-full text-left rounded-xl border px-3 py-2 text-sm transition-colors",
                  choice === null ? "border-violet-500 bg-violet-50" : "border-violet-100 hover:bg-violet-50/60",
                )}
              >
                Start over from the beginning
              </button>
              {finished.length > 0 && <p className="pt-2 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">Or go back to</p>}
              {finished.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setChoice(c.key)}
                  className={cn(
                    "w-full text-left rounded-xl border px-3 py-2 text-sm transition-colors",
                    choice === c.key ? "border-violet-500 bg-violet-50" : "border-violet-100 hover:bg-violet-50/60",
                  )}
                >
                  <span className="text-muted-foreground tabular-nums mr-2">{i + 1}.</span>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={confirming ? () => setConfirming(false) : close}>
              {confirming ? "Back" : "Cancel"}
            </Button>
            {confirming ? (
              <Button className="bg-red-600 hover:bg-red-700 text-white border-0" onClick={apply}>
                Yes, reset
              </Button>
            ) : (
              <Button className="bg-violet-600 hover:bg-violet-700 text-white border-0" onClick={() => setConfirming(true)}>
                Continue
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
