import { useMemo } from "react";
import { format } from "date-fns";
import { CheckCircle2, Circle, ListChecks, MinusCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { dateAtNoon } from "@/hooks/useDepartmentHeadGoals";
import { currentWeek, instanceOutcome, usePersonTaskInstances, type LinkedTaskInstance } from "@/hooks/useProjects";

interface Props {
  userId: string;
  name: string;
}

/**
 * "Elena's own tasks": the person's materialised task instances for today,
 * then the rest of this week — separate from the projects they contribute
 * to, exactly as Marcus described the toggle.
 */
export function PersonTasksPanel({ userId, name }: Props) {
  const week = currentWeek();
  const { data: instances = [], isLoading } = usePersonTaskInstances(userId, week.start, week.end);
  const firstName = name.split(" ")[0] || name;

  const { todayList, weekList, hit, missed } = useMemo(() => {
    const todayList = instances.filter((i) => i.due_date === week.today);
    const weekList = instances.filter((i) => i.due_date !== week.today);
    let hit = 0;
    let missed = 0;
    for (const i of instances) {
      const o = instanceOutcome(i, week.today);
      if (o === "hit") hit += 1;
      if (o === "missed") missed += 1;
    }
    return { todayList, weekList, hit, missed };
  }, [instances, week.today]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-[10.5px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">
          {firstName}&rsquo;s own tasks
        </span>
        <div className="flex-1 h-px bg-border/70" />
        <span className="text-[10.5px] text-muted-foreground tabular-nums">
          This week · {hit} hit · {missed} missed
        </span>
      </div>

      {isLoading ? (
        <div className="h-24 rounded-xl bg-muted animate-pulse" />
      ) : instances.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-[12.5px] text-muted-foreground text-center">
          No daily tasks materialised for {firstName} this week.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <TaskGroup title={`Today · ${format(dateAtNoon(week.today), "EEE d MMM")}`} items={todayList} today={week.today} emptyLabel="Nothing due today." />
          <TaskGroup title="Rest of this week" items={weekList} today={week.today} emptyLabel="Nothing else this week." showDate />
        </div>
      )}
    </section>
  );
}

function TaskGroup({
  title,
  items,
  today,
  emptyLabel,
  showDate,
}: {
  title: string;
  items: LinkedTaskInstance[];
  today: string;
  emptyLabel: string;
  showDate?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
          {title}
        </p>
        <span className="text-[10.5px] text-muted-foreground tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-4 text-[12px] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((i) => {
            const o = instanceOutcome(i, today);
            const Icon = o === "hit" ? CheckCircle2 : o === "missed" ? (i.status === "skipped" ? MinusCircle : XCircle) : Circle;
            const tone =
              o === "hit"
                ? "text-emerald-600 dark:text-emerald-400"
                : o === "missed"
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground/60";
            return (
              <li key={i.id} className="flex items-center gap-2.5 px-4 py-2">
                <Icon className={cn("h-4 w-4 shrink-0", tone)} />
                <span className={cn("flex-1 min-w-0 text-[12.5px] truncate", o === "hit" && "text-muted-foreground line-through")}>
                  {i.title}
                </span>
                <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70 shrink-0">
                  {showDate ? format(dateAtNoon(i.due_date), "EEE") : i.category}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
