import { AEProfileHeroCard } from "./AEProfileHeroCard";
import { AEPipelineDonut } from "./AEPipelineDonut";
import { AEOpportunitiesTable } from "./AEOpportunitiesTable";
import { TodaysCallsCard } from "@/components/dashboard/TodaysCallsCard";
import { ActionRequiredCard } from "@/components/dashboard/ActionRequiredCard";
import { QuickPulseCard } from "@/components/dashboard/QuickPulseCard";
import { RecentWinsCard } from "@/components/dashboard/RecentWinsCard";
import { useGreeting } from "@/hooks/useGreeting";

export function AEDashboard() {
  const { fullGreeting } = useGreeting();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          {fullGreeting}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's what needs your attention today
        </p>
      </div>

      {/* Top Row: Profile Hero + Pipeline Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AEProfileHeroCard />
        <AEPipelineDonut />
      </div>

      {/* Middle Row: Today's Calls + Action Required */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TodaysCallsCard />
        <ActionRequiredCard />
      </div>

      {/* Bottom Row: Quick Pulse + Recent Wins */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <QuickPulseCard />
        <RecentWinsCard />
      </div>

      {/* Opportunities Table */}
      <AEOpportunitiesTable />
    </div>
  );
}
