// Data access for department_head_goals (migration 20260730060000) — the
// CEO's accountability log for department heads. Standalone concept: never
// read this from resolveTargets, RAG or review code.
//
// Pre-migration (or for viewers without RLS read) the query degrades to an
// empty list and writes surface an error toast — nothing crashes, matching
// the useSetterPeriodNotes house pattern. Table is newer than the generated
// types, so the `as any` cast pattern applies until types.ts is regenerated.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { isMissingSchemaError } from "@/lib/migrationGuard";
import type {
  DepartmentHeadGoal,
  GoalOutcome,
  GoalPeriodType,
  HeadDepartment,
} from "@/components/ceo/departmentHeadGoals";

// Goal dates are business dates in Europe/London (Marcus's clock), never the
// viewer's browser zone — a viewer abroad after UK midnight must still see the
// same "today" as the office. period_start is a plain date string, so all the
// arithmetic below anchors at local noon to dodge DST edges.
export const GOALS_TZ = "Europe/London";

const GOAL_COLUMNS =
  "id, subject_user_id, department, period_type, period_start, goal_type, goal_label, target_value, outcome, miss_reason, created_at";
const GOAL_COLUMNS_WITH_PROJECT = `${GOAL_COLUMNS}, project_id`;

/** Today's date (yyyy-MM-dd) in Europe/London. */
export const todayInLondon = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: GOALS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/** yyyy-MM-dd → Date at local noon (DST-safe for day arithmetic). */
export const dateAtNoon = (iso: string): Date => new Date(`${iso}T12:00:00`);

/** yyyy-MM-dd shifted by N days. */
export const shiftDate = (iso: string, days: number): string =>
  format(addDays(dateAtNoon(iso), days), "yyyy-MM-dd");

/** Monday (yyyy-MM-dd) of the week containing the given date. */
export const mondayOf = (iso: string): string =>
  format(startOfWeek(dateAtNoon(iso), { weekStartsOn: 1 }), "yyyy-MM-dd");

/** period_start for a period type anchored on a chosen day: that day (daily)
 * or the Monday of its week (weekly). */
export const periodStartFor = (periodType: GoalPeriodType, anchor: string): string =>
  periodType === "daily" ? anchor : mondayOf(anchor);

/** period_start for a period type: today (daily) or Monday of this week (weekly), London time. */
export const currentPeriodStart = (periodType: GoalPeriodType): string =>
  periodStartFor(periodType, todayInLondon());

/**
 * Daily goals for the current week's weekdays (Mon–Fri), feeding the streak
 * strip. Weekly goals carry their outcome on the goal row itself — a weekly
 * outcome has no single day to colour, so the strip is daily-only.
 */
export function useDepartmentHeadWeekOutcomes(weekStart: string) {
  return useQuery({
    queryKey: ["department-head-goals-week", weekStart],
    queryFn: async (): Promise<DepartmentHeadGoal[]> => {
      const friday = shiftDate(weekStart, 4);
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("department_head_goals" as any)
        .select(GOAL_COLUMNS)
        .eq("period_type", "daily")
        .gte("period_start", weekStart)
        .lte("period_start", friday);
      if (error) {
        console.error("department_head_goals week read failed", error);
        return [];
      }
      return (data || []) as unknown as DepartmentHeadGoal[];
    },
  });
}

export interface NewHeadGoal {
  subject_user_id: string;
  department: HeadDepartment;
  period_type: GoalPeriodType;
  period_start: string;
  goal_type: string;
  goal_label: string | null;
  target_value: number | null;
  /** Leave the key out entirely pre-migration (column missing → insert fails). */
  project_id?: string | null;
}

export function useDepartmentHeadGoals(periodType: GoalPeriodType, periodStart: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const goalsQuery = useQuery({
    queryKey: ["department-head-goals", periodType, periodStart],
    queryFn: async (): Promise<DepartmentHeadGoal[]> => {
      const read = (columns: string) =>
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("department_head_goals" as any)
          .select(columns)
          .eq("period_type", periodType)
          .eq("period_start", periodStart)
          .order("created_at", { ascending: true });
      let { data, error } = await read(GOAL_COLUMNS_WITH_PROJECT);
      // project_id arrived with the Projects migration (20260913150000).
      // Before it runs the column is missing, so retry without it — the
      // card must keep working exactly as it did.
      if (error && isMissingSchemaError(error)) ({ data, error } = await read(GOAL_COLUMNS));
      if (error) {
        // Pre-migration the table doesn't exist — degrade to an empty card.
        console.error("department_head_goals read failed", error);
        return [];
      }
      return (data || []) as unknown as DepartmentHeadGoal[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["department-head-goals"] });
    queryClient.invalidateQueries({ queryKey: ["department-head-goals-week"] });
    // Projects tab reads linked goals too (src/hooks/useProjects.ts: the
    // overview tiles, each project's "Linked head goals" and the link
    // picker). Keys are spelled out here rather than imported so the two
    // hooks don't import each other.
    queryClient.invalidateQueries({ queryKey: ["projects-overview"] });
    queryClient.invalidateQueries({ queryKey: ["project"] });
    queryClient.invalidateQueries({ queryKey: ["linkable-head-goals"] });
  };

  const addGoal = useMutation({
    mutationFn: async (goal: NewHeadGoal) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("department_head_goals" as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ ...goal, created_by: user.id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Goal saved");
      invalidate();
    },
    onError: (e: Error) => {
      console.error(e);
      toast.error(`Could not save goal${e.message ? ` — ${e.message}` : ""}`);
    },
  });

  const updateGoal = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<
      Pick<DepartmentHeadGoal, "goal_type" | "goal_label" | "target_value" | "project_id">
    >) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("department_head_goals" as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Goal updated");
      invalidate();
    },
    onError: (e: Error) => {
      console.error(e);
      toast.error("Could not update goal");
    },
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("department_head_goals" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Goal removed");
      invalidate();
    },
    onError: (e: Error) => {
      console.error(e);
      toast.error("Could not remove goal");
    },
  });

  const markOutcome = useMutation({
    mutationFn: async ({
      id,
      outcome,
      missReason,
    }: {
      id: string;
      outcome: GoalOutcome;
      missReason?: string;
    }) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("department_head_goals" as any)
        .update({
          outcome,
          miss_reason: outcome === "missed" ? (missReason ?? null) : null,
          outcome_marked_by: user.id,
          outcome_marked_at: new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Outcome marked");
      invalidate();
    },
    onError: (e: Error) => {
      console.error(e);
      toast.error("Could not mark outcome");
    },
  });

  return { goalsQuery, addGoal, updateGoal, deleteGoal, markOutcome };
}
