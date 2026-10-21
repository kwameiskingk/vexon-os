// "N new since you last checked" for the Ops Command Candidates tab.
// Last-seen is a per-user localStorage timestamp (no repo-wide convention
// exists; per-browser limitation accepted by ruling 2026-08-07 — if
// cross-device ever matters this hook is the only thing that changes).
// First-ever visit stores nothing yet, so the badge shows 0 rather than
// counting the entire backfill as "new".

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const NEW_CANDIDATES_QUERY_KEY = ["cv-screenings-new-count"] as const;

const lastSeenKey = (userId: string) => `cv-candidates-last-seen:${userId}`;

export function markCandidatesSeen(userId: string) {
  localStorage.setItem(lastSeenKey(userId), new Date().toISOString());
}

export function useNewCandidatesCount(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...NEW_CANDIDATES_QUERY_KEY, userId],
    enabled: enabled && !!userId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<number> => {
      const lastSeen = localStorage.getItem(lastSeenKey(userId!));
      if (!lastSeen) return 0;
      const { count, error } = await supabase
        .from("cv_screenings")
        .select("id", { count: "exact", head: true })
        .eq("is_archived", false)
        .gt("created_at", lastSeen);
      if (error) {
        console.error("cv-screenings new-count read failed", error);
        return 0;
      }
      return count ?? 0;
    },
  });
}
