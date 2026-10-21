import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Link2, Plus, Search, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { dateAtNoon, mondayOf } from "@/hooks/useDepartmentHeadGoals";
import { CUSTOM_GOAL_TYPE, goalTypeLabel } from "@/components/ceo/departmentHeadGoals";
import { useLinkableGoals, useProjectMutations, type LinkedGoal } from "@/hooks/useProjects";
import { ProjectsMigrationNotice } from "./ProjectBits";

interface Props {
  projectId: string;
  /** Every goal linked to this project, newest first. */
  goals: LinkedGoal[];
  nameFor: (id: string) => string;
  avatarFor: (id: string) => string | null;
  canManage: boolean;
}

export const goalText = (g: LinkedGoal) =>
  g.goal_type === CUSTOM_GOAL_TYPE
    ? g.goal_label ?? "Goal"
    : [goalTypeLabel(g.department, g.goal_type), g.goal_label].filter(Boolean).join(" — ");

/** "Weekly · w/c 8 Sep" or "Daily · Mon 14 Sep". */
export const goalPeriodLabel = (g: LinkedGoal) =>
  g.period_type === "weekly"
    ? `Weekly · w/c ${format(dateAtNoon(g.period_start), "d MMM")}`
    : `Daily · ${format(dateAtNoon(g.period_start), "EEE d MMM")}`;

const outcomeChip: Record<string, string> = {
  hit: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  exceeded: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  missed: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  pending: "bg-muted text-muted-foreground",
};

export function GoalOutcomeChip({ outcome }: { outcome: string | null }) {
  const key = outcome ?? "pending";
  return (
    <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider whitespace-nowrap", outcomeChip[key] ?? outcomeChip.pending)}>
      {outcome ?? "Not marked"}
    </span>
  );
}

/**
 * Every department-head goal linked to this project (department_head_goals
 * .project_id), grouped by week, newest first, with the head, the period,
 * the target and the outcome Marcus marked.
 */
export function ProjectLinkedGoals({ projectId, goals, nameFor, avatarFor, canManage }: Props) {
  const { setGoalProject } = useProjectMutations();
  const [pickerOpen, setPickerOpen] = useState(false);

  const { weeks, tally } = useMemo(() => {
    let hit = 0;
    let missed = 0;
    const byWeek = new Map<string, LinkedGoal[]>();
    for (const g of goals) {
      if (g.outcome === "hit" || g.outcome === "exceeded") hit += 1;
      if (g.outcome === "missed") missed += 1;
      const wk = mondayOf(g.period_start);
      const list = byWeek.get(wk) ?? [];
      list.push(g);
      byWeek.set(wk, list);
    }
    const weeks = Array.from(byWeek.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([start, list]) => ({
        start,
        // Weekly goals first, then the days newest first.
        goals: [...list].sort((a, b) => {
          if (a.period_type !== b.period_type) return a.period_type === "weekly" ? -1 : 1;
          return a.period_start < b.period_start ? 1 : a.period_start > b.period_start ? -1 : 0;
        }),
      }));
    return { weeks, tally: { hit, missed } };
  }, [goals]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-semibold text-foreground">Linked head goals</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {goals.length} linked · all time {tally.hit} hit · {tally.missed} missed
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" className="h-8 text-[12px] shrink-0" onClick={() => setPickerOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Link goal
          </Button>
        )}
      </div>

      {goals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-[12px] text-muted-foreground">
          No department-head goals are tied to this project yet. Link one here, or pick this project when you set a
          goal on the CEO Overview.
        </p>
      ) : (
        <div className="space-y-4">
          {weeks.map((wk) => (
            <section key={wk.start} className="space-y-1.5">
              <p className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
                Week of {format(dateAtNoon(wk.start), "d MMM yyyy")}
              </p>
              <ul className="space-y-2">
                {wk.goals.map((g) => (
                  <li key={g.id} className="rounded-lg border border-border/50 bg-card/60 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <UserAvatar name={nameFor(g.subject_user_id)} avatarUrl={avatarFor(g.subject_user_id)} size="sm" className="mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-foreground truncate">{nameFor(g.subject_user_id)}</p>
                          <p className="text-[10.5px] text-muted-foreground">{goalPeriodLabel(g)}</p>
                          <p className="text-[12.5px] leading-snug mt-1">{goalText(g)}</p>
                          {g.target_value != null && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">Target {g.target_value}</p>
                          )}
                          {g.outcome === "missed" && g.miss_reason && (
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">Why: {g.miss_reason}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <GoalOutcomeChip outcome={g.outcome} />
                        {canManage && (
                          <button
                            type="button"
                            title="Unlink from this project"
                            onClick={() => setGoalProject.mutate({ goalId: g.id, projectId: null })}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <GoalPicker open={pickerOpen} onOpenChange={setPickerOpen} projectId={projectId} nameFor={nameFor} linkedIds={new Set(goals.map((g) => g.id))} />
    </div>
  );
}

function GoalPicker({
  open,
  onOpenChange,
  projectId,
  nameFor,
  linkedIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  nameFor: (id: string) => string;
  linkedIds: Set<string>;
}) {
  const { data, isLoading } = useLinkableGoals(open);
  const { setGoalProject } = useProjectMutations();
  const [search, setSearch] = useState("");

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.data ?? []).filter(
      (g) => !linkedIds.has(g.id) && (!q || goalText(g).toLowerCase().includes(q) || nameFor(g.subject_user_id).toLowerCase().includes(q)),
    );
  }, [data, linkedIds, search, nameFor]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link a department-head goal</DialogTitle>
          <DialogDescription>Goals from the last 30 days. Set new ones on the CEO Overview as usual.</DialogDescription>
        </DialogHeader>
        {data?.migrationPending ? (
          <ProjectsMigrationNotice />
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search goals or people" className="pl-8 h-9" />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
              {isLoading ? (
                <div className="p-3 text-[12px] text-muted-foreground">Loading goals…</div>
              ) : candidates.length === 0 ? (
                <div className="p-3 text-[12px] text-muted-foreground">No goals to link.</div>
              ) : (
                candidates.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    disabled={setGoalProject.isPending}
                    onClick={() => setGoalProject.mutate({ goalId: g.id, projectId }, { onSuccess: () => onOpenChange(false) })}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{goalText(g)}</span>
                      <span className="block text-[10.5px] text-muted-foreground/90">
                        {nameFor(g.subject_user_id)} · {goalPeriodLabel(g)}
                        {g.project_id && " · linked to another project"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <GoalOutcomeChip outcome={g.outcome} />
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
