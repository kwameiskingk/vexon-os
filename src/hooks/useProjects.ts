// Data access for the Projects tab (migration 20260913150000): projects,
// project_members, project_updates, plus the project_id links on tasks and
// department_head_goals.
//
// Pre-migration every read degrades to an empty result with
// `migrationPending: true` (house pattern: src/lib/migrationGuard.ts) and
// every write surfaces the one-line notice as a warning toast — nothing
// crashes. Tables are newer than the generated types, so the `as any` cast
// pattern applies until types.ts is regenerated.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { guarded, isMissingSchemaError, withMigrationGuard, type GuardedResult } from "@/lib/migrationGuard";
import { mondayOf, shiftDate, todayInLondon } from "@/hooks/useDepartmentHeadGoals";
import {
  PROJECTS_MIGRATION_NOTICE,
  statusMeta,
  type ProjectStatus,
} from "@/components/projects/projectStatus";
import type { DepartmentHeadGoal } from "@/components/ceo/departmentHeadGoals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/* ------------------------------------------------------------------ */
/*                                Types                                */
/* ------------------------------------------------------------------ */

export interface Project {
  id: string;
  title: string;
  description: string | null;
  department: string | null;
  status: ProjectStatus;
  target_date: string | null;
  progress_pct: number | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  is_lead: boolean;
  added_by: string | null;
  added_at: string;
}

/**
 * A day's entry in project_updates. The daily log is no longer rendered
 * (Marcus, 14 Sep: "the tasks are almost a daily thing anyway") — the table
 * and saveDailyUpdate are kept so nothing has to be migrated away.
 */
export interface ProjectUpdate {
  id: string;
  project_id: string;
  update_date: string;
  done_text: string | null;
  remaining_text: string | null;
  blocker_text: string | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A daily-task template (public.tasks) linked to a project. */
export interface LinkedTask {
  id: string;
  title: string;
  project_id: string | null;
  category: "task" | "responsibility";
  recurrence: "once" | "daily" | "weekly" | "monthly";
  active: boolean;
  created_at: string;
}

/**
 * Who a template is handed to (task_assignments): a specific person, or a
 * whole role / department. Instances then carry the actual person.
 */
export interface TaskOwnerAssignment {
  id: string;
  template_task_id: string;
  assigned_user_id: string | null;
  assigned_role: string | null;
  assigned_department: string | null;
  active: boolean;
  start_date: string;
  end_date: string | null;
}

/** The slim per-day row behind a task's hit/miss history. */
export interface TaskHistoryInstance {
  id: string;
  template_task_id: string | null;
  assigned_to_user_id: string;
  due_date: string;
  status: "open" | "done" | "skipped";
}

/** A materialised task_instances row for a linked template. */
export interface LinkedTaskInstance {
  id: string;
  template_task_id: string | null;
  assigned_to_user_id: string;
  title: string;
  due_date: string;
  status: "open" | "done" | "skipped";
  completed_at: string | null;
  category: "task" | "responsibility";
}

export interface LinkedGoal extends DepartmentHeadGoal {
  project_id: string | null;
}

export interface MemberInput {
  user_id: string;
  is_lead: boolean;
}

/* ------------------------------------------------------------------ */
/*                             Date helpers                            */
/* ------------------------------------------------------------------ */

/** Mon–Sun of the current week, Europe/London (Marcus's clock). */
export const currentWeek = () => {
  const today = todayInLondon();
  const start = mondayOf(today);
  return { today, start, end: shiftDate(start, 6) };
};

/**
 * Hit/miss reading of a task instance. Open instances whose day has passed
 * count as missed; today's open ones are still pending.
 */
export const instanceOutcome = (
  inst: Pick<LinkedTaskInstance, "status" | "due_date">,
  today: string,
): "hit" | "missed" | "pending" => {
  if (inst.status === "done") return "hit";
  if (inst.status === "skipped") return "missed";
  return inst.due_date < today ? "missed" : "pending";
};

const GOAL_COLUMNS =
  "id, subject_user_id, department, period_type, period_start, goal_type, goal_label, target_value, outcome, miss_reason, created_at, project_id";
const INSTANCE_COLUMNS =
  "id, template_task_id, assigned_to_user_id, title, due_date, status, completed_at, category";
const TASK_COLUMNS = "id, title, project_id, category, recurrence, active, created_at";
const ASSIGNMENT_COLUMNS =
  "id, template_task_id, assigned_user_id, assigned_role, assigned_department, active, start_date, end_date";
const HISTORY_COLUMNS = "id, template_task_id, assigned_to_user_id, due_date, status";

/**
 * Every instance ever materialised for these templates — the project page
 * is "a task list of all the tasks, forever" (Marcus, 14 Sep). PostgREST caps
 * a request at 1,000 rows, so page through; ten pages is years of history.
 */
async function fetchTaskHistory(templateIds: string[]): Promise<GuardedResult<TaskHistoryInstance[]>> {
  const PAGE = 1000;
  const MAX_PAGES = 10;
  const all: TaskHistoryInstance[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await withMigrationGuard<TaskHistoryInstance[]>(
      () =>
        db
          .from("task_instances")
          .select(HISTORY_COLUMNS)
          .in("template_task_id", templateIds)
          .order("due_date", { ascending: false })
          .order("id", { ascending: true })
          .range(page * PAGE, (page + 1) * PAGE - 1),
      [],
    );
    if (res.migrationPending) return res;
    all.push(...res.data);
    if (res.data.length < PAGE) break;
  }
  return guarded(all);
}

/* ------------------------------------------------------------------ */
/*                               Reads                                 */
/* ------------------------------------------------------------------ */

export interface ProjectsOverview {
  migrationPending: boolean;
  projects: Project[];
  members: ProjectMember[];
  /** Every task template linked to any live project. */
  linkedTasks: LinkedTask[];
  /** This week's instances of those templates. */
  weekInstances: LinkedTaskInstance[];
  /** This week's head goals linked to any project. */
  weekGoals: LinkedGoal[];
  /**
   * Open (unmarked) goals from BEFORE this week, still linked to a project.
   * Marcus, 15 Sep: anything not hit rolls over and stays visible until it's
   * crossed out. These render under the project with the day they were set.
   */
  carriedGoals: LinkedGoal[];
}

export const PROJECTS_OVERVIEW_KEY = ["projects-overview"] as const;

/**
 * Board data. Archived projects are left out unless `includeArchived` is set
 * (the "Show archived" toggle); callers still split on `archived_at` so the
 * tiles never count an archived project.
 */
export function useProjectsOverview(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = !!opts.includeArchived;
  return useQuery({
    queryKey: [...PROJECTS_OVERVIEW_KEY, { includeArchived }],
    queryFn: async (): Promise<ProjectsOverview> => {
      const empty: ProjectsOverview = {
        migrationPending: false,
        projects: [],
        members: [],
        linkedTasks: [],
        weekInstances: [],
        weekGoals: [],
        carriedGoals: [],
      };
      const projects = await withMigrationGuard<Project[]>(
        () => {
          let q = db.from("projects").select("*");
          if (!includeArchived) q = q.is("archived_at", null);
          return q.order("position", { ascending: true }).order("created_at", { ascending: true });
        },
        [],
      );
      if (projects.migrationPending) return { ...empty, migrationPending: true };

      const week = currentWeek();
      const [members, tasks, goals, carried] = await Promise.all([
        withMigrationGuard<ProjectMember[]>(() => db.from("project_members").select("*"), []),
        withMigrationGuard<LinkedTask[]>(
          () => db.from("tasks").select(TASK_COLUMNS).not("project_id", "is", null),
          [],
        ),
        withMigrationGuard<LinkedGoal[]>(
          () =>
            db
              .from("department_head_goals")
              .select(GOAL_COLUMNS)
              .not("project_id", "is", null)
              .gte("period_start", week.start)
              .lte("period_start", week.end),
          [],
        ),
        withMigrationGuard<LinkedGoal[]>(
          () =>
            db
              .from("department_head_goals")
              .select(GOAL_COLUMNS)
              .not("project_id", "is", null)
              .is("outcome", null)
              .lt("period_start", week.start)
              .order("period_start", { ascending: false })
              .limit(300),
          [],
        ),
      ]);

      const templateIds = tasks.data.map((t) => t.id);
      const instances =
        templateIds.length === 0
          ? []
          : ((
              await withMigrationGuard<LinkedTaskInstance[]>(
                () =>
                  db
                    .from("task_instances")
                    .select(INSTANCE_COLUMNS)
                    .in("template_task_id", templateIds)
                    .gte("due_date", week.start)
                    .lte("due_date", week.end),
                [],
              )
            ).data ?? []);

      return {
        migrationPending: false,
        projects: projects.data,
        members: members.data,
        linkedTasks: tasks.data,
        weekInstances: instances,
        weekGoals: goals.data,
        carriedGoals: carried.data,
      };
    },
  });
}

export interface ProjectDetail {
  migrationPending: boolean;
  project: Project | null;
  members: ProjectMember[];
  /** Every task template ever linked, newest first. */
  linkedTasks: LinkedTask[];
  /** Who each linked template is assigned to (people, roles, departments). */
  taskAssignments: TaskOwnerAssignment[];
  /** All-time instances for the linked templates, newest first. */
  taskHistory: TaskHistoryInstance[];
  /** Every head goal ever linked, newest first. */
  linkedGoals: LinkedGoal[];
}

export const projectDetailKey = (id: string) => ["project", id] as const;

export function useProjectDetail(id: string | undefined) {
  return useQuery({
    queryKey: projectDetailKey(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<ProjectDetail> => {
      const empty: ProjectDetail = {
        migrationPending: false,
        project: null,
        members: [],
        linkedTasks: [],
        taskAssignments: [],
        taskHistory: [],
        linkedGoals: [],
      };
      const project = await withMigrationGuard<Project | null>(
        () => db.from("projects").select("*").eq("id", id).maybeSingle(),
        null,
      );
      if (project.migrationPending) return { ...empty, migrationPending: true };
      if (!project.data) return empty;

      const [members, tasks, goals] = await Promise.all([
        withMigrationGuard<ProjectMember[]>(
          () => db.from("project_members").select("*").eq("project_id", id).order("is_lead", { ascending: false }).order("added_at"),
          [],
        ),
        withMigrationGuard<LinkedTask[]>(
          () =>
            db
              .from("tasks")
              .select(TASK_COLUMNS)
              .eq("project_id", id)
              .order("created_at", { ascending: false })
              .order("title"),
          [],
        ),
        withMigrationGuard<LinkedGoal[]>(
          () =>
            db
              .from("department_head_goals")
              .select(GOAL_COLUMNS)
              .eq("project_id", id)
              .order("period_start", { ascending: false })
              .order("created_at", { ascending: true })
              .limit(500),
          [],
        ),
      ]);

      const templateIds = tasks.data.map((t) => t.id);
      const [assignments, history] =
        templateIds.length === 0
          ? [guarded<TaskOwnerAssignment[]>([]), guarded<TaskHistoryInstance[]>([])]
          : await Promise.all([
              withMigrationGuard<TaskOwnerAssignment[]>(
                () =>
                  db
                    .from("task_assignments")
                    .select(ASSIGNMENT_COLUMNS)
                    .in("template_task_id", templateIds)
                    .order("start_date", { ascending: true }),
                [],
              ),
              fetchTaskHistory(templateIds),
            ]);

      return {
        migrationPending: false,
        project: project.data,
        members: members.data,
        linkedTasks: tasks.data,
        taskAssignments: assignments.data,
        taskHistory: history.data,
        linkedGoals: goals.data,
      };
    },
  });
}

/** Just enough of a project to fill a picker or a chip. */
export type ProjectOption = Pick<Project, "id" | "title" | "status" | "archived_at">;

export interface ProjectOptions {
  migrationPending: boolean;
  /** Every project, archived included, so a chip on an old goal still has a title. */
  projects: ProjectOption[];
  /** Live (non-archived) projects only — what a picker should list. */
  live: ProjectOption[];
  /** Membership rows, for "which projects is this person on". */
  members: Pick<ProjectMember, "project_id" | "user_id">[];
}

export const PROJECT_OPTIONS_KEY = ["project-options"] as const;

/**
 * Light project list for pickers outside the Projects tab (the CEO Overview
 * goal editor). Pre-migration → empty with `migrationPending`, so callers
 * hide the control rather than crash.
 */
export function useProjectOptions() {
  return useQuery({
    queryKey: PROJECT_OPTIONS_KEY,
    queryFn: async (): Promise<ProjectOptions> => {
      const projects = await withMigrationGuard<ProjectOption[]>(
        () =>
          db
            .from("projects")
            .select("id, title, status, archived_at")
            .order("position", { ascending: true })
            .order("created_at", { ascending: true }),
        [],
      );
      if (projects.migrationPending) {
        return { migrationPending: true, projects: [], live: [], members: [] };
      }
      const members = await withMigrationGuard<Pick<ProjectMember, "project_id" | "user_id">[]>(
        () => db.from("project_members").select("project_id, user_id"),
        [],
      );
      return {
        migrationPending: false,
        projects: projects.data,
        live: projects.data.filter((p) => !p.archived_at),
        members: members.data,
      };
    },
  });
}

/**
 * One person's task instances between two dates (inclusive) — the "Elena's
 * own tasks" panel. Reads under the "Admins read all instances" policy, so a
 * viewer without that access simply sees an empty list.
 */
export function usePersonTaskInstances(userId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["person-task-instances", userId, from, to],
    enabled: !!userId,
    queryFn: async (): Promise<LinkedTaskInstance[]> => {
      const { data, error } = await db
        .from("task_instances")
        .select(INSTANCE_COLUMNS)
        .eq("assigned_to_user_id", userId)
        .gte("due_date", from)
        .lte("due_date", to)
        .order("due_date", { ascending: false })
        .order("title");
      if (error) {
        console.error("task_instances read failed", error);
        return [];
      }
      return (data ?? []) as LinkedTaskInstance[];
    },
  });
}

/**
 * Head goals from the last 30 days, for the "link a goal" picker. Pre-migration
 * the project_id column is missing → pending.
 */
export function useLinkableGoals(enabled: boolean) {
  return useQuery({
    queryKey: ["linkable-head-goals"],
    enabled,
    queryFn: async () => {
      const today = todayInLondon();
      return withMigrationGuard<LinkedGoal[]>(
        () =>
          db
            .from("department_head_goals")
            .select(GOAL_COLUMNS)
            .gte("period_start", shiftDate(today, -30))
            .order("period_start", { ascending: false })
            .order("created_at", { ascending: true }),
        [],
      );
    },
  });
}

/**
 * Task templates for the "link a task" picker, with their current project.
 * Pre-migration the project_id column is missing → pending.
 */
export function useLinkableTasks(enabled: boolean) {
  return useQuery({
    queryKey: ["linkable-task-templates"],
    enabled,
    queryFn: async () =>
      withMigrationGuard<LinkedTask[]>(
        () =>
          db
            .from("tasks")
            .select(TASK_COLUMNS)
            .eq("is_template", true)
            .eq("active", true)
            .order("title"),
        [],
      ),
  });
}

/* ------------------------------------------------------------------ */
/*                               Writes                                */
/* ------------------------------------------------------------------ */

export interface SaveProjectInput {
  id?: string;
  title: string;
  description: string | null;
  department: string | null;
  status: ProjectStatus;
  target_date: string | null;
  members: MemberInput[];
}

const writeError = (e: unknown, fallback: string) => {
  console.error(e);
  if (isMissingSchemaError(e)) {
    toast.warning(PROJECTS_MIGRATION_NOTICE);
    return;
  }
  const msg = (e as { message?: string } | null)?.message;
  toast.error(msg ? `${fallback} — ${msg}` : fallback);
};

/**
 * Tasks inline on the Projects board (Marcus, 16 Sep): a task IS a
 * department_head_goals row with project_id set — no separate concept, no
 * link/unlink step. Add one straight onto a project, tick it off in place.
 * Writes invalidate both the Projects keys and the head-goals card's keys,
 * because the same rows show in both places.
 */
export function useProjectTaskMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: PROJECTS_OVERVIEW_KEY });
    qc.invalidateQueries({ queryKey: ["project"] });
    qc.invalidateQueries({ queryKey: ["department-head-goals"] });
    qc.invalidateQueries({ queryKey: ["department-head-goals-week"] });
    qc.invalidateQueries({ queryKey: ["linkable-head-goals"] });
  };

  const addTask = useMutation({
    mutationFn: async (input: { projectId: string; ownerId: string; department: string; label: string }) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await db.from("department_head_goals").insert({
        subject_user_id: input.ownerId,
        department: input.department,
        period_type: "daily",
        period_start: todayInLondon(),
        goal_type: "custom",
        goal_label: input.label.trim(),
        target_value: null,
        project_id: input.projectId,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task added");
      invalidate();
    },
    onError: (e) => writeError(e, "Could not add task"),
  });

  const markTask = useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome: "hit" | "missed" | "exceeded" | null }) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await db
        .from("department_head_goals")
        .update({
          outcome,
          miss_reason: null,
          outcome_marked_by: outcome ? user.id : null,
          outcome_marked_at: outcome ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e) => writeError(e, "Could not mark task"),
  });

  return { addTask, markTask };
}

export function useProjectMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const invalidate = (projectId?: string) => {
    qc.invalidateQueries({ queryKey: PROJECTS_OVERVIEW_KEY });
    qc.invalidateQueries({ queryKey: PROJECT_OPTIONS_KEY });
    if (projectId) qc.invalidateQueries({ queryKey: projectDetailKey(projectId) });
    else qc.invalidateQueries({ queryKey: ["project"] });
  };

  const syncMembers = async (projectId: string, members: MemberInput[]) => {
    const { data: existing, error: readErr } = await db
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);
    if (readErr) throw readErr;
    const keep = new Set(members.map((m) => m.user_id));
    const toRemove = ((existing ?? []) as { user_id: string }[])
      .map((r) => r.user_id)
      .filter((uid) => !keep.has(uid));
    if (toRemove.length > 0) {
      const { error } = await db
        .from("project_members")
        .delete()
        .eq("project_id", projectId)
        .in("user_id", toRemove);
      if (error) throw error;
    }
    if (members.length > 0) {
      const { error } = await db.from("project_members").upsert(
        members.map((m) => ({
          project_id: projectId,
          user_id: m.user_id,
          is_lead: m.is_lead,
          added_by: user?.id ?? null,
        })),
        { onConflict: "project_id,user_id" },
      );
      if (error) throw error;
    }
  };

  const saveProject = useMutation({
    mutationFn: async (input: SaveProjectInput): Promise<string> => {
      if (!user?.id) throw new Error("Not signed in");
      const fields = {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        department: input.department || null,
        status: input.status,
        target_date: input.target_date || null,
        progress_pct: statusMeta(input.status).pct,
      };
      let projectId = input.id;
      if (projectId) {
        const { error } = await db.from("projects").update(fields).eq("id", projectId);
        if (error) throw error;
      } else {
        const { data, error } = await db
          .from("projects")
          .insert({ ...fields, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        projectId = (data as { id: string }).id;
      }
      await syncMembers(projectId!, input.members);
      return projectId!;
    },
    onSuccess: (projectId, input) => {
      toast.success(input.id ? "Project updated" : "Project created");
      invalidate(projectId);
    },
    onError: (e) => writeError(e, "Could not save project"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProjectStatus }) => {
      const { error } = await db
        .from("projects")
        .update({ status, progress_pct: statusMeta(status).pct })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidate(v.id),
    onError: (e) => writeError(e, "Could not change status"),
  });

  const archiveProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("projects")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      toast.success("Project archived");
      invalidate(id);
    },
    onError: (e) => writeError(e, "Could not archive project"),
  });

  // Hard delete (the owner, 14 Sep). project_members and project_updates cascade
  // via FK; tasks.project_id and department_head_goals.project_id are ON
  // DELETE SET NULL, so linked work is kept and merely unlinked. RLS:
  // "Projects delete by managers".
  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project deleted");
      invalidate();
      // Goals and tasks that pointed at it now read project_id = null.
      qc.invalidateQueries({ queryKey: ["department-head-goals"] });
      qc.invalidateQueries({ queryKey: ["linkable-head-goals"] });
      qc.invalidateQueries({ queryKey: ["linkable-task-templates"] });
      qc.invalidateQueries({ queryKey: ["task-templates"] });
    },
    onError: (e) => writeError(e, "Could not delete project"),
  });

  const saveDailyUpdate = useMutation({
    mutationFn: async (input: {
      project_id: string;
      update_date: string;
      done_text: string;
      remaining_text: string;
      blocker_text: string;
    }) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await db.from("project_updates").upsert(
        {
          project_id: input.project_id,
          update_date: input.update_date,
          done_text: input.done_text.trim() || null,
          remaining_text: input.remaining_text.trim() || null,
          blocker_text: input.blocker_text.trim() || null,
          author_id: user.id,
        },
        { onConflict: "project_id,update_date" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success("Daily log saved");
      invalidate(v.project_id);
    },
    onError: (e) => writeError(e, "Could not save the daily log"),
  });

  const setTaskProject = useMutation({
    mutationFn: async ({ taskId, projectId }: { taskId: string; projectId: string | null }) => {
      const { error } = await db.from("tasks").update({ project_id: projectId }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["linkable-task-templates"] });
      qc.invalidateQueries({ queryKey: ["task-templates"] });
    },
    onError: (e) => writeError(e, "Could not link task"),
  });

  const setGoalProject = useMutation({
    mutationFn: async ({ goalId, projectId }: { goalId: string; projectId: string | null }) => {
      const { error } = await db
        .from("department_head_goals")
        .update({ project_id: projectId })
        .eq("id", goalId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["linkable-head-goals"] });
      qc.invalidateQueries({ queryKey: ["department-head-goals"] });
    },
    onError: (e) => writeError(e, "Could not link goal"),
  });

  return {
    saveProject,
    setStatus,
    archiveProject,
    deleteProject,
    saveDailyUpdate,
    setTaskProject,
    setGoalProject,
  };
}
