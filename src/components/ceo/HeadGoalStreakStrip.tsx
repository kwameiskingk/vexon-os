// Weekday streak strip for department-head goals: M T W T F, coloured by
// each day's DAILY goal outcomes (weekdays only by ruling — no Saturday).
// A day with multiple goals takes the WORST outcome (missed > hit >
// exceeded), noted in the tooltip. Weekly goals are excluded — their
// outcome renders on the goal row, not the strip.
// No existing component renders a day-of-week status strip (checked
// 2026-07-30: attendance is a month grid, leaderboard streaks are
// counters), hence this small dedicated one.

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { DepartmentHeadGoal, GoalOutcome } from "@/components/ceo/departmentHeadGoals";

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F"];

// Worst-first ordering for the day colour ruling.
const OUTCOME_SEVERITY: Record<GoalOutcome, number> = { missed: 0, hit: 1, exceeded: 2 };

const OUTCOME_DOT: Record<GoalOutcome, string> = {
  hit: "bg-emerald-500 text-white",
  missed: "bg-rose-500 text-white",
  exceeded: "bg-violet-500 text-white ring-2 ring-violet-300 dark:ring-violet-500/40",
};

const dayKey = (weekStart: string, offset: number) =>
  format(new Date(new Date(`${weekStart}T12:00:00`).getTime() + offset * 86400000), "yyyy-MM-dd");

interface Props {
  /** Monday of the rendered week, yyyy-MM-dd. */
  weekStart: string;
  /** This head's DAILY goals for that week. */
  goals: DepartmentHeadGoal[];
}

export function HeadGoalStreakStrip({ weekStart, goals }: Props) {
  return (
    <div className="flex items-center gap-1.5 pt-3 mt-1 border-t border-border/40">
      {WEEKDAY_LETTERS.map((letter, i) => {
        const key = dayKey(weekStart, i);
        const dayGoals = goals.filter((g) => g.period_start === key);
        const marked = dayGoals.filter((g) => g.outcome != null);
        const worst =
          marked.length > 0
            ? marked.reduce((w, g) =>
                OUTCOME_SEVERITY[g.outcome as GoalOutcome] <
                OUTCOME_SEVERITY[w.outcome as GoalOutcome]
                  ? g
                  : w,
              ).outcome as GoalOutcome
            : null;
        const unmarked = dayGoals.length - marked.length;

        const counts = (["missed", "hit", "exceeded"] as GoalOutcome[])
          .map((o) => {
            const n = marked.filter((g) => g.outcome === o).length;
            return n > 0 ? `${n} ${o}` : null;
          })
          .filter(Boolean)
          .join(", ");
        const title =
          dayGoals.length === 0
            ? `${format(new Date(`${key}T12:00:00`), "EEE d MMM")}: no goal set`
            : `${format(new Date(`${key}T12:00:00`), "EEE d MMM")}: ${dayGoals.length} goal${dayGoals.length > 1 ? "s" : ""}` +
              (counts ? ` — ${counts}` : "") +
              (unmarked > 0 ? ` (${unmarked} not yet marked)` : "") +
              (marked.length > 1 && worst ? ` · showing worst: ${worst}` : "");

        return (
          <span
            key={i}
            title={title}
            className={cn(
              "h-6 w-6 rounded-full inline-flex items-center justify-center text-[10px] font-bold select-none",
              worst ? OUTCOME_DOT[worst] : "bg-muted text-muted-foreground/60",
            )}
          >
            {letter}
          </span>
        );
      })}
    </div>
  );
}

export function StreakLegend({ className }: { className?: string }) {
  const items: { label: string; className: string }[] = [
    { label: "Hit", className: "bg-emerald-500" },
    { label: "Missed", className: "bg-rose-500" },
    { label: "Exceeded", className: "bg-violet-500" },
    { label: "No goal / unmarked", className: "bg-muted border border-border" },
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          <span className={cn("h-2 w-2 rounded-full", item.className)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
