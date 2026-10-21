// CV screening agent output for the Ops Command Candidates tab and the TA
// portal's Call List.
// One fetch of the whole table (254 backfill rows + ~70/agent run) — tabs,
// counts, search, and filters are all client-side derivations, matching the
// house full-roster-select norm. Archived rows are excluded at the query so
// a future archive action needs no query changes.
//
// Ordered newest-ingested-first (created_at is the row's ingestion moment,
// for agent runs and CSV imports alike) — 17 Aug ruling: new candidates go
// to the top of the list, replacing the old score-first sort.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CvScreening = Database["public"]["Tables"]["cv_screenings"]["Row"];

export const CV_SCREENINGS_QUERY_KEY = ["cv-screenings"] as const;

export function useCvScreenings() {
  return useQuery({
    queryKey: CV_SCREENINGS_QUERY_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<CvScreening[]> => {
      const { data, error } = await supabase
        .from("cv_screenings")
        .select("*")
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}
