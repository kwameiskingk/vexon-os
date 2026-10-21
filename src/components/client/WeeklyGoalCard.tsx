import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target,
  Flame,
  CheckCircle2,
  TrendingUp,
  XCircle,
  Clock,
  CalendarDays,
  Trophy,
} from "lucide-react";
import {
  type WeeklyGoal,
  getCurrentCampaignWeek,
  getConsecutiveStreak,
  getCompletedGoalHitRate,
} from "@/lib/campaignGoals";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface WeeklyGoalDemoData {
  campaignName: string;
  campaignStartDate: string;
  campaignEndDate: string | null;
  totalWeeks: number;
  currentWeek: number;
  currentGoal: WeeklyGoal | null;
  streak: number;
  hitRate: { met: number; total: number; rate: number };
  goals: WeeklyGoal[];
  completedWeeksCount: number;
  totalAchieved: number;
  totalTarget: number;
  weeksHit: number;
  weeksExceeded: number;
}

interface WeeklyGoalCardProps {
  clientProfileId: string;
  demoData?: WeeklyGoalDemoData;
}

export function WeeklyGoalCard({ clientProfileId, demoData }: WeeklyGoalCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["weekly-goals-client", clientProfileId],
    queryFn: async () => {
      if (demoData) return demoData;

      // Daniel's per-client visibility toggle: when the CSM hides weekly
      // goals for this client the card renders nothing. Fail-soft before the
      // migration adds the column (select error → show as always).
      const { data: vis, error: visError } = await supabase
        .from("client_profiles")
        .select("show_weekly_goals" as "id")
        .eq("id", clientProfileId)
        .maybeSingle();
      if (!visError && (vis as unknown as { show_weekly_goals?: boolean } | null)?.show_weekly_goals === false) {
        return null;
      }

      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, start_date, end_date, name")
        .eq("client_id", clientProfileId)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1);

      const campaign = campaigns?.[0];
      if (!campaign?.start_date) return null;

      const { data: goals } = await supabase
        .from("campaign_weekly_goals")
        .select("*")
        .eq("campaign_id", campaign.id)
        .order("week_number", { ascending: true });

      if (!goals?.length) return null;

      const currentWeek = getCurrentCampaignWeek(campaign.start_date);

      const clientGoals: WeeklyGoal[] = (goals as any[]).map((g) => ({
        ...g,
        achieved: (g as any).published_achieved ?? 0,
        goal_met: ((g as any).published_achieved ?? 0) >= g.target,
      }));

      const currentGoal =
        clientGoals.find((g) => g.week_number === currentWeek) || null;
      const streak = getConsecutiveStreak(clientGoals);
      const hitRate = getCompletedGoalHitRate(clientGoals);

      const today = new Date();
      const completedWeeks = clientGoals.filter(
        (g) => new Date(g.week_end) < today
      );
      const totalAchieved = clientGoals.reduce(
        (sum, g) => sum + g.achieved,
        0
      );
      const totalTarget = clientGoals.reduce((sum, g) => sum + g.target, 0);

      // New footer metrics
      // Weeks hit: any week (past or current) where achieved >= target
      const weeksHit = clientGoals.filter((g) => g.achieved >= g.target && g.target > 0).length;
      // Weeks exceeded: weeks where achieved > target
      const weeksExceeded = clientGoals.filter((g) => g.achieved > g.target && g.target > 0).length;

      return {
        campaignName: campaign.name,
        campaignStartDate: campaign.start_date,
        campaignEndDate: campaign.end_date,
        totalWeeks: clientGoals.length,
        currentWeek,
        currentGoal,
        streak,
        hitRate,
        goals: clientGoals,
        completedWeeksCount: completedWeeks.length,
        totalAchieved,
        totalTarget,
        weeksHit,
        weeksExceeded,
      };
    },
  });


  if (isLoading) {
    return (
      <Card className="border-border shadow-card">
        <CardContent className="pt-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            This Week's Goal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No active campaign goals at the moment.
          </p>
        </CardContent>
      </Card>
    );
  }

  const {
    currentGoal,
    currentWeek,
    totalWeeks,
    streak,
    hitRate,
    goals,
    totalAchieved,
    totalTarget,
    weeksHit,
    weeksExceeded,
  } = data;

  const isCurrentWeekActive = currentWeek >= 1 && currentWeek <= totalWeeks;

  if (!isCurrentWeekActive || !currentGoal) {
    return (
      <Card className="border-border shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Weekly Goal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Campaign week is outside the active range.
          </p>
          {hitRate.total > 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              Overall: {hitRate.met}/{hitRate.total} weeks hit ({hitRate.rate}%)
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const progressPct = Math.min(
    100,
    (currentGoal.achieved / currentGoal.target) * 100
  );

  // Determine current week status
  const currentWeekStatus = currentGoal.achieved > currentGoal.target
    ? "exceeded"
    : currentGoal.goal_met
    ? "met"
    : currentGoal.achieved > 0
    ? "in_progress"
    : "pending";

  const statusConfig = {
    exceeded: {
      label: "Exceeded!",
      icon: Flame,
      color: "text-violet-500",
      bgAccent: "from-violet-500/10 to-transparent",
      progressColor: "[&>div]:bg-violet-500",
      badgeClass: "bg-violet-500/15 text-violet-500 border-violet-500/30",
    },
    met: {
      label: "Goal Met!",
      icon: CheckCircle2,
      color: "text-green-500",
      bgAccent: "from-green-500/10 to-transparent",
      progressColor: "[&>div]:bg-green-500",
      badgeClass: "bg-green-500/15 text-green-500 border-green-500/30",
    },
    in_progress: {
      label: "In Progress",
      icon: Clock,
      color: "text-amber-500",
      bgAccent: "from-amber-500/5 to-transparent",
      progressColor: "[&>div]:bg-amber-500",
      badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    },
    pending: {
      label: "Not Started",
      icon: Target,
      color: "text-muted-foreground",
      bgAccent: "from-muted/30 to-transparent",
      progressColor: "",
      badgeClass: "",
    },
  };

  const status = statusConfig[currentWeekStatus];
  const StatusIcon = status.icon;

  // Previous week
  const prevGoal = goals.find((g) => g.week_number === currentWeek - 1);

  // Date range for current week
  const weekStart = currentGoal.week_start
    ? format(new Date(currentGoal.week_start), "MMM d")
    : "";
  const weekEnd = currentGoal.week_end
    ? format(new Date(currentGoal.week_end), "MMM d")
    : "";

  return (
    <Card className="border-border shadow-card relative overflow-hidden">
      {/* Subtle gradient accent based on status */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${status.bgAccent} pointer-events-none`}
      />

      <CardHeader className="pb-2 relative">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            This Week's Goal
          </CardTitle>
          <Badge variant="outline" className="text-xs font-medium">
            Week {currentWeek} of {totalWeeks}
          </Badge>
        </div>
        {weekStart && weekEnd && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <CalendarDays className="h-3 w-3" />
            {weekStart} – {weekEnd}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4 relative">
        {/* Main progress hero */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-4xl font-bold tracking-tight text-foreground">
              {currentGoal.achieved}
              <span className="text-xl text-muted-foreground font-normal">
                /{currentGoal.target}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">Qualified Meetings</p>
          </div>
          <Badge className={`${status.badgeClass} gap-1`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {status.label}
          </Badge>
        </div>


        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{Math.round(progressPct)}% complete</span>
            <span>
              {currentGoal.target - currentGoal.achieved > 0
                ? `${currentGoal.target - currentGoal.achieved} remaining`
                : "Target reached"}
            </span>
          </div>
          <div
            className={`h-2.5 rounded-full bg-muted/50 overflow-hidden`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                currentGoal.achieved > currentGoal.target
                  ? "bg-violet-500"
                  : currentGoal.goal_met
                  ? "bg-green-500"
                  : currentGoal.achieved > 0
                  ? "bg-amber-500"
                  : "bg-muted-foreground/20"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Previous week result */}
        {prevGoal && (
          <div
            className={`rounded-lg border p-3 ${
              prevGoal.achieved > prevGoal.target
                ? "border-violet-500/30 bg-violet-500/5"
                : prevGoal.goal_met
                ? "border-green-500/30 bg-green-500/5"
                : "border-destructive/30 bg-destructive/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Last Week (Week {prevGoal.week_number})
              </p>
              {prevGoal.achieved > prevGoal.target ? (
                <div className="flex items-center gap-1 text-violet-500 text-xs font-medium">
                  <Flame className="h-3.5 w-3.5" />
                  Exceeded
                </div>
              ) : prevGoal.goal_met ? (
                <div className="flex items-center gap-1 text-green-500 text-xs font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Goal Met
                </div>
              ) : (
                <div className="flex items-center gap-1 text-destructive text-xs font-medium">
                  <XCircle className="h-3.5 w-3.5" />
                  Missed
                </div>
              )}
            </div>
            <p className="text-sm font-semibold mt-1">
              {prevGoal.achieved}/{prevGoal.target} Qualified Meetings
            </p>

          </div>
        )}

        {/* Week-by-week timeline */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Weekly Breakdown
          </p>
          <div className="flex gap-1 flex-wrap">
            {goals.map((g) => {
              const today = new Date();
              const isPast = new Date(g.week_end) < today;
              const isCurrent = g.week_number === currentWeek;

              let bg = "bg-muted/40";
              let border = "";
              let textColor = "text-muted-foreground/60";

              if (isCurrent) {
                // Current week shows status-appropriate color
                if (g.achieved > g.target) {
                  bg = "bg-violet-500";
                  textColor = "text-white";
                } else if (g.goal_met) {
                  bg = "bg-green-500";
                  textColor = "text-white";
                } else if (g.achieved > 0) {
                  bg = "bg-amber-500";
                  textColor = "text-white";
                } else {
                  bg = "bg-primary/20";
                  textColor = "text-primary";
                }
                border =
                  "ring-2 ring-primary ring-offset-1 ring-offset-background";
              } else if (isPast) {
                bg = g.achieved > g.target
                  ? "bg-violet-500"
                  : g.goal_met
                  ? "bg-green-500"
                  : "bg-destructive/70";
                textColor = "text-white/90";
              }

              const tooltipText = `Week ${g.week_number}: ${g.achieved}/${g.target} meetings${
                g.achieved > g.target ? " ★ Exceeded" : g.goal_met ? " ✓ Met" : isPast ? " ✗ Missed" : isCurrent ? " – Current" : ""
              }`;


              return (
                <Tooltip key={g.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={`w-6 h-6 rounded-md ${bg} ${border} flex items-center justify-center cursor-default transition-transform hover:scale-110`}
                    >
                      <span className={`text-[10px] font-semibold ${textColor}`}>
                        {g.week_number}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {tooltipText}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-violet-500 inline-block" />{" "}
              Exceeded
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />{" "}
              Met
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-destructive/70 inline-block" />{" "}
              Missed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />{" "}
              In Progress
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-muted/40 inline-block" />{" "}
              Upcoming
            </span>
          </div>
        </div>


        {/* Stats footer */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
          {/* Weeks hit */}
          <div className="text-center">
            <div className={`flex items-center justify-center gap-1 ${weeksHit > 0 ? "text-green-500" : "text-muted-foreground"}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="text-sm font-semibold">{weeksHit}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Weeks Hit
            </p>
          </div>
          {/* Weeks exceeded */}
          <div className="text-center">
            <div className={`flex items-center justify-center gap-1 ${weeksExceeded > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
              <Flame className="h-3.5 w-3.5" />
              <span className="text-sm font-semibold">{weeksExceeded}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Weeks Exceeded
            </p>
          </div>
          {/* Total meetings */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-foreground">
              <Trophy className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-semibold">{totalAchieved}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Total Meetings
            </p>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
