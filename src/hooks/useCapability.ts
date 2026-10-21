import { useQueries, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useCapability(capability: string) {
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const query = useQuery({
    queryKey: ["capability", capability, uid],
    enabled: !!uid && !!capability,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("has_capability", {
        _user_id: uid,
        _cap: capability,
      });
      if (error) throw error;
      return !!data;
    },
  });

  return { has: !!query.data, isLoading: query.isLoading };
}

export function useCanViewCEO() {
  return useCapability("can_view_ceo_dashboard");
}

export function useCanManageGoals() {
  return useCapability("can_manage_goals");
}

export function useCanViewProjects() {
  return useCapability("can_view_projects");
}

/**
 * True when the user holds ANY of the given capabilities. Same RPC and cache
 * keys as useCapability, so a single-capability caller and a multi-capability
 * caller share results.
 */
export function useAnyCapability(capabilities: string[]) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const results = useQueries({
    queries: capabilities.map((capability) => ({
      queryKey: ["capability", capability, uid],
      enabled: !!uid && !!capability,
      staleTime: 60_000,
      queryFn: async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc("has_capability", {
          _user_id: uid,
          _cap: capability,
        });
        if (error) throw error;
        return !!data;
      },
    })),
  });
  return {
    has: results.some((r) => !!r.data),
    isLoading: results.some((r) => r.isLoading),
  };
}
