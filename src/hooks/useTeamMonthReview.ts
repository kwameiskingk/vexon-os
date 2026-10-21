// Batched team month numbers for the Performance Review team table — the
// whole department in ONE Promise.all of .in() queries (the
// useSdrManagerReview.fetchWindowNumbers batching pattern), NOT N×
// compileSetterReviewMetrics (12+ round-trips per setter). Rules match the
// SSOT/review engine: booked = created_at-windowed meetings, strict
// is_rebook=false, owner = setter_profile_id OR logged_by_setter_id; sat =
// meeting_date-windowed + isMeetingSat; days worked = attendance-based;
// convos = manual_daily_metrics wins per day, Close connects fill uncovered
// days (aggregateSetterActivity's merge), with a verified flag for display.
// Cross-setter aggregation gate re-applied per useSetterReview's warning:
// active, non-test, genuine setter role only.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { daysWorkedFromAttendance, isMeetingSat } from "@/lib/metrics/setterMetrics";
import { filterToSetterRoleIds } from "@/lib/setterRoleFilter";
import type { TeamMetricsRow } from "@/components/sdr-manager/TeamMetricsTable";
import { fetchReviewOverrides, isCalendarMonthWindow } from "@/hooks/useSetterReviewOverrides";

export function useTeamMonthReview(
  department: "fulfilment" | "acquisition" | Array<"fulfilment" | "acquisition">,
  monthStartISO: string,
  monthEndISO: string,
  enabled = true,
  includeInactive = false,
) {
  // Person-level table (one row per setter, nothing summed) — a
  // dual-department manager passes both departments and gets the union.
  // includeInactive adds FORMER setters, so leavers who contributed to the
  // month appear as rows with their days worked / dials / talk / booked /
  // sat intact.
  const departments = Array.isArray(department) ? department : [department];
  return useQuery({
    enabled,
    queryKey: ["team-month-review", departments.join(","), monthStartISO, monthEndISO, includeInactive],
    queryFn: async (): Promise<TeamMetricsRow[]> => {
      let profilesQuery = supabase
        .from("setters_profiles")
        .select("id, user_id, full_name, email, close_user_id, active")
        .in("department", departments)
        .eq("is_test_account", false)
        .order("full_name");
      if (!includeInactive) profilesQuery = profilesQuery.eq("active", true);
      const { data: profiles, error } = await profilesQuery;
      if (error) throw error;
      const candidates = (profiles || []).filter((p) => p.user_id);
      const setterIds = await filterToSetterRoleIds(candidates.map((p) => p.user_id));
      const roster = candidates.filter((p) => setterIds.has(p.user_id as string));
      if (!roster.length) return [];

      const profileIds = roster.map((p) => p.id);
      const userIds = roster.map((p) => p.user_id as string);
      const closeIds = roster.map((p) => p.close_user_id).filter(Boolean) as string[];

      // Manual adjustments (setter_review_metric_overrides) apply to the
      // review surface only — this table sits one tab from the individual
      // review, so both must agree. Calendar-month windows only.
      const overrides = isCalendarMonthWindow(monthStartISO, monthEndISO)
        ? await fetchReviewOverrides(profileIds, monthStartISO)
        : new Map<string, never>();

      const [closeRes, bookedRes, satRes, manualRes, attendanceRes, reviewsRes] = await Promise.all([
        closeIds.length
          ? supabase
              .from("setter_close_metrics")
              .select("close_user_id, date, dials, talk_time_seconds, connects")
              .in("close_user_id", closeIds)
              .gte("date", monthStartISO)
              .lte("date", monthEndISO)
          : Promise.resolve({ data: [] }),
        supabase
          .from("meetings")
          .select("setter_profile_id, logged_by_setter_id, created_at")
          .eq("is_rebook", false)
          .or(
            `setter_profile_id.in.(${profileIds.join(",")}),logged_by_setter_id.in.(${userIds.join(",")})`,
          )
          .gte("created_at", `${monthStartISO}T00:00:00`)
          .lte("created_at", `${monthEndISO}T23:59:59`),
        supabase
          .from("meetings")
          .select("setter_profile_id, logged_by_setter_id, attendance_confirmed, attendance_status")
          .eq("is_rebook", false)
          .or(
            `setter_profile_id.in.(${profileIds.join(",")}),logged_by_setter_id.in.(${userIds.join(",")})`,
          )
          .gte("meeting_date", monthStartISO)
          .lte("meeting_date", monthEndISO),
        supabase
          .from("manual_daily_metrics")
          .select("target_user_id, date, conversations")
          .in("department", departments)
          .eq("target_role", "setter")
          .in("target_user_id", userIds)
          .gte("date", monthStartISO)
          .lte("date", monthEndISO),
        supabase
          .from("employee_attendance")
          .select("employee_id, status")
          .in("employee_id", userIds)
          .gte("date", monthStartISO)
          .lte("date", monthEndISO),
        // Completed call reviews per setter (Marcus's 2 Sep reporting ask:
        // "how many call reviews has this setter sat" beside meetings booked,
        // weekly and monthly — this window is whatever the caller passes).
        supabase
          .from("coaching_sessions")
          .select("setter_profile_id, session_type")
          .in("setter_profile_id", profileIds)
          .eq("session_type", "call_review")
          .eq("status", "completed")
          .gte("session_date", monthStartISO)
          .lte("session_date", monthEndISO),
      ]);

      const countMine = (
        rows: Array<{ setter_profile_id: string | null; logged_by_setter_id: string | null }>,
        profileId: string,
        userId: string,
      ) =>
        rows.filter((m) => m.setter_profile_id === profileId || m.logged_by_setter_id === userId)
          .length;

      const bookedRows = bookedRes.data || [];
      const satRows = (satRes.data || []).filter((m) => isMeetingSat(m));

      const closeByUser = new Map<string, Array<{ date: string; dials: number; talk: number; connects: number }>>();
      for (const r of closeRes.data || []) {
        const list = closeByUser.get(r.close_user_id) ?? [];
        list.push({
          date: r.date,
          dials: Number(r.dials) || 0,
          talk: Number(r.talk_time_seconds) || 0,
          connects: Number(r.connects) || 0,
        });
        closeByUser.set(r.close_user_id, list);
      }

      const manualConvoDays = new Map<string, Map<string, number>>();
      for (const r of manualRes.data || []) {
        if (r.conversations == null) continue;
        const days = manualConvoDays.get(r.target_user_id) ?? new Map<string, number>();
        days.set(r.date, Number(r.conversations) || 0);
        manualConvoDays.set(r.target_user_id, days);
      }

      const reviewsByProfile = new Map<string, number>();
      for (const r of reviewsRes.data || []) {
        if (!r.setter_profile_id) continue;
        reviewsByProfile.set(r.setter_profile_id, (reviewsByProfile.get(r.setter_profile_id) ?? 0) + 1);
      }

      const attendanceByUser = new Map<string, Array<{ status: string }>>();
      for (const r of attendanceRes.data || []) {
        const list = attendanceByUser.get(r.employee_id) ?? [];
        list.push({ status: r.status });
        attendanceByUser.set(r.employee_id, list);
      }

      return roster.map((p) => {
        const closeRows = p.close_user_id ? closeByUser.get(p.close_user_id) ?? [] : [];
        const manualDays = manualConvoDays.get(p.user_id as string) ?? new Map<string, number>();
        let convos = 0;
        manualDays.forEach((v) => (convos += v));
        for (const c of closeRows) if (!manualDays.has(c.date)) convos += c.connects;
        return {
          profileId: p.id,
          name: `${p.full_name || p.email || "Unknown"}${p.active === false ? " · former" : ""}`,
          daysWorked: daysWorkedFromAttendance(attendanceByUser.get(p.user_id as string) ?? []),
          booked: overrides.get(p.id)?.meetings_booked ?? countMine(bookedRows, p.id, p.user_id as string),
          sat: overrides.get(p.id)?.meetings_sat ?? countMine(satRows, p.id, p.user_id as string),
          adjusted:
            overrides.get(p.id)?.meetings_booked != null || overrides.get(p.id)?.meetings_sat != null,
          callReviews: reviewsByProfile.get(p.id) ?? 0,
          dials: closeRows.reduce((s, c) => s + c.dials, 0),
          talkSeconds: closeRows.reduce((s, c) => s + c.talk, 0),
          convos,
          convosVerified: manualDays.size > 0,
        };
      });
    },
  });
}
