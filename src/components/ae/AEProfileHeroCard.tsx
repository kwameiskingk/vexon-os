import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { TrendingUp, Trophy, Target, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserDisplayName } from "@/hooks/useUserDisplayName";

interface HeroMetrics {
  contractValue: number;
  dealsCount: number;
  leaderboardPosition: number | null;
  hasOverride: boolean;
}

export function AEProfileHeroCard() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<HeroMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { data: avatarUrl } = useQuery({
    queryKey: ["my-avatar", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
      return data?.avatar_url || null;
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });

  const { displayName } = useUserDisplayName();

  useEffect(() => {
    if (user?.id) {
      loadMetrics();
    }
  }, [user?.id]);

  const loadMetrics = async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    const today = new Date();
    const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");

    // First, check for override data for this user and month
    const { data: override } = await supabase
      .from("ae_metrics_overrides")
      .select("contract_value, total_closes")
      .eq("ae_user_id", user.id)
      .eq("period_start", monthStart)
      .eq("period_end", monthEnd)
      .maybeSingle();

    // If override exists and has values, use it
    if (override && (override.contract_value || override.total_closes)) {
      setMetrics({
        contractValue: override.contract_value || 0,
        dealsCount: override.total_closes || 0,
        leaderboardPosition: (override.total_closes || 0) > 0 ? 1 : null,
        hasOverride: true,
      });
      setIsLoading(false);
      return;
    }

    // Fallback: Fetch MTD closes from actual tables
    const { data: discoveryCloses } = await supabase
      .from("sales_discovery_logs")
      .select("id, contract_value")
      .eq("converted_to_client", true)
      .gte("updated_at", `${monthStart}T00:00:00`)
      .lte("updated_at", `${monthEnd}T23:59:59`);

    const { data: pitchCloses } = await supabase
      .from("pitch_calls")
      .select("id, contract_value")
      .eq("converted_to_client", true)
      .gte("updated_at", `${monthStart}T00:00:00`)
      .lte("updated_at", `${monthEnd}T23:59:59`);

    const discoveryValue = discoveryCloses?.reduce((sum, c) => sum + (c.contract_value || 0), 0) || 0;
    const pitchValue = pitchCloses?.reduce((sum, c) => sum + (c.contract_value || 0), 0) || 0;
    const dealsCount = (discoveryCloses?.length || 0) + (pitchCloses?.length || 0);

    setMetrics({
      contractValue: discoveryValue + pitchValue,
      dealsCount,
      leaderboardPosition: dealsCount > 0 ? 1 : null,
      hasOverride: false,
    });
    setIsLoading(false);
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `£${(value / 1000).toFixed(1)}k`;
    }
    return `£${value.toLocaleString()}`;
  };

  const userName = displayName;

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden bg-gradient-to-br from-card to-card/80 border-border/50">
      <CardContent className="p-6">
        <div className="flex items-start gap-5">
          <UserAvatar name={userName} avatarUrl={avatarUrl} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground truncate">{userName}</h3>
              {metrics?.hasOverride && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 shrink-0">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Override
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Account Executive</p>
            
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className="text-xs">MTD Value</span>
                </div>
                <p className="text-xl font-bold text-foreground">
                  {formatCurrency(metrics?.contractValue || 0)}
                </p>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Target className="h-3.5 w-3.5" />
                  <span className="text-xs">Deals</span>
                </div>
                <p className="text-xl font-bold text-foreground">
                  {metrics?.dealsCount || 0}
                </p>
              </div>
              
              {metrics?.leaderboardPosition && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Trophy className="h-3.5 w-3.5" />
                    <span className="text-xs">Rank</span>
                  </div>
                  <p className="text-xl font-bold text-amber-500">
                    #{metrics.leaderboardPosition}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
