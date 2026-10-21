import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp } from "lucide-react";
import { getCommissionCycleDates } from "@/utils/commissionCycle";
import { format } from "date-fns";

interface CashCollectedGoalCardProps {
  isLoading?: boolean;
}

export function CashCollectedGoalCard({ isLoading: parentLoading }: CashCollectedGoalCardProps) {
  const { user } = useAuth();
  const { start, end } = getCommissionCycleDates();
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");

  // Fetch AE's cash collected goal
  const { data: compensation, isLoading: compLoading } = useQuery({
    queryKey: ["ae-compensation-goal", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("ae_compensation")
        .select("cash_collected_goal")
        .eq("user_id", user.id)
        .maybeSingle();
      return data as { cash_collected_goal: number } | null;
    },
    enabled: !!user?.id,
  });

  // Fetch cash collected: closed deals where the meeting was assigned to this AE
  const { data: cashCollected, isLoading: cashLoading } = useQuery({
    queryKey: ["ae-cash-collected", user?.id, startStr, endStr],
    queryFn: async () => {
      if (!user?.id) return 0;

      // W15: canonical cash definition is cash_collected_ex_vat — the same
      // figure the CEO tile sums. Contract value is a different number and
      // must not be presented as cash.
      const { data: myMeetings } = await supabase
        .from("meetings")
        .select("id")
        .eq("assigned_ae_id", user.id);

      const meetingIds = (myMeetings ?? []).map(m => m.id);

      const [pitchRes, discoRes] = await Promise.all([
        supabase
          .from("pitch_calls")
          .select("discovery_log_id, cash_collected_ex_vat")
          .eq("created_by", user.id)
          .eq("converted_to_client", true)
          .gte("updated_at", `${startStr}T00:00:00`)
          .lte("updated_at", `${endStr}T23:59:59`),
        meetingIds.length
          ? supabase
              .from("sales_discovery_logs")
              .select("id, cash_collected_ex_vat")
              .eq("converted_to_client", true)
              .in("meeting_id", meetingIds)
              .gte("updated_at", `${startStr}T00:00:00`)
              .lte("updated_at", `${endStr}T23:59:59`)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // A disco whose pitch call is already counted must not double count.
      const pitchRows = (pitchRes.data ?? []) as any[];
      const pitchDiscoIds = new Set(
        pitchRows.map((p) => p.discovery_log_id).filter(Boolean),
      );
      const pitchCash = pitchRows.reduce(
        (s, p) => s + Number(p.cash_collected_ex_vat || 0),
        0,
      );
      const discoCash = ((discoRes.data ?? []) as any[])
        .filter((d) => !pitchDiscoIds.has(d.id))
        .reduce((s, d) => s + Number(d.cash_collected_ex_vat || 0), 0);

      return pitchCash + discoCash;
    },
    enabled: !!user?.id,
  });

  const loading = parentLoading || compLoading || cashLoading;
  const goal = (compensation?.cash_collected_goal as number) || 0;
  const collected = cashCollected || 0;
  const progressPct = goal > 0 ? Math.min(Math.round((collected / goal) * 100), 100) : 0;
  const remaining = Math.max(goal - collected, 0);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-5 w-40 bg-muted animate-pulse rounded" />
        <div className="h-8 w-24 bg-muted animate-pulse rounded" />
        <div className="h-3 w-full bg-muted animate-pulse rounded-full" />
      </div>
    );
  }

  // Calculate days progress in the cycle
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const elapsedDays = Math.max(0, Math.round((new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const daysRemaining = Math.max(0, totalDays - elapsedDays);

  return (
    <div className="p-6 h-full flex flex-col relative overflow-hidden">
      {/* Subtle background gradient accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/5 to-transparent rounded-bl-full pointer-events-none" />

      {/* Header */}
      <div className="mb-5 relative">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Cash Collected Goal</h3>
          </div>
          {goal > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {daysRemaining}d left
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground ml-10">
          {format(start, "MMM d")} – {format(end, "MMM d, yyyy")}
        </p>
      </div>

      {goal === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
            <Target className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">No goal set yet</p>
          <p className="text-xs text-muted-foreground/70">Ask your manager to set a target</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between">
          {/* Amount display */}
          <div className="space-y-3 mb-5">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-foreground">
                  £{collected.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground font-medium">
                  / £{goal.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Visual progress bar with percentage label */}
            <div className="space-y-2">
              <div className="relative">
                <Progress value={progressPct} className="h-4 rounded-lg" />
                {progressPct > 8 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-primary-foreground mix-blend-difference">
                    {progressPct}%
                  </span>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">Collected</p>
                <p className="text-sm font-semibold text-foreground">£{collected.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">Remaining</p>
                <p className="text-sm font-semibold text-foreground">£{remaining.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">Progress</p>
                <p className="text-sm font-semibold text-primary">{progressPct}%</p>
              </div>
            </div>
          </div>

          {/* Bottom: pace indicator */}
          <div className="flex items-center justify-between text-xs pt-2 border-t border-border/30">
            <span className="text-muted-foreground">
              {elapsedDays} of {totalDays} days elapsed
            </span>
            <div className="flex items-center gap-1 text-primary">
              <TrendingUp className="h-3 w-3" />
              <span className="font-medium">
                {remaining > 0 && daysRemaining > 0
                  ? `£${Math.round(remaining / daysRemaining).toLocaleString()}/day needed`
                  : progressPct >= 100
                    ? "Goal reached! 🎉"
                    : "On track"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
