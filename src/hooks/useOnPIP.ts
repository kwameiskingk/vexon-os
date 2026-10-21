import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns true if the current user is currently on a Performance Improvement Plan
 * (i.e. their setters_profiles.status === 'pip').
 */
export function useOnPIP() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["on-pip", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("setters_profiles")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.status === "pip";
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  return { onPIP: !!data, isLoading };
}
