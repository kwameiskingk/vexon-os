import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OnboardingClientCard, OnboardingClientData } from "./OnboardingClientCard";
import { OnboardingStage } from "@/lib/onboardingStages";
import { CheckCircle2, Clock, Inbox } from "lucide-react";

interface OnboardingStageColumnProps {
  stage: OnboardingStage;
  clients: OnboardingClientData[];
  onClientClick: (client: OnboardingClientData) => void;
}

const stageColors: Record<number, { bg: string; border: string; text: string; icon: string }> = {
  1: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-600 dark:text-violet-400', icon: 'text-violet-500' },
  2: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-600 dark:text-blue-400', icon: 'text-blue-500' },
  3: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600 dark:text-amber-400', icon: 'text-amber-500' },
  4: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-600 dark:text-orange-400', icon: 'text-orange-500' },
  5: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-600 dark:text-cyan-400', icon: 'text-cyan-500' },
  6: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400', icon: 'text-emerald-500' },
};

export function OnboardingStageColumn({ stage, clients, onClientClick }: OnboardingStageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage.stage}`,
  });

  const colors = stageColors[stage.stage] || stageColors[1];
  const isFirstStage = stage.stage === 1;
  const isFinalStage = stage.stage === 6;

  return (
    <Card 
      ref={setNodeRef}
      variant="elevated"
      className={`flex flex-col min-h-[300px] transition-all duration-300 overflow-hidden ${
        isOver 
          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02] shadow-xl' 
          : 'hover:shadow-lg'
      }`}
    >
      {/* Stage Header */}
      <CardHeader className="pb-3 pt-4 px-4 space-y-2 border-b border-border/50">
        <div className="flex items-center justify-between">
          <Badge 
            className={`${colors.bg} ${colors.text} border ${colors.border} font-medium text-xs`}
          >
            Stage {stage.stage}
          </Badge>
          <Badge 
            variant="secondary" 
            className={`text-xs font-semibold ${clients.length > 0 ? 'bg-primary/10 text-primary' : ''}`}
          >
            {clients.length}
          </Badge>
        </div>
        
        <div className="space-y-1">
          <h3 className="font-semibold text-sm font-heading leading-tight line-clamp-2">
            {stage.title}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isFinalStage ? (
              <CheckCircle2 className={`h-3.5 w-3.5 ${colors.icon}`} />
            ) : isFirstStage ? (
              <Inbox className={`h-3.5 w-3.5 ${colors.icon}`} />
            ) : (
              <Clock className={`h-3.5 w-3.5 ${colors.icon}`} />
            )}
            <span>{stage.tasks.length} tasks</span>
          </div>
        </div>
      </CardHeader>
      
      {/* Clients List */}
      <CardContent className="flex-1 p-3">
        <SortableContext 
          items={clients.map(c => c.id)} 
          strategy={verticalListSortingStrategy}
        >
          {clients.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-xl ${colors.border} ${colors.bg} transition-colors`}>
              <Inbox className={`h-6 w-6 mb-2 ${colors.icon} opacity-50`} />
              <p className="text-xs text-muted-foreground font-medium">No clients</p>
              <p className="text-[10px] text-muted-foreground/70">Drag clients here</p>
            </div>
          ) : (
            <ScrollArea className="h-[200px] pr-2">
              <div className="space-y-1.5">
                {clients.map((client) => (
                  <OnboardingClientCard
                    key={client.id}
                    client={client}
                    onClick={() => onClientClick(client)}
                    stageColor={colors.icon}
                    compact
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </SortableContext>
      </CardContent>
    </Card>
  );
}
