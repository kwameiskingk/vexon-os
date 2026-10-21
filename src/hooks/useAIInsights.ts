import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCallback } from "react";

interface AIInsightOptions {
  setterMetrics: any[];
  timeRange: string;
  analysisType: "team_overview" | "setter_detail" | "today_focus";
  enabled?: boolean;
  leaveData?: any[];
}

export const useAIInsights = ({ setterMetrics, timeRange, analysisType, enabled = true, leaveData }: AIInsightOptions) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['ai-insights', analysisType, timeRange, JSON.stringify(setterMetrics.map(s => s.id || s.name)), JSON.stringify(leaveData?.map(l => l.full_name))],
    queryFn: async () => {
      if (!setterMetrics || setterMetrics.length === 0) return null;

      const body: any = { setterMetrics, timeRange, analysisType };
      if (leaveData && leaveData.length > 0) {
        body.leaveData = leaveData;
      }

      const { data, error } = await supabase.functions.invoke('sdr-ai-insights', {
        body,
      });

      if (error) {
        // Check for rate limit or credits errors
        const status = (error as any)?.status;
        if (status === 429) {
          toast({ title: "AI Rate Limited", description: "Too many requests. Insights will retry shortly.", variant: "destructive" });
          throw new Error("Rate limited");
        }
        if (status === 402) {
          toast({ title: "AI Credits Depleted", description: "AI credits have been used up. Contact your admin.", variant: "destructive" });
          throw new Error("Credits depleted");
        }
        throw error;
      }

      if (data?.error) {
        if (data.error.includes("Rate limit")) {
          toast({ title: "AI Rate Limited", description: "Too many requests. Try again shortly.", variant: "destructive" });
        }
        throw new Error(data.error);
      }

      return data?.insight as string;
    },
    enabled: enabled && setterMetrics.length > 0,
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['ai-insights', analysisType] });
  }, [queryClient, analysisType]);

  return { ...query, refresh };
};
