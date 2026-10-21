// Final-interview answers + the offer hand-off flag (Run 2).
//
// Answers live in candidate_final_interviews.answers (jsonb keyed by
// qualification_criteria.question_key for framework 'final_interview'), so
// the CEO's question set is table-driven and editable without a deploy. The
// hand-off flag is candidates.offer_handoff_at — set by the CEO's "Pass on",
// cleared on the move to Offer.
//
// Everything is guarded (migrationGuard) against the pending migration
// docs/pending-migrations/2026-08-18-final-interview-and-offer-handoff.sql:
// surfaces render a notice instead of crashing until it is run.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withMigrationGuard } from "@/lib/migrationGuard";
import { HIRING_PIPELINE_QUERY_KEY } from "./useHiringPipeline";

export const FINAL_INTERVIEW_SCHEMA_QUERY_KEY = ["final-interview-schema"] as const;
export const FINAL_INTERVIEW_QUERY_KEY = ["final-interview"] as const;
export const OFFER_HANDOFF_QUERY_KEY = ["offer-handoffs"] as const;

export type FinalInterviewAnswers = Record<string, boolean | string | number | null>;

export interface FinalInterviewRow {
  id: string;
  candidate_id: string;
  answers: FinalInterviewAnswers;
  notes: string | null;
}

/** Probe: has 2026-08-18-final-interview-and-offer-handoff.sql been run? */
export function useFinalInterviewSchema(): {
  tableReady: boolean;
  handoffReady: boolean;
  loading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: FINAL_INTERVIEW_SCHEMA_QUERY_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const table = await withMigrationGuard(
        () =>
          supabase
            .from("candidate_final_interviews" as never)
            .select("id")
            .limit(1) as never,
        [],
      );
      const column = await withMigrationGuard(
        () => supabase.from("candidates").select("offer_handoff_at" as "id").limit(1) as never,
        [],
      );
      return { tableReady: !table.migrationPending, handoffReady: !column.migrationPending };
    },
  });
  return {
    tableReady: data?.tableReady ?? false,
    handoffReady: data?.handoffReady ?? false,
    loading: isLoading,
  };
}

export function useFinalInterview(candidateId: string | null) {
  return useQuery({
    queryKey: [...FINAL_INTERVIEW_QUERY_KEY, candidateId ?? "none"],
    enabled: !!candidateId,
    queryFn: async (): Promise<FinalInterviewRow | null> => {
      const result = await withMigrationGuard<FinalInterviewRow[]>(
        () =>
          supabase
            .from("candidate_final_interviews" as never)
            .select("id, candidate_id, answers, notes")
            .eq("candidate_id", candidateId!)
            .limit(1) as never,
        [],
      );
      return result.data[0] ?? null;
    },
  });
}

export function useUpsertFinalInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      candidateId: string;
      answers: FinalInterviewAnswers;
      notes: string | null;
    }) => {
      const { error } = await supabase
        .from("candidate_final_interviews" as never)
        .upsert(
          {
            candidate_id: input.candidateId,
            answers: input.answers,
            notes: input.notes,
          } as never,
          { onConflict: "candidate_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, input) => {
      queryClient.invalidateQueries({
        queryKey: [...FINAL_INTERVIEW_QUERY_KEY, input.candidateId],
      });
    },
  });
}

/** Candidates the CEO has passed on: id -> offer_handoff_at. */
export function useOfferHandoffs() {
  return useQuery({
    queryKey: OFFER_HANDOFF_QUERY_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const result = await withMigrationGuard<{ id: string; offer_handoff_at: string }[]>(
        () =>
          supabase
            .from("candidates")
            .select("id, offer_handoff_at" as "id")
            .not("offer_handoff_at", "is", null) as never,
        [],
      );
      return new Map(result.data.map((r) => [r.id, r.offer_handoff_at]));
    },
  });
}

/** Set (Pass on) or clear the offer hand-off flag. */
export function useSetOfferHandoff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { candidateId: string; handedOff: boolean }) => {
      const { error } = await supabase
        .from("candidates")
        .update({
          offer_handoff_at: input.handedOff ? new Date().toISOString() : null,
        } as never)
        .eq("id", input.candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: OFFER_HANDOFF_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: HIRING_PIPELINE_QUERY_KEY });
    },
  });
}
