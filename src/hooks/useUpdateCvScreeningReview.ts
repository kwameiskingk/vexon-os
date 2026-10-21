import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CV_SCREENINGS_QUERY_KEY } from "./useCvScreenings";

interface ReviewUpdate {
  id: string;
  review_status: string | null;
  ops_notes: string | null;
}

export function useUpdateCvScreeningReview() {
  const queryClient = useQueryClient();
  return useMutation({
    // Human-owned columns ONLY. Never widen this payload: every other
    // cv_screenings column belongs to the screening agent, and the agent's
    // upsert path in turn never writes these two.
    mutationFn: async ({ id, review_status, ops_notes }: ReviewUpdate) => {
      const { error } = await supabase
        .from("cv_screenings")
        .update({ review_status, ops_notes })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CV_SCREENINGS_QUERY_KEY });
    },
  });
}
