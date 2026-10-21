import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns true if the current user must use the hourly form — either
 * because they are on a PIP (`setters_profiles.status === 'pip'`) or
 * because an admin enabled the per-setter `hourly_form_enabled` toggle
 * in the Employee Hub.
 */
export function useHourlyFormRequired() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["hourly-form-required", user?.id],
    queryFn: async () => {
      if (!user) return { required: false, isPip: false, manuallyEnabled: false };
      const { data } = await supabase
        .from("setters_profiles")
        .select("status, hourly_form_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      const isPip = data?.status === "pip";
      const manuallyEnabled = data?.hourly_form_enabled === true;
      return { required: isPip || manuallyEnabled, isPip, manuallyEnabled };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  return {
    required: !!data?.required,
    isPip: !!data?.isPip,
    manuallyEnabled: !!data?.manuallyEnabled,
    isLoading,
  };
}
