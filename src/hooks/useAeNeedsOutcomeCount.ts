// Count of acquisition meetings assigned to the logged-in AE that still
// need an outcome (past or today, not finalized, no discovery log). Feeds
// the sidebar badge on "Discovery Calls" so Rory/Oliver see the backlog
// before opening the tab. Mirrors AEDiscoveryCalls' needs-outcome filter.

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const FINAL_STATUSES = new Set(["sat", "no_show", "cancelled", "rescheduled"]);

/**
 * The Needs Outcome banner only renders when the AE's outstanding count is
 * STRICTLY ABOVE this. Below it the banner hides entirely (no permanent wall
 * of history once caught up) — the sidebar badge always shows the true count
 * regardless. Single knob, shared by any future overdue buckets.
 */
export const NEEDS_OUTCOME_BANNER_THRESHOLD = 5;

export function useAeNeedsOutcomeCount(
  userId: string | undefined,
  enabled: boolean,
  /** Admin tier counts the WHOLE acquisition book (mine + unassigned +
      departed AEs' meetings) — the badge must agree with what
      AEDiscoveryCalls shows an admin (they diverged, 2 Sep). */
  adminTier = false,
) {
  return useQuery({
    queryKey: ["ae-needs-outcome-count", userId, adminTier],
    enabled: enabled && !!userId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<number> => {
      const today = format(new Date(), "yyyy-MM-dd");
      let query = supabase
        .from("meetings")
        .select("id, attendance_status, status")
        .eq("department", "acquisition");
      if (!adminTier) query = query.eq("assigned_ae_id", userId!);
      const { data: rows, error } = await query.lte("meeting_date", today);
      if (error) {
        console.error("ae-needs-outcome-count read failed", error);
        return 0;
      }
      const open = (rows || []).filter((m) => {
        const s = (m.attendance_status || m.status || null) as string | null;
        return !s || !FINAL_STATUSES.has(s);
      });
      if (open.length === 0) return 0;
      // A meeting with a discovery log counts as actioned even if the
      // meetings row wasn't finalized (matches the page's filter).
      const { data: logs, error: logErr } = await supabase
        .from("sales_discovery_logs")
        .select("meeting_id")
        .in("meeting_id", open.map((m) => m.id));
      if (logErr) {
        console.error("ae-needs-outcome-count log read failed", logErr);
        return open.length;
      }
      const logged = new Set((logs || []).map((l) => l.meeting_id));
      return open.filter((m) => !logged.has(m.id)).length;
    },
  });
}
