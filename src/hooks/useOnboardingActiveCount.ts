import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Number of clients currently in active onboarding (not completed, not
 * soft-removed). Feeds the Onboarding sidebar badge. Filtered client-side
 * to match the kanban's definition of an active card.
 */
export function useOnboardingActiveCount(enabled: boolean) {
  return useQuery({
    queryKey: ["onboarding-active-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_onboarding_stages" as any)
        .select("id, completed_at, removed_at");
      if (error) throw error;
      return ((data || []) as any[]).filter((s) => !s.completed_at && !s.removed_at).length;
    },
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}
