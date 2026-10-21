import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { TeamGoalCard } from "@/components/gamification/TeamGoalCard";
import { useGreeting } from "@/hooks/useGreeting";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Target } from "lucide-react";
import { usePersistedState } from "@/hooks/usePersistedState";

export default function OperationsOverview() {
  const { fullGreeting } = useGreeting();
  const [isOpen, setIsOpen] = usePersistedState('team-goal-planning-open', true);

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title={fullGreeting}
          subtitle={`Metrics for ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
        />
        <div className="space-y-5">
          <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-4">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-xl font-heading font-semibold hover:text-primary transition-colors">
                {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                <Target className="h-5 w-5 text-primary" />
                Team Goal Planning
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  Set and track team meeting targets
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <TeamGoalCard canManage />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
