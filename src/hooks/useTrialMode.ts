// Is this account restricted to the trialist surface?
//
// Trial Day (15 Sep 2026): the twin of useOnboardingMode. One boolean on
// profiles (in_trial_mode), read once, enforced app-wide by ProtectedRoute.
// Set by create-user when Elena makes a trialist login; cleared by
// end_trial_access or trialist_to_onboarding. Tolerates the migration being
// unapplied: a missing column reads as "not restricted".

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isMissingSchemaError } from "@/lib/migrationGuard";

export const TRIAL_ROUTE = "/trial";

export function useTrialMode() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["trial-mode", user?.id],
    enabled: !!user?.id,
    staleTime: Infinity,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("in_trial_mode" as never)
        .eq("id", user!.id)
        .maybeSingle();
      if (error) {
        if (isMissingSchemaError(error)) return false;
        throw error;
      }
      return (data as { in_trial_mode?: boolean } | null)?.in_trial_mode ?? false;
    },
  });

  return {
    inTrialMode: query.data === true,
    isLoading: !!user?.id && query.isLoading,
  };
}
