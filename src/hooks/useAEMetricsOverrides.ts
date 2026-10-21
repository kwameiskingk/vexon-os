import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export interface AEMetricsOverride {
  id: string;
  ae_user_id: string;
  period_start: string;
  period_end: string;
  total_discovery: number;
  qualified_discovery: number;
  no_shows: number;
  lead_followups: number;
  total_closes: number;
  contract_value: number;
  cash_collected: number;
  notes: string | null;
  created_at: string;
}

interface UseAEMetricsOverridesOptions {
  aeUserId?: string;
  periodStart: Date;
  periodEnd: Date;
  enabled?: boolean;
}

/**
 * Fetches any existing AE metrics override for a specific period.
 * Returns null if no override exists.
 */
export function useAEMetricsOverride({ 
  aeUserId, 
  periodStart, 
  periodEnd,
  enabled = true 
}: UseAEMetricsOverridesOptions) {
  return useQuery({
    queryKey: ["ae-metrics-override", aeUserId, format(periodStart, "yyyy-MM-dd"), format(periodEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!aeUserId) return null;

      const startStr = format(periodStart, "yyyy-MM-dd");
      const endStr = format(periodEnd, "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("ae_metrics_overrides")
        .select("*")
        .eq("ae_user_id", aeUserId)
        .eq("period_start", startStr)
        .eq("period_end", endStr)
        .maybeSingle();

      if (error) throw error;
      return data as AEMetricsOverride | null;
    },
    enabled: enabled && !!aeUserId,
  });
}

/**
 * Fetches all AE metrics overrides that overlap with a given date range.
 * Optionally filter by a specific AE user ID.
 */
export function useAEMetricsOverridesInRange(periodStart: Date, periodEnd: Date, aeUserId?: string) {
  return useQuery({
    queryKey: ["ae-metrics-overrides-range", format(periodStart, "yyyy-MM-dd"), format(periodEnd, "yyyy-MM-dd"), aeUserId],
    queryFn: async () => {
      const startStr = format(periodStart, "yyyy-MM-dd");
      const endStr = format(periodEnd, "yyyy-MM-dd");

      // Fetch overrides where the period overlaps with our query range
      let query = supabase
        .from("ae_metrics_overrides")
        .select("*")
        .lte("period_start", endStr)
        .gte("period_end", startStr);
      
      // If aeUserId provided, filter to just that user
      if (aeUserId) {
        query = query.eq("ae_user_id", aeUserId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as AEMetricsOverride[];
    },
  });
}

/**
 * Given a list of overrides, aggregates them into total metrics.
 * Useful when displaying combined metrics from multiple periods.
 */
export function aggregateOverrideMetrics(overrides: AEMetricsOverride[]) {
  return overrides.reduce(
    (acc, override) => ({
      totalDiscovery: acc.totalDiscovery + override.total_discovery,
      qualifiedDiscovery: acc.qualifiedDiscovery + override.qualified_discovery,
      noShows: acc.noShows + override.no_shows,
      leadFollowups: acc.leadFollowups + override.lead_followups,
      totalCloses: acc.totalCloses + override.total_closes,
      contractValue: acc.contractValue + override.contract_value,
      cashCollected: acc.cashCollected + override.cash_collected,
    }),
    {
      totalDiscovery: 0,
      qualifiedDiscovery: 0,
      noShows: 0,
      leadFollowups: 0,
      totalCloses: 0,
      contractValue: 0,
      cashCollected: 0,
    }
  );
}
