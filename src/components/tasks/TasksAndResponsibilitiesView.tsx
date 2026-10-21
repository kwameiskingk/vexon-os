import { useMemo } from "react";
import { useTaskInstances } from "@/hooks/useTaskInstances";
import { TaskList } from "./TaskList";
import { ResponsibilityList } from "./ResponsibilityList";
import { PersonalTaskQuickAdd } from "./PersonalTaskQuickAdd";
import { ProgressRing } from "@/components/ui/progress-ring";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { ListTodo, Repeat } from "lucide-react";
import { useUserTimezone, getTimezoneAbbreviation } from "@/utils/timezoneUtils";
import { format } from "date-fns";
import { getTaskUiState } from "@/utils/taskStatus";

export const TasksAndResponsibilitiesView = () => {
  const { data: instances = [], isLoading, toggle } = useTaskInstances();
  const tz = useUserTimezone();
  const tzLabel = getTimezoneAbbreviation(tz);

  const { tasks, responsibilities, doneCount, totalCount, missedCount } = useMemo(() => {
    const tasksAll = instances.filter((i) => i.category === "task");
    const responsibilities = instances.filter((i) => i.category === "responsibility");
    const done = instances.filter((i) => i.status === "done").length;
    const missed = tasksAll.filter((t) => getTaskUiState(t, tz).uiStatus === "missed").length;
    return {
      tasks: tasksAll,
      responsibilities,
      doneCount: done,
      totalCount: instances.length,
      missedCount: missed,
    };
  }, [instances, tz]);

  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Hero progress card */}
      <section className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/60 p-7">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative flex items-center justify-between flex-wrap gap-6">
          <div className="flex items-center gap-7">
            <ProgressRing value={pct} max={100} size={104} strokeWidth={5} label={`${pct}%`} />
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1">
                Today's Progress
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-light tracking-tighter font-heading">
                  <AnimatedCounter value={doneCount} />
                </span>
                <span className="text-sm text-muted-foreground">of {totalCount} complete</span>
              </div>
              {missedCount > 0 && (
                <div className="text-xs text-destructive mt-1.5 font-mono uppercase tracking-wider">
                  {missedCount} missed today
                </div>
              )}
              {missedCount === 0 && doneCount > 0 && (
                <div className="text-xs text-primary mt-1.5 font-mono uppercase tracking-wider">
                  Keep the streak going
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Timezone
            </div>
            <div className="text-sm font-mono text-foreground/80 mt-0.5">
              {tzLabel} · {format(new Date(), "h:mm a")}
            </div>
          </div>
        </div>
      </section>

      {/* Split view */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tasks column */}
        <section className="lg:col-span-7 rounded-2xl border border-border/40 bg-card/40 p-5">
          <header className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold tracking-tight">Execution Timeline</h2>
              <span className="text-xs text-muted-foreground">({tasks.length})</span>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {tasks.filter((t) => t.status === "done").length} done
            </span>
          </header>
          <TaskList
            tasks={tasks}
            loading={isLoading}
            onToggle={(id, status) => toggle.mutate({ id, status })}
          />
          <PersonalTaskQuickAdd />
        </section>

        {/* Responsibilities column */}
        <section className="lg:col-span-5 rounded-2xl border border-border/40 bg-card/40 p-5">
          <header className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold tracking-tight">Pillars of Responsibility</h2>
              <span className="text-xs text-muted-foreground">({responsibilities.length})</span>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {responsibilities.filter((r) => r.status === "done").length} acknowledged
            </span>
          </header>
          <ResponsibilityList items={responsibilities} loading={isLoading} />
        </section>
      </div>
    </div>
  );
};
