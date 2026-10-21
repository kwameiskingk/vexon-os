// Shared CEO department-head goal card (department_head_goals). Two
// configurations: no `department` prop = consolidated card with every head
// (Executive Overview); `department` set = that tab's head(s) only.
// Standalone goal concept — see departmentHeadGoals.ts header.
//
// Who gets a panel (13 Sep 2026): the known heads in DEPARTMENT_HEADS, plus
// any core-team member (src/lib/coreTeam.ts) who has a goal in the period on
// screen, plus anyone picked via "Add head" this session. So a newly hired
// head is pickable the day their role is granted, and sticks once they have
// a goal — no code change needed.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, FolderKanban, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CEOSectionEyebrow } from "@/components/ceo/CEOKpiTile";
import { HeadGoalStreakStrip, StreakLegend } from "@/components/ceo/HeadGoalStreakStrip";
import {
  CUSTOM_GOAL_TYPE,
  DEPARTMENT_HEADS,
  HEAD_DEPARTMENT_LABELS,
  HEAD_DEPARTMENT_OPTIONS,
  goalTypeLabel,
  isHeadDepartment,
  type DepartmentHead,
  type DepartmentHeadGoal,
  type GoalOutcome,
  type GoalPeriodType,
  type HeadDepartment,
} from "@/components/ceo/departmentHeadGoals";
import { useCoreTeam } from "@/hooks/useCoreTeam";
import { CORE_TEAM_CAPTION, coreTeamDisplayName } from "@/lib/coreTeam";
import {
  dateAtNoon,
  mondayOf,
  periodStartFor,
  shiftDate,
  todayInLondon,
  useDepartmentHeadGoals,
  useDepartmentHeadWeekOutcomes,
} from "@/hooks/useDepartmentHeadGoals";
import { useOffboardedUserIds } from "@/hooks/useOffboardedUsers";
import { useProjectOptions, type ProjectOption } from "@/hooks/useProjects";
import { ProjectDialog } from "@/components/projects/ProjectDialog";

const OUTCOME_PILLS: { value: GoalOutcome; label: string; active: string }[] = [
  { value: "missed", label: "Missed", active: "bg-rose-500 border-rose-500 text-white" },
  { value: "hit", label: "Hit", active: "bg-emerald-500 border-emerald-500 text-white" },
  { value: "exceeded", label: "Exceeded", active: "bg-violet-500 border-violet-500 text-white" },
];

// Goals are free text (2026-08-06 ruling): every save writes
// goal_type='custom' with the description in goal_label. Pre-ruling preset
// rows still render via the goalTypeLabel fallback in renderGoalRow.
interface GoalDraft {
  target_value: string;
  goal_label: string;
  /** Project the goal is tied to (null = none). */
  project_id: string | null;
}

const emptyDraft = (project_id: string | null = null): GoalDraft => ({
  target_value: "",
  goal_label: "",
  project_id,
});

// Radix Select can't carry an empty-string item, so "No project" gets a
// sentinel that never collides with a uuid; "+ New project…" likewise.
const NO_PROJECT = "none";
const NEW_PROJECT = "__new__";

interface Props {
  /** When set, renders only that department's head (department-tab config). */
  department?: HeadDepartment;
  className?: string;
}

export function DepartmentHeadGoalsCard({ department, className }: Props) {
  const [periodType, setPeriodType] = useState<GoalPeriodType>("daily");
  // The card has its own compact navigator (Marcus, 3 Sep): it used to be
  // pinned to "today", so yesterday's goals could never be reviewed or
  // marked. `anchor` is the selected day in Europe/London; weekly mode uses
  // the Monday of that day's week. Deliberately independent of the CEO page
  // date picker, which drives the KPI tiles.
  const [anchor, setAnchor] = useState<string>(() => todayInLondon());
  const today = todayInLondon();
  const periodStart = periodStartFor(periodType, anchor);
  const weekStart = mondayOf(anchor);
  const onCurrentPeriod = periodStart === periodStartFor(periodType, today);
  const { goalsQuery, addGoal, updateGoal, deleteGoal, markOutcome } = useDepartmentHeadGoals(
    periodType,
    periodStart,
  );
  const weekOutcomesQuery = useDepartmentHeadWeekOutcomes(weekStart);
  const weekGoals = useMemo(() => weekOutcomesQuery.data ?? [], [weekOutcomesQuery.data]);

  // Miss-reason editor: marking "missed" requires a why before it saves.
  const [missEditor, setMissEditor] = useState<{ goalId: string; reason: string } | null>(null);

  // One editor open at a time: goalId set = editing an existing goal,
  // goalId null = adding a new one for headUserId. headDepartment
  // disambiguates heads who hold two departments (e.g. Nadia → dual cards).
  const [editor, setEditor] = useState<{
    headUserId: string;
    headDepartment: HeadDepartment;
    goalId: string | null;
    draft: GoalDraft;
  } | null>(null);

  // Navigator: previous / next / back to today. Any open editor closes so a
  // half-typed goal never lands on the wrong day.
  const stepPeriod = (direction: -1 | 1) => {
    setAnchor((cur) => shiftDate(cur, direction * (periodType === "daily" ? 1 : 7)));
    setEditor(null);
    setMissEditor(null);
  };
  const goToToday = () => {
    setAnchor(todayInLondon());
    setEditor(null);
    setMissEditor(null);
  };

  // Former employees stop being department heads the moment they are
  // offboarded — no code change needed to retire a card (the owner, 25 Aug).
  // Their historical goals are retained; only the live card disappears.
  const { data: offboardedIds } = useOffboardedUserIds();
  const { data: coreTeam = [] } = useCoreTeam();
  const coreById = useMemo(() => new Map(coreTeam.map((m) => [m.id, m])), [coreTeam]);

  const goals = useMemo(() => goalsQuery.data ?? [], [goalsQuery.data]);

  // Projects a goal can be tied to (Marcus sets goals here, not on the
  // project page — 14 Sep). Pre-migration the picker simply doesn't render
  // and project_id is never written, so the card behaves as before.
  const projectOptionsQuery = useProjectOptions();
  const projectsReady = !!projectOptionsQuery.data && !projectOptionsQuery.data.migrationPending;
  const liveProjects = useMemo(() => projectOptionsQuery.data?.live ?? [], [projectOptionsQuery.data]);
  const projectById = useMemo(
    () => new Map((projectOptionsQuery.data?.projects ?? []).map((p) => [p.id, p])),
    [projectOptionsQuery.data],
  );
  const memberProjectIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (projectOptionsQuery.data?.members ?? []).forEach((m) => {
      if (!map.has(m.user_id)) map.set(m.user_id, new Set());
      map.get(m.user_id)!.add(m.project_id);
    });
    return map;
  }, [projectOptionsQuery.data]);
  /** Live projects the head is a member of, in board order. */
  const projectsFor = (head: DepartmentHead): ProjectOption[] => {
    const ids = memberProjectIds.get(head.userId);
    return ids ? liveProjects.filter((p) => ids.has(p.id)) : [];
  };
  // "+ New project…" from the goal editor (Marcus, 14 Sep): opens the
  // project dialog with the head pre-ticked as lead, then ties the goal
  // draft to whatever was created. `justCreated` carries the title until
  // the options list refetches, so the select never shows blank.
  const [newProjectFor, setNewProjectFor] = useState<DepartmentHead | null>(null);
  const [justCreated, setJustCreated] = useState<{ id: string; title: string } | null>(null);
  /** New-goal default: the head's only live project, else none. */
  const defaultProjectFor = (head: DepartmentHead): string | null => {
    const own = projectsFor(head);
    return own.length === 1 ? own[0].id : null;
  };

  // Heads picked from the core team this session (until they save a goal,
  // after which the goal row itself keeps their panel alive).
  const [pickedHeads, setPickedHeads] = useState<DepartmentHead[]>([]);
  const [picker, setPicker] = useState<{ userId: string; department: HeadDepartment | "" } | null>(null);

  const heads = useMemo(() => {
    const list: DepartmentHead[] = [];
    const seen = new Set<string>();
    const push = (h: DepartmentHead) => {
      const key = `${h.userId}:${h.department}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push(h);
    };
    (DEPARTMENT_HEADS ?? []).filter((h) => h?.userId && !offboardedIds?.has(h.userId)).forEach(push);
    [...goals, ...weekGoals].forEach((g) => {
      const member = coreById.get(g.subject_user_id);
      if (!member || !isHeadDepartment(g.department)) return;
      push({
        userId: member.id,
        name: coreTeamDisplayName(member),
        department: g.department,
        deptLabel: HEAD_DEPARTMENT_LABELS[g.department],
      });
    });
    pickedHeads.forEach(push);
    return department ? list.filter((h) => h.department === department) : list;
  }, [offboardedIds, goals, weekGoals, coreById, pickedHeads, department]);

  const shownKeys = useMemo(() => new Set(heads.map((h) => `${h.userId}:${h.department}`)), [heads]);
  const pickerDepartment: HeadDepartment | "" = department ?? picker?.department ?? "";
  const pickerMember = picker?.userId ? coreById.get(picker.userId) : undefined;
  const pickerDuplicate =
    !!picker?.userId && !!pickerDepartment && shownKeys.has(`${picker.userId}:${pickerDepartment}`);
  const pickerValid = !!pickerMember && !!pickerDepartment && !pickerDuplicate;

  const addPickedHead = () => {
    if (!pickerMember || !pickerDepartment) return;
    const head: DepartmentHead = {
      userId: pickerMember.id,
      name: coreTeamDisplayName(pickerMember),
      department: pickerDepartment,
      deptLabel: HEAD_DEPARTMENT_LABELS[pickerDepartment],
    };
    setPickedHeads((cur) => [...cur, head]);
    setPicker(null);
    setMissEditor(null);
    setEditor({
      headUserId: head.userId,
      headDepartment: head.department,
      goalId: null,
      draft: emptyDraft(defaultProjectFor(head)),
    });
  };
  const saving = addGoal.isPending || updateGoal.isPending;

  const periodLabel =
    periodType === "daily"
      ? format(dateAtNoon(periodStart), "EEE d MMM")
      : `${format(dateAtNoon(periodStart), "EEE d MMM")} to ${format(dateAtNoon(shiftDate(periodStart, 4)), "EEE d MMM")}`;
  const periodHint = onCurrentPeriod
    ? periodType === "daily"
      ? "Today"
      : "This week"
    : periodType === "daily" && periodStart === shiftDate(today, -1)
      ? "Yesterday"
      : periodType === "weekly" && periodStart === shiftDate(mondayOf(today), -7)
        ? "Last week"
        : null;

  const openAdd = (head: DepartmentHead) =>
    setEditor({
      headUserId: head.userId,
      headDepartment: head.department,
      goalId: null,
      draft: emptyDraft(defaultProjectFor(head)),
    });

  // Editing a pre-ruling preset row folds its title (and any old sub-label)
  // into the description so nothing is lost when it saves as free text.
  const openEdit = (head: DepartmentHead, goal: DepartmentHeadGoal) =>
    setEditor({
      headUserId: head.userId,
      headDepartment: head.department,
      goalId: goal.id,
      draft: {
        target_value: goal.target_value != null ? String(goal.target_value) : "",
        goal_label:
          goal.goal_type === CUSTOM_GOAL_TYPE
            ? (goal.goal_label ?? "")
            : [goalTypeLabel(head.department, goal.goal_type), goal.goal_label]
                .filter(Boolean)
                .join(" — "),
        project_id: goal.project_id ?? null,
      },
    });

  const draftValid = (draft: GoalDraft) => draft.goal_label.trim().length > 0;

  const saveEditor = async (head: DepartmentHead) => {
    if (!editor || !draftValid(editor.draft)) return;
    const { draft, goalId } = editor;
    const target = draft.target_value.trim() === "" ? null : Number(draft.target_value);
    const fields = {
      goal_type: CUSTOM_GOAL_TYPE,
      goal_label: draft.goal_label.trim(),
      target_value: target != null && Number.isFinite(target) ? target : null,
      // Only send the column once the Projects migration is in — pre-migration
      // a project_id key (even null) would fail the whole write.
      ...(projectsReady ? { project_id: draft.project_id } : {}),
    };
    if (goalId) {
      await updateGoal.mutateAsync({ id: goalId, ...fields });
    } else {
      await addGoal.mutateAsync({
        subject_user_id: head.userId,
        department: head.department,
        period_type: periodType,
        period_start: periodStart,
        ...fields,
      });
    }
    setEditor(null);
  };

  const periodToggle = (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <button
        type="button"
        onClick={() => setPicker((cur) => (cur ? null : { userId: "", department: department ?? "" }))}
        aria-expanded={!!picker}
        className={cn(
          "inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide rounded-full border transition-colors",
          picker
            ? "border-foreground/40 text-foreground bg-background"
            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
        )}
      >
        <UserPlus className="h-3 w-3" /> Add head
      </button>
      <div className="inline-flex items-center rounded-full border border-border bg-muted/40 p-0.5">
        <button
          type="button"
          onClick={() => stepPeriod(-1)}
          aria-label={periodType === "daily" ? "Previous day" : "Previous week"}
          className="h-6 w-6 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-2 text-[10px] uppercase tracking-widest text-foreground tabular-nums whitespace-nowrap">
          {periodHint ? (
            <>
              <span className="text-muted-foreground/70">{periodHint} </span>
              {periodLabel}
            </>
          ) : (
            periodLabel
          )}
        </span>
        <button
          type="button"
          onClick={() => stepPeriod(1)}
          aria-label={periodType === "daily" ? "Next day" : "Next week"}
          className="h-6 w-6 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {!onCurrentPeriod && (
        <button
          type="button"
          onClick={goToToday}
          className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        >
          {periodType === "daily" ? "Today" : "This week"}
        </button>
      )}
      <div className="inline-flex items-center rounded-full border border-border bg-muted/40 p-0.5">
        {(["daily", "weekly"] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              setPeriodType(k);
              setEditor(null);
              setMissEditor(null);
            }}
            className={cn(
              "px-3 py-1 text-[10px] font-semibold uppercase tracking-wide rounded-full transition-colors",
              periodType === k
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );

  const renderProjectSelect = (head: DepartmentHead, draft: GoalDraft) => {
    if (!projectsReady) return null;
    const own = projectsFor(head);
    const ownIds = new Set(own.map((p) => p.id));
    const others = liveProjects.filter((p) => !ownIds.has(p.id));
    // A goal can stay on an archived project it was tied to earlier; keep it
    // selectable so an edit doesn't silently drop the link.
    const current = draft.project_id ? projectById.get(draft.project_id) : undefined;
    const currentArchived = !!current && !!current.archived_at;
    const pendingNew = !current && justCreated && draft.project_id === justCreated.id ? justCreated : null;
    const item = (p: Pick<ProjectOption, "id" | "title">) => (
      <SelectItem key={p.id} value={p.id} className="text-xs">
        {p.title}
      </SelectItem>
    );
    return (
      <Select
        value={draft.project_id ?? NO_PROJECT}
        onValueChange={(v) => {
          if (v === NEW_PROJECT) {
            setNewProjectFor(head);
            return;
          }
          setEditor((cur) =>
            cur ? { ...cur, draft: { ...cur.draft, project_id: v === NO_PROJECT ? null : v } } : cur,
          );
        }}
      >
        <SelectTrigger className="h-8 text-xs" aria-label="Project">
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <FolderKanban className="h-3 w-3 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Project" />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PROJECT} className="text-xs text-muted-foreground">
            No project
          </SelectItem>
          {own.length > 0 && others.length > 0 ? (
            <>
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Their projects
                </SelectLabel>
                {own.map(item)}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Other projects
                </SelectLabel>
                {others.map(item)}
              </SelectGroup>
            </>
          ) : (
            [...own, ...others].map(item)
          )}
          {currentArchived && (
            <SelectItem value={current!.id} className="text-xs">
              {current!.title}
              <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">archived</span>
            </SelectItem>
          )}
          {pendingNew && item(pendingNew)}
          <SelectSeparator />
          <SelectItem value={NEW_PROJECT} className="text-xs text-primary">
            + New project…
          </SelectItem>
        </SelectContent>
      </Select>
    );
  };

  const renderEditor = (head: DepartmentHead) => {
    if (!editor) return null;
    const { draft } = editor;
    return (
      <div className="rounded-lg border border-primary/30 bg-muted/30 p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-2">
          <Input
            autoFocus
            placeholder="Describe the goal"
            className="h-8 text-xs"
            value={draft.goal_label}
            onChange={(e) =>
              setEditor((cur) =>
                cur ? { ...cur, draft: { ...cur.draft, goal_label: e.target.value } } : cur,
              )
            }
          />
          <Input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            placeholder="Target"
            className="h-8 text-xs"
            value={draft.target_value}
            onChange={(e) =>
              setEditor((cur) =>
                cur ? { ...cur, draft: { ...cur.draft, target_value: e.target.value } } : cur,
              )
            }
          />
        </div>
        {renderProjectSelect(head, draft)}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditor(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={!draftValid(draft) || saving}
            onClick={() => saveEditor(head)}
          >
            {editor.goalId ? "Update" : "Save"}
          </Button>
        </div>
      </div>
    );
  };

  const startMiss = (goal: DepartmentHeadGoal) =>
    setMissEditor({ goalId: goal.id, reason: goal.miss_reason ?? "" });

  const saveMiss = async () => {
    if (!missEditor || missEditor.reason.trim() === "") return;
    await markOutcome.mutateAsync({
      id: missEditor.goalId,
      outcome: "missed",
      missReason: missEditor.reason.trim(),
    });
    setMissEditor(null);
  };

  const renderGoalRow = (head: DepartmentHead, goal: DepartmentHeadGoal) => {
    if (editor && editor.goalId === goal.id) return <div key={goal.id}>{renderEditor(head)}</div>;
    const isCustom = goal.goal_type === CUSTOM_GOAL_TYPE;
    const title = isCustom ? goal.goal_label : goalTypeLabel(head.department, goal.goal_type);
    const missing = missEditor?.goalId === goal.id;
    const project = goal.project_id ? projectById.get(goal.project_id) : undefined;
    return (
      <div key={goal.id} className="group py-2 border-b border-border/40 last:border-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">{title}</p>
              {!isCustom && goal.goal_label && (
                <p className="text-[11px] text-muted-foreground truncate">{goal.goal_label}</p>
              )}
              {project && (
                <Link
                  to={`/admin/ceo/projects/${project.id}`}
                  title={`Open project: ${project.title}`}
                  className="mt-0.5 inline-flex items-center gap-1 max-w-[220px] rounded-full border border-border/60 bg-muted/40 px-1.5 py-px text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                >
                  <FolderKanban className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{project.title}</span>
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {goal.target_value != null && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground tabular-nums">
                {goal.target_value}
              </span>
            )}
            <div className="inline-flex items-center gap-1">
              {OUTCOME_PILLS.map((pill) => (
                <button
                  key={pill.value}
                  onClick={() =>
                    pill.value === "missed"
                      ? startMiss(goal)
                      : markOutcome.mutate({ id: goal.id, outcome: pill.value })
                  }
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                    goal.outcome === pill.value
                      ? pill.active
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
                  )}
                >
                  {pill.label}
                </button>
              ))}
            </div>
            <button
              className="p-1 rounded text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
              onClick={() => openEdit(head, goal)}
              aria-label="Edit goal"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              className="p-1 rounded text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-opacity"
              onClick={() => deleteGoal.mutate(goal.id)}
              aria-label="Remove goal"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {missing && (
          <div className="mt-2 ml-4 space-y-2">
            <Textarea
              autoFocus
              placeholder="Why was this missed? (required)"
              className="text-xs min-h-[60px]"
              value={missEditor.reason}
              onChange={(e) =>
                setMissEditor((cur) => (cur ? { ...cur, reason: e.target.value } : cur))
              }
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setMissEditor(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={missEditor.reason.trim() === "" || markOutcome.isPending}
                onClick={saveMiss}
              >
                Mark missed
              </Button>
            </div>
          </div>
        )}
        {!missing && goal.outcome === "missed" && goal.miss_reason && (
          <p className="mt-1 ml-4 text-[11px] italic text-muted-foreground">
            Why: {goal.miss_reason}
          </p>
        )}
      </div>
    );
  };

  const renderHeadPanel = (head: DepartmentHead) => {
    // Scope by department too, so a head who holds two departments (e.g. Nadia
    // → Acquisition + Fulfilment) gets independent goals in each card.
    const headGoals = goals.filter(
      (g) => g.subject_user_id === head.userId && g.department === head.department,
    );
    const adding =
      editor &&
      editor.headUserId === head.userId &&
      editor.headDepartment === head.department &&
      editor.goalId === null;
    return (
      <section
        key={`${head.userId}-${head.department}`}
        className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="text-sm font-semibold text-foreground leading-tight">{head.name}</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5">
              {head.deptLabel}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => openAdd(head)}
          >
            <Plus className="h-3 w-3" /> Add goal
          </Button>
        </div>

        {goalsQuery.isLoading ? (
          <div className="space-y-2">
            <div className="h-7 rounded bg-muted animate-pulse" />
            <div className="h-7 rounded bg-muted animate-pulse" />
          </div>
        ) : (
          <>
            {headGoals.length === 0 && !adding && (
              <p className="text-xs text-muted-foreground py-2">
                No goals set for {periodType === "daily" ? "this day" : "this week"} yet.
              </p>
            )}
            <div>{headGoals.map((g) => renderGoalRow(head, g))}</div>
            {adding && <div className="mt-2">{renderEditor(head)}</div>}
            <HeadGoalStreakStrip
              weekStart={weekStart}
              goals={weekGoals.filter(
                (g) => g.subject_user_id === head.userId && g.department === head.department,
              )}
            />
          </>
        )}
      </section>
    );
  };

  return (
    <section className={cn("space-y-4", className)}>
      <CEOSectionEyebrow
        label={department ? "Head Goals" : "Department Head Goals"}
        accent="emerald"
        trailing={periodToggle}
      />
      {picker && (
        <div className="rounded-xl border border-primary/30 bg-muted/30 p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2 items-start">
            <div className="space-y-1">
              <Select value={picker.userId} onValueChange={(v) => setPicker((cur) => (cur ? { ...cur, userId: v } : cur))}>
                <SelectTrigger className="h-8 text-xs" aria-label="Choose a head">
                  <SelectValue placeholder="Who is the head?" />
                </SelectTrigger>
                <SelectContent>
                  {coreTeam.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {coreTeamDisplayName(m)}
                      {m.role && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                          {m.role.replace(/_/g, " ")}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10.5px] text-muted-foreground/80 pl-0.5">{CORE_TEAM_CAPTION}</p>
            </div>
            {department ? (
              <div className="h-8 inline-flex items-center px-3 rounded-md border border-border/60 bg-background text-xs text-muted-foreground">
                {HEAD_DEPARTMENT_LABELS[department]}
              </div>
            ) : (
              <Select
                value={picker.department}
                onValueChange={(v) =>
                  setPicker((cur) => (cur ? { ...cur, department: isHeadDepartment(v) ? v : "" } : cur))
                }
              >
                <SelectTrigger className="h-8 text-xs" aria-label="Department">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  {HEAD_DEPARTMENT_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setPicker(null)}>
                Cancel
              </Button>
              <Button size="sm" className="h-8 text-xs" disabled={!pickerValid} onClick={addPickedHead}>
                Add
              </Button>
            </div>
          </div>
          {pickerDuplicate && (
            <p className="text-[11px] text-muted-foreground">They already have a card for that department.</p>
          )}
        </div>
      )}
      {heads.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 items-start">
          {heads.map(renderHeadPanel)}
        </div>
      ) : (
        // A department can legitimately have NO head right now (Nadia Kowalski
        // covered Acquisition & Sales and Fulfilment until 25 Aug). This used
        // to dereference heads[0] and white-screen /admin/ceo/sales.
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center">
          <p className="text-sm font-medium text-foreground">
            {department ? "No department head assigned" : "No department heads yet"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Use "Add head" to pick someone from the core team{department ? " for this department" : ""}.
          </p>
        </div>
      )}
      <StreakLegend />
      <ProjectDialog
        open={!!newProjectFor}
        onOpenChange={(o) => !o && setNewProjectFor(null)}
        defaultMembers={newProjectFor ? [{ user_id: newProjectFor.userId, is_lead: true }] : []}
        onSaved={(id) => {
          setJustCreated({ id, title: "New project" });
          setEditor((cur) => (cur ? { ...cur, draft: { ...cur.draft, project_id: id } } : cur));
        }}
      />
    </section>
  );
}
