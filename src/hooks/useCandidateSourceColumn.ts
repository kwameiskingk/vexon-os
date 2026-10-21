// Probe: has the candidates.source migration been applied?
//
// The Call List's CSV import writes a per-row source that must survive into
// the pipeline (candidates.source, pending migration
// 2026-08-17-candidate-source.sql). Until that column exists the import is
// disabled with a notice — fail-soft, per the house migrationGuard pattern —
// and booking omits source from its payload so it never trips a missing
// column.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withMigrationGuard } from "@/lib/migrationGuard";

export const CANDIDATE_SOURCE_COLUMN_QUERY_KEY = ["candidate-source-column"] as const;

export function useCandidateSourceColumn(): { applied: boolean; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: CANDIDATE_SOURCE_COLUMN_QUERY_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      // Selecting the column is the probe: a pre-migration database answers
      // with undefined_column, which the guard maps to migrationPending.
      const result = await withMigrationGuard(
        () => supabase.from("candidates").select("source" as "id").limit(1) as never,
        [],
      );
      return !result.migrationPending;
    },
  });
  return { applied: data ?? false, loading: isLoading };
}
