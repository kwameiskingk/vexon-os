// Is this account restricted to the onboarding surface?
//
// Same mechanism as profiles.must_change_password (20260811120000): one
// boolean on profiles, read once, enforced app-wide. Set when the TA starts
// someone's onboarding, cleared when she ends it — at which point the
// account becomes a normal role portal.
//
// Tolerates M6 being unapplied: a missing column reads as "not restricted",
// so no existing account is ever locked out by shipping this early.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isMissingSchemaError } from "@/lib/migrationGuard";

export const ONBOARDING_ROUTE = "/onboarding";

export function useOnboardingMode() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["onboarding-mode", user?.id],
    enabled: !!user?.id,
    staleTime: Infinity,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("in_onboarding_mode")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) {
        // Pre-M6 the column doesn't exist — nobody is restricted.
        if (isMissingSchemaError(error)) return false;
        throw error;
      }
      return (data as { in_onboarding_mode?: boolean } | null)?.in_onboarding_mode ?? false;
    },
  });

  return {
    inOnboardingMode: query.data === true,
    // Treat "still loading" as unknown so no route flashes before the answer.
    isLoading: !!user?.id && query.isLoading,
  };
}
