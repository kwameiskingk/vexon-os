import { UserAvatar } from "@/components/ui/user-avatar";
import { useUserDisplayName } from "@/hooks/useUserDisplayName";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Sparkles } from "lucide-react";

interface AEProfileHeroProps {
  mtdContractValue: number;
  dealsCount: number;
  leaderboardPosition: number | null;
  isLoading?: boolean;
}

function formatCurrencyValue(value: number) {
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `£${(value / 1_000).toFixed(1)}k`;
  return `£${value.toLocaleString()}`;
}

export function AEProfileHero({
  mtdContractValue,
  dealsCount,
  leaderboardPosition,
  isLoading,
}: AEProfileHeroProps) {
  const { user } = useAuth();
  const { displayName } = useUserDisplayName();
  const userName = displayName || "Account Executive";

  const { data: avatarUrl } = useQuery({
    queryKey: ["my-avatar", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      return data?.avatar_url || null;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const animatedValue = useAnimatedCounter(mtdContractValue, { duration: 1100 });
  const animatedDeals = useAnimatedCounter(dealsCount, { duration: 900 });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-6 space-y-4 h-full">
        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-muted to-muted/40 animate-pulse" />
        <div className="h-10 w-32 bg-muted/60 animate-pulse rounded-md" />
        <div className="h-4 w-24 bg-muted/40 animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-center p-6 space-y-3 h-full overflow-hidden">
      <div className="relative">
        <UserAvatar
          name={userName}
          avatarUrl={avatarUrl}
          size="xl"
          className="relative h-24 w-24 text-2xl ring-2 ring-primary/20 ring-offset-2 ring-offset-card"
        />
      </div>

      {/* Big Revenue Number */}
      <div className="relative text-center">
        <p className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
          {formatCurrencyValue(animatedValue)}
        </p>
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mt-1.5">
          MTD Contract Value
        </p>
      </div>

      {/* Name and Rank */}
      <div className="relative text-center space-y-1.5 pt-1">
        <p className="text-base font-medium text-foreground">{userName}</p>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5">
            <Sparkles className="h-3 w-3 text-primary/80" />
            {animatedDeals} deal{animatedDeals !== 1 ? "s" : ""} closed
          </span>
          {leaderboardPosition && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-500">
              <Trophy className="h-3 w-3" />
              Rank #{leaderboardPosition}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
