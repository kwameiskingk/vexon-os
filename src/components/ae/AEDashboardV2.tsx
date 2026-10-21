import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAEDashboardData } from "@/hooks/useAEDashboardData";
import { AEProfileHero } from "./AEProfileHero";
import { PipelineDonut } from "./PipelineDonut";
import { CashCollectedGoalCard } from "./CashCollectedGoalCard";
import { TodaysFocusPanel } from "./TodaysFocusPanel";
import { ActivePipelineTable } from "./ActivePipelineTable";
import { useGreeting } from "@/hooks/useGreeting";
import { AlertCircle } from "lucide-react";

export function AEDashboardV2() {
  const dashboardData = useAEDashboardData();
  const { fullGreeting } = useGreeting();

  return (
    <div className="space-y-5 animate-fade-in">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[28px] md:text-[32px] font-semibold tracking-tight leading-tight bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
            {fullGreeting}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Here's your pipeline overview
          </p>
        </div>
        {dashboardData.hasOverride && (
          <Badge
            variant="outline"
            className="h-fit bg-amber-500/10 text-amber-600 border-amber-500/20 backdrop-blur-sm"
          >
            <AlertCircle className="mr-1 h-3 w-3" />
            Using Override Data
          </Badge>
        )}
      </header>

      {/* Top Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-3 overflow-hidden">
          <AEProfileHero
            mtdContractValue={dashboardData.profile.mtdContractValue}
            dealsCount={dashboardData.profile.dealsCount}
            leaderboardPosition={dashboardData.profile.leaderboardPosition}
            isLoading={dashboardData.isLoading}
          />
        </Card>

        <Card className="lg:col-span-4 overflow-hidden">
          <PipelineDonut
            data={dashboardData.pipeline}
            isLoading={dashboardData.isLoading}
          />
        </Card>

        <Card className="lg:col-span-5 overflow-hidden">
          <CashCollectedGoalCard isLoading={dashboardData.isLoading} />
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <TodaysFocusPanel
            discoveryCallsToday={dashboardData.todaysFocus.discoveryCallsToday}
            followUpCallsToday={dashboardData.todaysFocus.followUpCallsToday}
            actionRequired={dashboardData.todaysFocus.actionRequired}
            overdueOutcomes={dashboardData.todaysFocus.overdueOutcomes}
            showUpRate={dashboardData.quickPulse.showUpRate}
            closeRate={dashboardData.quickPulse.closeRate}
            mtdValue={dashboardData.quickPulse.mtdValue}
            isLoading={dashboardData.isLoading}
          />
        </Card>

        <Card className="overflow-hidden">
          <ActivePipelineTable
            data={dashboardData.activePipeline}
            isLoading={dashboardData.isLoading}
          />
        </Card>
      </div>
    </div>
  );
}
