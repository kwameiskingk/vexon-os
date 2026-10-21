import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, CheckCircle2, Clock, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ONBOARDING_STAGES, getStageInfo } from "@/lib/onboardingStages";
import { OnboardingClientData } from "./OnboardingClientCard";
import { format } from "date-fns";

interface OnboardingTaskDrawerProps {
  client: OnboardingClientData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the complete-onboarding confirmation (promotes to active client). */
  onComplete?: (client: OnboardingClientData) => void;
}

interface TaskRecord {
  id: string;
  task_key: string;
  task_label: string;
  stage: number;
  is_completed: boolean;
  completed_at: string | null;
}

export function OnboardingTaskDrawer({ client, open, onOpenChange, onComplete }: OnboardingTaskDrawerProps) {
  const queryClient = useQueryClient();
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  // Fetch tasks for this client
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['onboarding-tasks', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      
      const { data, error } = await supabase
        .from('client_onboarding_tasks' as any)
        .select('id, task_key, task_label, stage, is_completed, completed_at')
        .eq('client_onboarding_id', client.id)
        .order('stage', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as TaskRecord[];
    },
    enabled: !!client?.id && open,
  });

  // Toggle task completion
  const toggleTask = useMutation({
    mutationFn: async ({ taskId, isCompleted }: { taskId: string; isCompleted: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('client_onboarding_tasks' as any)
        .update({
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
          completed_by: isCompleted ? user?.id : null,
        } as any)
        .eq('id', taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks', client?.id] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-clients'] });
    },
    onError: (error) => {
      console.error('Error toggling task:', error);
      toast.error('Failed to update task');
    },
  });

  if (!client) return null;

  const currentStageInfo = getStageInfo(client.current_stage);
  const progressPercent = client.total_tasks > 0 
    ? Math.round((client.completed_tasks / client.total_tasks) * 100) 
    : 0;

  // Group tasks by stage
  const tasksByStage = ONBOARDING_STAGES.map(stage => {
    const stageTasks = tasks?.filter(t => t.stage === stage.stage) || [];
    const completedCount = stageTasks.filter(t => t.is_completed).length;
    const totalCount = stageTasks.length;
    return {
      ...stage,
      tasks: stageTasks,
      completedCount,
      totalCount,
      isComplete: completedCount === totalCount && totalCount > 0,
    };
  });

  // Auto-expand current stage on open
  const stageToShow = expandedStage ?? client.current_stage;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-left">{client.company_name}</SheetTitle>
              <SheetDescription className="text-left">
                Stage {client.current_stage}: {currentStageInfo?.title}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Progress Summary */}
        <div className="mt-4 p-4 bg-muted/30 rounded-lg space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Progress</span>
            <Badge variant={progressPercent === 100 ? "default" : "secondary"}>
              {client.completed_tasks}/{client.total_tasks} tasks
            </Badge>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Started {format(new Date(client.started_at), 'MMM d, yyyy')}
          </div>
        </div>

        {onComplete && (
          <div className="mt-3 shrink-0">
            <Button
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onComplete(client)}
            >
              <CheckCircle2 className="h-4 w-4" />
              Complete Onboarding
            </Button>
            <p className="mt-1.5 text-[11px] text-muted-foreground text-center">
              Makes {client.company_name} an active client — visible in the Clients tab and Client Health.
            </p>
          </div>
        )}

        <Separator className="my-4" />

        {/* Task Stages */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-3 pb-6">
            {tasksByStage.map((stage) => (
              <div key={stage.stage} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedStage(expandedStage === stage.stage ? null : stage.stage)}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {stage.isComplete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center text-xs font-medium ${
                        stage.stage === client.current_stage 
                          ? 'border-primary text-primary' 
                          : 'border-muted-foreground/30 text-muted-foreground'
                      }`}>
                        {stage.stage}
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium">{stage.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {stage.completedCount}/{stage.totalCount} completed
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${
                    stageToShow === stage.stage ? 'rotate-90' : ''
                  }`} />
                </button>

                {stageToShow === stage.stage && (
                  <div className="border-t bg-muted/20 p-3 space-y-2">
                    {isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading tasks...</p>
                    ) : stage.tasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No tasks found</p>
                    ) : (
                      stage.tasks.map((task) => (
                        <div 
                          key={task.id}
                          className="flex items-start gap-3 p-2 rounded-md hover:bg-background/50"
                        >
                          <Checkbox
                            id={task.id}
                            checked={task.is_completed}
                            onCheckedChange={(checked) => {
                              toggleTask.mutate({ 
                                taskId: task.id, 
                                isCompleted: checked === true 
                              });
                            }}
                            disabled={toggleTask.isPending}
                          />
                          <label 
                            htmlFor={task.id}
                            className={`text-sm cursor-pointer flex-1 ${
                              task.is_completed ? 'text-muted-foreground line-through' : ''
                            }`}
                          >
                            {task.task_label}
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
