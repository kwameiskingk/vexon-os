import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a map: clientProfileId -> health_override ("healthy" | "at_risk" | null)
 * Used to overlay manual admin overrides on top of sheet-driven health buckets.
 */
export const useClientHealthOverrides = (ids: string[]) => {
  const key = [...new Set(ids)].sort().join(",");
  return useQuery({
    queryKey: ["client-health-overrides", key],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string | null>> => {
      const { data, error } = await supabase
        .from("client_profiles")
        .select("id, health_override")
        .in("id", ids);
      if (error) throw error;
      const map: Record<string, string | null> = {};
      (data || []).forEach((r: any) => {
        map[r.id] = r.health_override ?? null;
      });
      return map;
    },
  });
};

export type HealthBucket = "green" | "amber" | "red" | null;

export const effectiveHealth = (
  sheetStatus: HealthBucket,
  override: string | null | undefined
): HealthBucket => {
  if (override === "healthy") return "green";
  if (override === "at_risk") return "red";
  return sheetStatus;
};
