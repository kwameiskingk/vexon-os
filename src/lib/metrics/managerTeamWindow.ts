// Manager team-window numbers — extracted from useSdrManagerReview (2026-08-06,
// team-tiles session) so the dashboard strip and the review engine share ONE
// implementation. Semantics unchanged from the review compile layer:
// - roster = CURRENTLY-assigned, genuine, non-test, active setters
// - booked = meetings created_at window, is_rebook=false, profile OR logged_by
//   identity merged unique by meeting id (the R3 rule)
// - sat = meeting_date window + isMeetingSat
// - dials/talk = setter_close_metrics totals; per-setter averages divide by
//   attendance setter-days (never a calendar fallback)
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchManagedSetterProfileIds } from "@/lib/managedRoster";
import {
  computeSitRatePct,
  daysWorkedFromAttendance,
  isMeetingSat,
  safeRatio,
  type AttendanceStatusRow,
} from "@/lib/metrics/setterMetrics";
import { filterToSetterRoleIds } from "@/lib/setterRoleFilter";

const db: SupabaseClient = supabase;

export interface TeamSetter {
  profileId: string;
  userId: string;
  closeUserId: string | null;
}

export interface WindowNumbers {
  coachingCompleted: number;
  booked: number;
  sat: number;
  satRatePct: number | null;
  avgDialsPerSetterDay: number | null;
  avgTalkMinutesPerSetterDay: number | null;
  avgBookedPerSetterWeek: number | null;
  /** Window totals (added for the dashboard tiles; averages above unchanged). */
  totalDials: number;
  totalTalkSeconds: number;
}

export type ManagerTeamDepartment = "fulfilment" | "acquisition";

/** Every meetings / setter_close_metrics row must match the requested
 *  department. Legacy rows with a NULL department keep counting (they all
 *  predate the multi-department model, so a single-department manager's
 *  numbers stay byte-identical); a row stamped with the OTHER department is
 *  excluded — the cross-department merge guard. */
const departmentPredicate = (department: ManagerTeamDepartment) =>
  `department.eq.${department},department.is.null`;

/** Current roster: assignments → genuine, non-test, active setters of the
 *  requested DEPARTMENT only (the cross-setter aggregation rule from the
 *  review compile layer). The department parameter is required by design:
 *  a dual-department manager's assignments span both departments, and an
 *  unscoped roster would silently merge their numbers downstream. */
export async function fetchManagerTeam(
  managerUserId: string,
  department: ManagerTeamDepartment,
): Promise<TeamSetter[]> {
  // Assignments, or the whole-department roster for acting admins (2 Sep).
  const profileIds = await fetchManagedSetterProfileIds(managerUserId);
  if (profileIds.length === 0) return [];

  const { data: setterRows } = await supabase
    .from("setters_profiles")
    .select("id, user_id, close_user_id, active, is_test_account")
    .in("id", profileIds)
    .eq("department", department)
    .eq("active", true)
    .eq("is_test_account", false);
  const candidates = (setterRows ?? []).filter((s) => s.user_id);
  const setterRoleIds = await filterToSetterRoleIds(candidates.map((s) => s.user_id as string));
  return candidates
    .filter((s) => setterRoleIds.has(s.user_id as string))
    .map((s) => ({
      profileId: String(s.id),
      userId: String(s.user_id),
      closeUserId: s.close_user_id ?? null,
    }));
}

export async function fetchWindowNumbers(
  managerUserId: string,
  team: TeamSetter[],
  startISO: string,
  endISO: string,
  department: ManagerTeamDepartment,
): Promise<WindowNumbers> {
  const profileIds = team.map((t) => t.profileId);
  const userIds = team.map((t) => t.userId);
  const closeIds = team.map((t) => t.closeUserId).filter(Boolean) as string[];

  const [coachingRes, bookedByProfile, bookedByLogger, satByProfile, satByLogger, closeRes, attendanceRes] =
    await Promise.all([
      db
        .from("coaching_sessions")
        .select("id")
        .eq("manager_user_id", managerUserId)
        .eq("status", "completed")
        .gte("session_date", startISO)
        .lte("session_date", endISO),
      profileIds.length
        ? supabase
            .from("meetings")
            .select("id, setter_profile_id, logged_by_setter_id, attendance_status, attendance_confirmed, created_at, meeting_date")
            .in("setter_profile_id", profileIds)
            .or(departmentPredicate(department))
            .eq("is_rebook", false)
            .gte("created_at", `${startISO}T00:00:00`)
            .lte("created_at", `${endISO}T23:59:59`)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? supabase
            .from("meetings")
            .select("id, setter_profile_id, logged_by_setter_id, attendance_status, attendance_confirmed, created_at, meeting_date")
            .in("logged_by_setter_id", userIds)
            .or(departmentPredicate(department))
            .eq("is_rebook", false)
            .gte("created_at", `${startISO}T00:00:00`)
            .lte("created_at", `${endISO}T23:59:59`)
        : Promise.resolve({ data: [] }),
      profileIds.length
        ? supabase
            .from("meetings")
            .select("id, setter_profile_id, logged_by_setter_id, attendance_status, attendance_confirmed, meeting_date")
            .in("setter_profile_id", profileIds)
            .or(departmentPredicate(department))
            .eq("is_rebook", false)
            .gte("meeting_date", startISO)
            .lte("meeting_date", endISO)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? supabase
            .from("meetings")
            .select("id, setter_profile_id, logged_by_setter_id, attendance_status, attendance_confirmed, meeting_date")
            .in("logged_by_setter_id", userIds)
            .or(departmentPredicate(department))
            .eq("is_rebook", false)
            .gte("meeting_date", startISO)
            .lte("meeting_date", endISO)
        : Promise.resolve({ data: [] }),
      closeIds.length
        ? db
            .from("setter_close_metrics")
            .select("dials, talk_time_seconds")
            .in("close_user_id", closeIds)
            .or(departmentPredicate(department))
            .gte("date", startISO)
            .lte("date", endISO)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? supabase
            .from("employee_attendance")
            .select("date, status")
            .in("employee_id", userIds)
            .gte("date", startISO)
            .lte("date", endISO)
        : Promise.resolve({ data: [] }),
    ]);

  // Booked: SSOT identity — setter_profile_id OR logged_by_setter_id, merged
  // unique by meeting id (the R3 rule).
  const bookedRows = new Map<string, { id: string }>();
  for (const m of [...((bookedByProfile.data ?? []) as { id: string }[]), ...((bookedByLogger.data ?? []) as { id: string }[])]) {
    bookedRows.set(String(m.id), m);
  }
  const satRows = new Map<
    string,
    { id: string; attendance_status?: string | null; attendance_confirmed?: boolean | null }
  >();
  for (const m of [
    ...((satByProfile.data ?? []) as { id: string; attendance_status?: string | null; attendance_confirmed?: boolean | null }[]),
    ...((satByLogger.data ?? []) as { id: string; attendance_status?: string | null; attendance_confirmed?: boolean | null }[]),
  ]) {
    satRows.set(String(m.id), m);
  }

  const booked = bookedRows.size;
  const sat = [...satRows.values()].filter((m) => isMeetingSat(m)).length;

  const totalDials = ((closeRes.data ?? []) as { dials: number | null }[]).reduce(
    (sum, r) => sum + (Number(r.dials) || 0),
    0,
  );
  const totalTalkSeconds = ((closeRes.data ?? []) as { talk_time_seconds: number | null }[]).reduce(
    (sum, r) => sum + (Number(r.talk_time_seconds) || 0),
    0,
  );

  // Setter-days: attendance day-values summed across the whole team.
  const setterDays = daysWorkedFromAttendance(
    ((attendanceRes.data ?? []) as AttendanceStatusRow[]) || [],
  );

  const windowDays =
    Math.round(
      (new Date(`${endISO}T00:00:00`).getTime() - new Date(`${startISO}T00:00:00`).getTime()) /
        86_400_000,
    ) + 1;
  const weeks = windowDays / 7;

  const hasCloseData = closeIds.length > 0 && setterDays > 0;

  return {
    coachingCompleted: (coachingRes.data ?? []).length,
    booked,
    sat,
    satRatePct: computeSitRatePct(sat, booked),
    avgDialsPerSetterDay: hasCloseData ? safeRatio(totalDials, setterDays) : null,
    avgTalkMinutesPerSetterDay: hasCloseData ? safeRatio(totalTalkSeconds / 60, setterDays) : null,
    avgBookedPerSetterWeek: team.length > 0 ? safeRatio(booked, team.length * weeks) : null,
    totalDials,
    totalTalkSeconds,
  };
}
