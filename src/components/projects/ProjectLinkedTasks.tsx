import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Link2, Plus, Search, Unlink, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { dateAtNoon, shiftDate, todayInLondon } from "@/hooks/useDepartmentHeadGoals";
import {
  instanceOutcome,
  useLinkableTasks,
  useProjectMutations,
  type LinkedTask,
  type TaskHistoryInstance,
  type TaskOwnerAssignment,
} from "@/hooks/useProjects";
import { ProjectsMigrationNotice } from "./ProjectBits";

interface Props {
  projectId: string;
  /** Every template linked to this project, newest first. */
  tasks: LinkedTask[];
  /** All-time instances for those templates. */
  history: TaskHistoryInstance[];
  /** task_assignments rows for those templates. */
  assignments: TaskOwnerAssignment[];
  nameFor: (id: string) => string;
  avatarFor: (id: string) => string | null;
  canManage: boolean;
}

type DayOutcome = "hit" | "missed" | "pending" | "none";

const outcomeDot: Record<DayOutcome, string> = {
  hit: "bg-emerald-500",
  missed: "bg-rose-500",
  pending: "bg-amber-400",
  none: "bg-border/70",
};

const outcomeWord: Record<DayOutcome, string> = {
  hit: "hit",
  missed: "missed",
  pending: "pending",
  none: "no task that day",
};

interface Tally {
  hit: number;
  missed: number;
  pending: number;
}

interface OwnerHistory {
  userId: string;
  days: Map<string, DayOutcome>;
  tally: Tally;
  /** First day this person had the task. */
  since: string | null;
}

interface TaskHistory {
  owners: OwnerHistory[];
  /** Role- or department-wide assignments, as labels ("All setters"). */
  groups: string[];
  tally: Tally;
}

const DAYS_SHOWN = 14;

const tally0 = (): Tally => ({ hit: 0, missed: 0, pending: 0 });

const humanRole = (role: string) => role.replace(/_/g, " ");

/**
 * Every daily-task template ever linked to this project (tasks.project_id),
 * with the person it belongs to and their hit/miss record — the last 14 days
 * as dots, all-time totals beside them. Instances carry the template id, so
 * history rolls up through it whoever held the task on the day.
 */
export function ProjectLinkedTasks({ projectId, tasks, history, assignments, nameFor, avatarFor, canManage }: Props) {
  const { setTaskProject } = useProjectMutations();
  const [pickerOpen, setPickerOpen] = useState(false);
  const today = todayInLondon();
  const days = useMemo(
    () => Array.from({ length: DAYS_SHOWN }, (_, i) => shiftDate(today, i - (DAYS_SHOWN - 1))),
    [today],
  );
  const windowStart = days[0];

  const byTask = useMemo(() => {
    const m = new Map<string, TaskHistory>();
    const total = tally0();
    const ensure = (templateId: string) => {
      let t = m.get(templateId);
      if (!t) {
        t = { owners: [], groups: [], tally: tally0() };
        m.set(templateId, t);
      }
      return t;
    };
    const ownerFor = (t: TaskHistory, userId: string) => {
      let o = t.owners.find((x) => x.userId === userId);
      if (!o) {
        o = { userId, days: new Map(), tally: tally0(), since: null };
        t.owners.push(o);
      }
      return o;
    };

    // Named owners first, in assignment order, so someone assigned today but
    // without an instance yet still shows.
    for (const a of assignments) {
      if (!a.active) continue;
      const t = ensure(a.template_task_id);
      if (a.assigned_user_id) ownerFor(t, a.assigned_user_id);
      else if (a.assigned_role) t.groups.push(`All ${humanRole(a.assigned_role)}s`);
      else if (a.assigned_department) t.groups.push(`${a.assigned_department} department`);
    }

    for (const inst of history) {
      if (!inst.template_task_id) continue;
      const t = ensure(inst.template_task_id);
      const o = ownerFor(t, inst.assigned_to_user_id);
      const outcome = instanceOutcome(inst, today);
      o.tally[outcome] += 1;
      t.tally[outcome] += 1;
      total[outcome] += 1;
      if (!o.since || inst.due_date < o.since) o.since = inst.due_date;
      if (inst.due_date >= windowStart && inst.due_date <= today) {
        // One person can only have one instance a day; keep the worst reading
        // if the data ever disagrees.
        const prev = o.days.get(inst.due_date);
        const next: DayOutcome =
          prev === "missed" || outcome === "missed"
            ? "missed"
            : prev === "pending" || outcome === "pending"
              ? "pending"
              : "hit";
        o.days.set(inst.due_date, next);
      }
    }
    for (const t of m.values()) t.groups = Array.from(new Set(t.groups));
    return { m, total };
  }, [assignments, history, today, windowStart]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-semibold text-foreground">Linked daily tasks</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {tasks.length} linked · all time {byTask.total.hit} hit · {byTask.total.missed} missed
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" className="h-8 text-[12px] shrink-0" onClick={() => setPickerOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Link task
          </Button>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-[12px] text-muted-foreground">
          No daily tasks feed this project yet. Link a task template — or pick this project when you create one in
          Task Management — and every owner's hit/miss record shows here.
        </p>
      ) : (
        <>
          <Legend />
          <ul className="space-y-2">
            {tasks.map((t) => {
              const h = byTask.m.get(t.id);
              const owners = h?.owners ?? [];
              const groups = h?.groups ?? [];
              return (
                <li key={t.id} className="rounded-lg border border-border/50 bg-card/60 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={cn("text-[12.5px] font-medium leading-snug", !t.active && "line-through text-muted-foreground")}>
                        {t.title}
                      </p>
                      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 mt-0.5">
                        {t.category} · {t.recurrence}
                        {!t.active && " · inactive"}
                        {" · added "}
                        {format(new Date(t.created_at), "d MMM yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {h && (h.tally.hit > 0 || h.tally.missed > 0) && (
                        <span className="text-[11px] text-muted-foreground tabular-nums hidden sm:inline">
                          {h.tally.hit} hit · {h.tally.missed} missed
                        </span>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          title="Unlink from this project"
                          onClick={() => setTaskProject.mutate({ taskId: t.id, projectId: null })}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {groups.length > 0 && (
                    <p className="mt-1.5 inline-flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {groups.join(" · ")}
                    </p>
                  )}

                  {owners.length === 0 ? (
                    <p className="mt-2 text-[11.5px] text-muted-foreground">
                      No one has this task yet — assign it in Task Management → Assignments.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {owners.map((o) => (
                        <li key={o.userId} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                          <div className="flex items-center gap-2 min-w-0 sm:w-44 shrink-0">
                            <UserAvatar name={nameFor(o.userId)} avatarUrl={avatarFor(o.userId)} size="xs" />
                            <span className="text-[12px] truncate">{nameFor(o.userId)}</span>
                          </div>
                          <div className="flex items-center gap-[3px] flex-1" aria-label={`${nameFor(o.userId)}, last ${DAYS_SHOWN} days`}>
                            {days.map((d) => {
                              const outcome = o.days.get(d) ?? "none";
                              return (
                                <span
                                  key={d}
                                  title={`${format(dateAtNoon(d), "EEE d MMM")} · ${outcomeWord[outcome]}`}
                                  className={cn("h-2.5 flex-1 max-w-[14px] rounded-full", outcomeDot[outcome])}
                                />
                              );
                            })}
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 sm:w-40 sm:text-right">
                            {o.tally.hit} hit · {o.tally.missed} missed
                            {o.tally.pending > 0 && ` · ${o.tally.pending} open`}
                            {o.since && (
                              <span className="text-muted-foreground/70"> · since {format(dateAtNoon(o.since), "d MMM")}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <TaskPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        projectId={projectId}
        linkedIds={new Set(tasks.map((t) => t.id))}
      />
    </div>
  );
}

function Legend() {
  const items: DayOutcome[] = ["hit", "missed", "pending", "none"];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
      <span>Last {DAYS_SHOWN} days, oldest → newest</span>
      {items.map((o) => (
        <span key={o} className="inline-flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-full", outcomeDot[o])} />
          {o === "none" ? "no task" : o}
        </span>
      ))}
    </div>
  );
}

function TaskPicker({
  open,
  onOpenChange,
  projectId,
  linkedIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  linkedIds: Set<string>;
}) {
  const { data, isLoading } = useLinkableTasks(open);
  const { setTaskProject } = useProjectMutations();
  const [search, setSearch] = useState("");

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.data ?? []).filter((t) => !linkedIds.has(t.id) && (!q || t.title.toLowerCase().includes(q)));
  }, [data, linkedIds, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link a daily task</DialogTitle>
          <DialogDescription>
            Pick a task template. Every day it is materialised for someone, their hit or miss rolls up here.
          </DialogDescription>
        </DialogHeader>
        {data?.migrationPending ? (
          <ProjectsMigrationNotice />
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates" className="pl-8 h-9" />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
              {isLoading ? (
                <div className="p-3 text-[12px] text-muted-foreground">Loading templates…</div>
              ) : candidates.length === 0 ? (
                <div className="p-3 text-[12px] text-muted-foreground">No templates to link.</div>
              ) : (
                candidates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={setTaskProject.isPending}
                    onClick={() =>
                      setTaskProject.mutate({ taskId: t.id, projectId }, { onSuccess: () => onOpenChange(false) })
                    }
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{t.title}</span>
                      <span className="block text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
                        {t.category} · {t.recurrence}
                        {t.project_id && " · linked to another project"}
                      </span>
                    </span>
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
