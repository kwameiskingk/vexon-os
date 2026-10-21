// Qualification criteria config (migration M5).
//
// The mechanism now, the values later: criteria are rows so the bar can be
// moved without a deploy. Seeded provisional (every row disabled, no
// operator), so an unconfigured framework scores nothing and the verdict
// reads "not configured".
//
// Tolerates M5 being unapplied — an empty criteria list is exactly the same
// as an unconfigured framework, so the modal still renders and simply
// advises nothing.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withMigrationGuard, type GuardedResult } from "@/lib/migrationGuard";
import type { QualificationCriterion } from "@/lib/phoneScreenQualification";

export const QUALIFICATION_CRITERIA_QUERY_KEY = ["qualification-criteria"] as const;

export function useQualificationCriteria(framework = "phone_screen") {
  return useQuery({
    queryKey: [...QUALIFICATION_CRITERIA_QUERY_KEY, framework],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<GuardedResult<QualificationCriterion[]>> =>
      withMigrationGuard<QualificationCriterion[]>(
        () =>
          supabase
            .from("qualification_criteria" as never)
            .select("*")
            .eq("framework", framework)
            .order("sort_order") as never,
        [],
      ),
  });
}

export type CriterionUpdate = Partial<
  Pick<
    QualificationCriterion,
    | "enabled"
    | "gate_type"
    | "operator"
    | "threshold_numeric"
    | "threshold_numeric_max"
    | "expected_boolean"
    | "expected_text"
    | "weight"
    | "rationale"
    // label is editable ONLY for the final-interview framework, where the
    // criteria rows ARE the questions the CEO sees. Phone-screen labels
    // mirror the hard-coded modal questions and must not drift.
    | "label"
  >
> & { id: string };

export function useUpdateQualificationCriterion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: CriterionUpdate) => {
      const { error } = await supabase
        .from("qualification_criteria" as never)
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUALIFICATION_CRITERIA_QUERY_KEY });
    },
  });
}
