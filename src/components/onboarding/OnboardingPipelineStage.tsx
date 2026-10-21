import { useDroppable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { OnboardingClientCard, OnboardingClientData } from "./OnboardingClientCard";
import { OnboardingStage } from "@/lib/onboardingStages";
import { CheckCircle2, Clock, Inbox, ChevronRight } from "lucide-react";

interface OnboardingPipelineStageProps {
  stage: OnboardingStage;
  clients: OnboardingClientData[];
  onClientClick: (client: OnboardingClientData) => void;
  isFirst?: boolean;
  isLast?: boolean;
}

const stageColors: Record<number, { 
  bg: string; 
  border: string; 
  text: string; 
  icon: string;
  gradient: string;
  ring: string;
}> = {
  1: { 
    bg: 'bg-violet-500/10', 
    border: 'border-violet-500/40', 
    text: 'text-violet-600 dark:text-violet-400', 
    icon: 'text-violet-500',
    gradient: 'from-violet-500/20 to-violet-600/10',
    ring: 'ring-violet-500/50'
  },
  2: { 
    bg: 'bg-blue-500/10', 
    border: 'border-blue-500/40', 
    text: 'text-blue-600 dark:text-blue-400', 
    icon: 'text-blue-500',
    gradient: 'from-blue-500/20 to-blue-600/10',
    ring: 'ring-blue-500/50'
  },
  3: { 
    bg: 'bg-amber-500/10', 
    border: 'border-amber-500/40', 
    text: 'text-amber-600 dark:text-amber-400', 
    icon: 'text-amber-500',
    gradient: 'from-amber-500/20 to-amber-600/10',
    ring: 'ring-amber-500/50'
  },
  4: { 
    bg: 'bg-orange-500/10', 
    border: 'border-orange-500/40', 
    text: 'text-orange-600 dark:text-orange-400', 
    icon: 'text-orange-500',
    gradient: 'from-orange-500/20 to-orange-600/10',
    ring: 'ring-orange-500/50'
  },
  5: { 
    bg: 'bg-cyan-500/10', 
    border: 'border-cyan-500/40', 
    text: 'text-cyan-600 dark:text-cyan-400', 
    icon: 'text-cyan-500',
    gradient: 'from-cyan-500/20 to-cyan-600/10',
    ring: 'ring-cyan-500/50'
  },
  6: { 
    bg: 'bg-emerald-500/10', 
    border: 'border-emerald-500/40', 
    text: 'text-emerald-600 dark:text-emerald-400', 
    icon: 'text-emerald-500',
    gradient: 'from-emerald-500/20 to-emerald-600/10',
    ring: 'ring-emerald-500/50'
  },
};

export function OnboardingPipelineStage({ 
  stage, 
  clients, 
  onClientClick,
  isFirst,
  isLast 
}: OnboardingPipelineStageProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage.stage}`,
  });

  const colors = stageColors[stage.stage] || stageColors[1];
  const isFinalStage = stage.stage === 6;

  return (
    <div className="flex items-center">
      {/* Stage Card */}
      <div 
        ref={setNodeRef}
        className={`
          relative flex flex-col w-[220px] min-h-[240px] rounded-2xl border-2 transition-all duration-300
          bg-gradient-to-b ${colors.gradient} backdrop-blur-sm
          ${isOver 
            ? `ring-2 ${colors.ring} ring-offset-2 ring-offset-background scale-[1.02] shadow-xl ${colors.border}` 
            : `${colors.border} hover:shadow-lg`
          }
        `}
      >
        {/* Stage Header */}
        <div className="p-3 pb-2 space-y-2 border-b border-border/30">
          <div className="flex items-center justify-between">
            <Badge 
              className={`${colors.bg} ${colors.text} border ${colors.border} font-semibold text-xs shadow-sm`}
            >
              Stage {stage.stage}
            </Badge>
            <Badge 
              variant="secondary" 
              className={`text-xs font-bold h-6 w-6 p-0 flex items-center justify-center rounded-full ${
                clients.length > 0 ? 'bg-primary text-primary-foreground' : ''
              }`}
            >
              {clients.length}
            </Badge>
          </div>
          
          <div className="space-y-1">
            <h3 className="font-semibold text-xs font-heading leading-tight line-clamp-2">
              {stage.shortTitle || stage.title}
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {isFinalStage ? (
                <CheckCircle2 className={`h-3 w-3 ${colors.icon}`} />
              ) : isFirst ? (
                <Inbox className={`h-3 w-3 ${colors.icon}`} />
              ) : (
                <Clock className={`h-3 w-3 ${colors.icon}`} />
              )}
              <span>{stage.tasks.length} tasks</span>
            </div>
          </div>
        </div>
        
        {/* Clients Zone */}
        <div className="flex-1 p-2">
          <SortableContext 
            items={clients.map(c => c.id)} 
            strategy={horizontalListSortingStrategy}
          >
            {clients.length === 0 ? (
              <div className={`
                flex flex-col items-center justify-center h-full min-h-[140px] 
                border-2 border-dashed rounded-xl ${colors.border} ${colors.bg} 
                transition-colors
              `}>
                <Inbox className={`h-5 w-5 mb-1.5 ${colors.icon} opacity-40`} />
                <p className="text-[10px] text-muted-foreground font-medium">Drop clients here</p>
              </div>
            ) : (
              <ScrollArea className="h-[140px]">
                <div className="space-y-2 pr-2">
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
                <ScrollBar orientation="vertical" />
              </ScrollArea>
            )}
          </SortableContext>
        </div>
      </div>

      {/* Arrow Connector (except for last stage) */}
      {!isLast && (
        <div className="flex items-center justify-center w-8 -mx-1">
          <ChevronRight className="h-6 w-6 text-muted-foreground/40" />
        </div>
      )}
    </div>
  );
}
