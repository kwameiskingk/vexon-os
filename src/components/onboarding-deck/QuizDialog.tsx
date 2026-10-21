// Full-screen quiz (7 Sep). Same shell as the document reader and the video
// player: gradient rail on the left with the title, progress and the result;
// one question at a time on the right. Passing hands the score back to the
// card, which completes the step; failing offers another attempt with the
// questions in a fresh order. Nothing is written here.

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, ClipboardCheck, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { quizPassCount, type QuizDefinition } from "@/lib/onboardingSteps";

export interface QuizResult {
  correct: number;
  total: number;
  passed: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function QuizDialog({
  open, onOpenChange, title, quiz, onPass, confirming,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  quiz: QuizDefinition;
  /** Called once with the score when the pass mark is reached. */
  onPass: (result: QuizResult) => void;
  confirming?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  // `attempt` is deliberately a dependency: "Try again" reshuffles the order.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const order = useMemo(() => shuffle(quiz.questions.map((_, i) => i)), [quiz, attempt]);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setChosen({});
      setFinished(false);
    }
  }, [open]);

  const total = quiz.questions.length;
  const needed = quizPassCount(quiz);
  const qIndex = order[index] ?? 0;
  const question = quiz.questions[qIndex];
  const picked = chosen[qIndex];

  const correct = order.filter((qi) => chosen[qi] === quiz.questions[qi].answer).length;
  const passed = correct >= needed;

  const next = () => {
    if (index + 1 < total) setIndex(index + 1);
    else setFinished(true);
  };

  const retry = () => {
    setAttempt((a) => a + 1);
    setIndex(0);
    setChosen({});
    setFinished(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] h-[88vh] p-0 gap-0 overflow-hidden rounded-3xl border-0 shadow-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] grid-cols-1 md:grid-cols-[260px_1fr]">
          <aside className="hidden md:flex flex-col min-h-0 overflow-y-auto bg-gradient-to-b from-violet-700 via-violet-600 to-fuchsia-600 text-white p-6">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/70 flex items-center gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" /> Quiz
            </p>
            <h2 className="mt-2 text-lg font-heading font-semibold leading-tight">{title}</h2>
            <p className="mt-4 text-sm text-white/85 leading-relaxed">
              {total} question{total === 1 ? "" : "s"}. You need {needed} correct to pass. Take your time; you may try again if you need to.
            </p>
            <ol className="mt-6 space-y-1.5">
              {order.map((qi, i) => {
                const answered = chosen[qi] !== undefined;
                const right = answered && chosen[qi] === quiz.questions[qi].answer;
                return (
                  <li
                    key={qi}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                      i === index && !finished ? "bg-white/20" : "text-white/80",
                    )}
                  >
                    <span className="h-5 w-5 rounded-full bg-white/15 flex items-center justify-center text-[11px]">
                      {finished && answered ? (right ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />) : i + 1}
                    </span>
                    Question {i + 1}
                  </li>
                );
              })}
            </ol>
            <div className="mt-auto pt-6">
              <Button variant="ghost" className="w-full text-white/85 hover:text-white hover:bg-white/10" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </aside>

          <div className="flex flex-col min-h-0 h-full overflow-hidden bg-[#fafafa]">
            <header className="flex items-center gap-3 border-b border-violet-100 px-6 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-violet-600">
                  {finished ? "Your result" : `Question ${index + 1} of ${total}`}
                </p>
                <h3 className="text-base font-heading font-semibold leading-tight truncate md:hidden">{title}</h3>
              </div>
              <Button variant="outline" size="sm" className="md:hidden" onClick={() => onOpenChange(false)}>Close</Button>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
              {!finished ? (
                <div className="max-w-2xl space-y-6">
                  <p className="text-xl sm:text-2xl font-heading font-semibold leading-snug">{question.prompt}</p>
                  <div className="space-y-2.5">
                    {question.options.map((opt, oi) => {
                      const on = picked === oi;
                      return (
                        <button
                          key={oi}
                          type="button"
                          onClick={() => setChosen((c) => ({ ...c, [qIndex]: oi }))}
                          className={cn(
                            "w-full text-left rounded-2xl border px-4 py-3.5 text-[15px] transition-colors flex items-start gap-3",
                            on ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-white hover:bg-violet-50",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 h-5 w-5 shrink-0 rounded-full border flex items-center justify-center text-[11px] font-semibold",
                              on ? "border-white/70 bg-white/20" : "border-violet-300 text-violet-700",
                            )}
                          >
                            {String.fromCharCode(65 + oi)}
                          </span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="max-w-2xl space-y-5">
                  <div
                    className={cn(
                      "rounded-2xl border px-5 py-5",
                      passed ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
                    )}
                  >
                    <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Score</p>
                    <p className="mt-1 text-3xl font-heading font-bold">
                      {correct} of {total}
                    </p>
                    <p className="mt-2 text-[15px]">
                      {passed
                        ? "Well done. You have passed this quiz."
                        : `Not quite. You need ${needed} correct to pass. Please review the material and try again.`}
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {order.map((qi) => {
                      const q = quiz.questions[qi];
                      const right = chosen[qi] === q.answer;
                      return (
                        <li key={qi} className="rounded-xl border border-violet-100 bg-white px-4 py-3 text-sm">
                          <p className="font-medium">{q.prompt}</p>
                          <p className={cn("mt-1 text-xs", right ? "text-emerald-700" : "text-amber-700")}>
                            {right ? "Correct" : `Your answer: ${q.options[chosen[qi]] ?? "not answered"}`}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <footer className="flex items-center gap-3 border-t border-violet-100 px-6 py-4 bg-white">
              <span className="flex-1" />
              {!finished ? (
                <Button
                  className="bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 text-white border-0"
                  disabled={picked === undefined}
                  onClick={next}
                >
                  {index + 1 < total ? "Next question" : "See my result"} <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : passed ? (
                <Button
                  className="bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 text-white border-0"
                  disabled={confirming}
                  onClick={() => onPass({ correct, total, passed })}
                >
                  <Check className="h-4 w-4 mr-1.5" /> Continue
                </Button>
              ) : (
                <Button variant="outline" className="border-violet-200" onClick={retry}>
                  <RotateCcw className="h-4 w-4 mr-1.5" /> Try again
                </Button>
              )}
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
