import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { dateAtNoon, todayInLondon } from "@/hooks/useDepartmentHeadGoals";
import { useProjectTaskMutations, type LinkedGoal, type Project, type ProjectMember } from "@/hooks/useProjects";
import { DEPARTMENT_HEADS, isHeadDepartment } from "@/components/ceo/departmentHeadGoals";
import { goalText } from "./ProjectLinkedGoals";

/**
 * A project's tasks, right under its row on the board (Marcus, 16 Sep: "put
 * the task in the project it belongs to, tick it off, see it all together —
 * no clicking in, no linking"). A task is a department_head_goals row with
 * this project_id; this week's show here, and anything older that was never
 * marked carries forward with the day it was set until someone marks it.
 * Marked tasks stay for the rest of the week, crossed out.
 */
interface Props {
  project: Project;
  members: ProjectMember[];
  goals: LinkedGoal[];
  nameFor: (id: string) => string;
  avatarFor: (id: string) => string | null;
}

const PILLS: Array<{ value: "missed" | "hit" | "exceeded"; label: string; on: string }> = [
  { value: "missed", label: "Missed", on: "bg-rose-500 border-rose-500 text-white" },
  { value: "hit", label: "Hit", on: "bg-emerald-500 border-emerald-500 text-white" },
  { value: "exceeded", label: "Exceeded", on: "bg-violet-500 border-violet-500 text-white" },
];

/** The department a new task is filed under: the owner's head department if
 * they're a known head, else the project's own if it's a head department. */
function departmentFor(ownerId: string, project: Project): string | null {
  const head = DEPARTMENT_HEADS.find((h) => h.userId === ownerId);
  if (head) return head.department;
  return isHeadDepartment(project.department) ? project.department : null;
}

export function ProjectTasksInline({ project, members, goals, nameFor, avatarFor }: Props) {
  const { addTask, markTask } = useProjectTaskMutations();
  const today = todayInLondon();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const lead = members.find((m) => m.is_lead) ?? members[0];
  const [ownerId, setOwnerId] = useState<string>(lead?.user_id ?? "");

  // Open first (oldest carried at the top so it nags), then marked, newest first.
  const rows = useMemo(() => {
    const open = goals.filter((g) => !g.outcome).sort((a, b) => a.period_start.localeCompare(b.period_start));
    const done = goals.filter((g) => !!g.outcome).sort((a, b) => b.period_start.localeCompare(a.period_start));
    return [...open, ...done];
  }, [goals]);

  const owner = ownerId || lead?.user_id || "";
  const department = owner ? departmentFor(owner, project) : null;
  const canAdd = !!owner && !!department && label.trim().length > 0 && !addTask.isPending;

  const submit = () => {
    if (!canAdd || !department) return;
    addTask.mutate(
      { projectId: project.id, ownerId: owner, department, label },
      { onSuccess: () => { setLabel(""); setAdding(false); } },
    );
  };

  if (rows.length === 0 && !adding) {
    return (
      <div className="ml-3 -mt-1 mb-1 pl-3 border-l border-border/50">
        <button type="button" onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 py-1 text-[11px] text-muted-foreground hover:text-foreground">
          <Plus className="h-3 w-3" /> Add task
        </button>
      </div>
    );
  }

  return (
    <div className="ml-3 -mt-1 mb-1 pl-3 border-l border-border/50 space-y-0.5">
      {rows.map((g) => {
        const marked = !!g.outcome;
        const carried = !marked && g.period_start < today;
        return (
          <div key={g.id} className="group/task flex items-center gap-2 py-1">
            <UserAvatar name={nameFor(g.subject_user_id)} avatarUrl={avatarFor(g.subject_user_id)} size="xs" />
            <span className={cn("min-w-0 flex-1 truncate text-[12px]",
              marked && "line-through",
              g.outcome === "missed" ? "text-rose-600/80 dark:text-rose-400/80" : marked ? "text-muted-foreground" : "text-foreground")}>
              {goalText(g)}
              <span className="ml-1.5 text-[10.5px] text-muted-foreground no-underline">
                · {nameFor(g.subject_user_id).split(" ")[0]}
                {carried && <span className="ml-1 text-amber-600 dark:text-amber-400">· set {format(dateAtNoon(g.period_start), "EEE d MMM")}</span>}
              </span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {PILLS.map((p) => (
                <button key={p.value} type="button" disabled={markTask.isPending}
                  onClick={() => markTask.mutate({ id: g.id, outcome: g.outcome === p.value ? null : p.value })}
                  className={cn("rounded-full border px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wider transition-colors",
                    g.outcome === p.value ? p.on : "border-border/70 text-muted-foreground hover:text-foreground",
                    !marked && "opacity-60 group-hover/task:opacity-100")}>
                  {p.label}
                </button>
              ))}
            </span>
          </div>
        );
      })}

      {adding ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAdding(false); }}
            placeholder="What needs doing today?" className="h-8 w-full sm:w-72 text-[12px]" />
          {members.length > 1 && (
            <select value={owner} onChange={(e) => setOwnerId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-[12px]">
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{nameFor(m.user_id)}</option>)}
            </select>
          )}
          <Button size="sm" className="h-8 text-[12px]" disabled={!canAdd} onClick={submit}>
            <Check className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-[12px]" onClick={() => setAdding(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
          {owner && !department && (
            <span className="basis-full text-[11px] text-amber-600 dark:text-amber-400">
              This person isn't a department head and the project has no head department — add their task from the Tasks view instead.
            </span>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 py-1 text-[11px] text-muted-foreground hover:text-foreground">
          <Plus className="h-3 w-3" /> Add task
        </button>
      )}
    </div>
  );
}
