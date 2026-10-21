import { useState, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Eyebrow, FactsStrip, Panel, Pill } from "@/components/ui-v2";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import { PipelineColumn } from "@/components/onboarding/PipelineColumn";
import { PipelineCard } from "@/components/onboarding/PipelineCard";

const ONBOARDING_STAGES = [
  { id: 'screening', label: 'Screening', color: 'bg-slate-500' },
  { id: 'interview', label: 'Interview', color: 'bg-blue-500' },
  { id: 'live_call', label: 'Live Call', color: 'bg-cyan-500' },
  { id: 'final_interview', label: 'Final Interview', color: 'bg-purple-500' },
  { id: 'offer_letter', label: 'Offer Letter', color: 'bg-amber-500' },
  { id: 'training', label: 'Training & Resources', color: 'bg-emerald-500' },
  { id: 'account_setup', label: 'Account Setup', color: 'bg-green-500' },
];

interface EmployeeOnboarding {
  id: string;
  stage: string;
  candidate_id: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
  target_role: string | null;
  target_department: string | null;
  employee_id: string | null;
  user_id: string | null;
  notes: string | null;
  created_at: string;
}

interface OnboardingTask {
  id: string;
  onboarding_id: string;
  stage: string;
  task_key: string;
  task_label: string;
  is_completed: boolean;
  completed_at: string | null;
}

/** The secondary ButtonV2 look on an anchor (the preview opens a new tab). */
const SECONDARY_LINK_CLASS =
  "inline-flex items-center gap-[6px] rounded-md border border-[var(--line2)] bg-transparent px-2 py-[3px] font-body text-[11.5px] font-semibold text-[var(--ink)] transition-colors duration-150 hover:bg-[var(--surf2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

export default function HROnboarding() {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<EmployeeOnboarding | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [accountRole, setAccountRole] = useState('setter');
  const [accountDepartment, setAccountDepartment] = useState('operations');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'complete'; record: EmployeeOnboarding } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const { data: onboardingRecords = [], isLoading, refetch } = useQuery({
    queryKey: ['employee-onboarding'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_onboarding')
        .select('*')
        .neq('stage', 'cancelled')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as EmployeeOnboarding[];
    }
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['employee-onboarding-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_onboarding_tasks')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as OnboardingTask[];
    }
  });

  const moveToStage = useMutation({
    mutationFn: async ({ id, newStage }: { id: string; newStage: string }) => {
      const { error } = await supabase
        .from('employee_onboarding')
        .update({ stage: newStage })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-onboarding'] });
      toast.success('Stage updated');
    },
    onError: () => toast.error('Failed to update stage'),
  });

  const toggleTask = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('employee_onboarding_tasks')
        .update({
          is_completed: completed,
          completed_at: completed ? new Date().toISOString() : null,
          completed_by: completed ? user.user?.id : null,
        })
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-onboarding-tasks'] });
    },
  });

  const handleCreateAccount = async () => {
    if (!selectedRecord) return;
    setCreatingAccount(true);

    try {
      // Map department selection to setter department value
      const setterDept = accountDepartment === 'sales' ? 'acquisition' : 'fulfilment';
      // Map department to department access
      const deptAccess = accountDepartment === 'sales' ? ['sales'] : ['operations'];

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: selectedRecord.candidate_email,
          displayName: selectedRecord.candidate_name,
          role: accountRole,
          setterDepartment: setterDept,
          departmentAccess: deptAccess,
        },
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Failed to create account');

      // Update onboarding record
      await supabase
        .from('employee_onboarding')
        .update({
          stage: 'completed',
          target_role: accountRole,
          target_department: accountDepartment,
          stage_completed_at: new Date().toISOString(),
          user_id: data.user_id,
        })
        .eq('id', selectedRecord.id);

      // Update candidate status
      if (selectedRecord.candidate_id) {
        await supabase
          .from('candidates')
          .update({ status: 'hired' })
          .eq('id', selectedRecord.candidate_id);
      }

      queryClient.invalidateQueries({ queryKey: ['employee-onboarding'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['employees-directory'] });

      toast.success(`Employee account created! Temporary password: ${data.tempPassword}`, { duration: 8000 });
      setCreateAccountOpen(false);
      setDetailOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create employee account');
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const recordId = active.id as string;
    const overId = over.id as string;

    if (overId.startsWith('stage-')) {
      const newStage = overId.replace('stage-', '');
      const record = onboardingRecords.find(r => r.id === recordId);
      if (record && record.stage !== newStage) {
        moveToStage.mutate({ id: recordId, newStage });
      }
    }
  };

  const recordsByStage = ONBOARDING_STAGES.reduce((acc, stage) => {
    acc[stage.id] = onboardingRecords.filter((r) => r.stage === stage.id);
    return acc;
  }, {} as Record<string, EmployeeOnboarding[]>);

  const activeRecord = activeId ? onboardingRecords.find(r => r.id === activeId) : null;

  const getTasksForRecord = (recordId: string, stage: string) =>
    allTasks.filter(t => t.onboarding_id === recordId && t.stage === stage);

  const getProgressForRecord = (recordId: string) => {
    const recordTasks = allTasks.filter(t => t.onboarding_id === recordId);
    if (recordTasks.length === 0) return 0;
    const completed = recordTasks.filter(t => t.is_completed).length;
    return Math.round((completed / recordTasks.length) * 100);
  };

  const handleCardClick = (record: EmployeeOnboarding) => {
    setSelectedRecord(record);
    setDetailOpen(true);
  };

  // Complete onboarding (mark as completed stage)
  const completeOnboarding = useMutation({
    mutationFn: async (record: EmployeeOnboarding) => {
      const { error } = await supabase
        .from('employee_onboarding')
        .update({ stage: 'completed', stage_completed_at: new Date().toISOString() } as any)
        .eq('id', record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-onboarding'] });
      toast.success('Employee onboarding marked as complete');
      setConfirmAction(null);
    },
    onError: () => { toast.error('Failed to complete onboarding'); setConfirmAction(null); },
  });

  // Remove from onboarding
  const removeFromOnboarding = useMutation({
    mutationFn: async (record: EmployeeOnboarding) => {
      await supabase.from('employee_onboarding_tasks').delete().eq('onboarding_id', record.id);
      const { error } = await supabase.from('employee_onboarding').delete().eq('id', record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-onboarding'] });
      queryClient.invalidateQueries({ queryKey: ['employee-onboarding-tasks'] });
      toast.success('Employee removed from onboarding');
      setConfirmAction(null);
    },
    onError: () => { toast.error('Failed to remove employee'); setConfirmAction(null); },
  });

  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' });
  const scrollRight = () => scrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' });

  const selectedStage = selectedRecord ? ONBOARDING_STAGES.find(s => s.id === selectedRecord.stage) : null;

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Employee Onboarding"
          subtitle="Track new hires through 7-stage onboarding pipeline"
          actions={
            <div className="flex items-center gap-[6px]">
              <a href="/onboarding/preview" target="_blank" rel="noreferrer" className={SECONDARY_LINK_CLASS}>
                Preview as new starter
              </a>
              <ButtonV2 size="sm" onClick={() => refetch()}>
                Refresh
              </ButtonV2>
            </div>
          }
        />

        {isLoading ? (
          <div className="flex gap-4 overflow-hidden">
            {ONBOARDING_STAGES.map((stage) => (
              <Skeleton key={stage.id} className="h-[400px] w-[280px] shrink-0 rounded-lg" />
            ))}
          </div>
        ) : onboardingRecords.length === 0 ? (
          <Panel title="Pipeline" aside={<Pill>0</Pill>}>
            <div className="py-[26px] text-center">
              <p className="text-[12.5px] text-[var(--dim)]">No employee onboarding records yet.</p>
              <p className="mt-1 text-[11.5px] text-[var(--dim)]">
                Send candidates from Hiring Management → Actions → "Send to Employee Onboarding"
              </p>
            </div>
          </Panel>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="relative">
              <ButtonV2
                variant="ghost"
                size="sm"
                aria-label="Scroll pipeline left"
                className="absolute left-0 top-1/2 z-10 -ml-3 h-8 w-8 -translate-y-1/2 justify-center rounded-full border border-[var(--line2)] bg-[var(--bg)] px-0"
                onClick={scrollLeft}
              >
                <ChevronLeft className="h-4 w-4" />
              </ButtonV2>
              <ButtonV2
                variant="ghost"
                size="sm"
                aria-label="Scroll pipeline right"
                className="absolute right-0 top-1/2 z-10 -mr-3 h-8 w-8 -translate-y-1/2 justify-center rounded-full border border-[var(--line2)] bg-[var(--bg)] px-0"
                onClick={scrollRight}
              >
                <ChevronRight className="h-4 w-4" />
              </ButtonV2>

              <div ref={scrollRef} className="scrollbar-hide overflow-x-auto px-6" style={{ scrollbarWidth: 'none' }}>
                <div className="flex gap-4 pb-4">
                  {ONBOARDING_STAGES.map((stage) => {
                    const stageRecords = recordsByStage[stage.id] || [];
                    return (
                      <PipelineColumn
                        key={stage.id}
                        id={`stage-${stage.id}`}
                        title={stage.label}
                        count={stageRecords.length}
                        badgeColor={stage.color}
                        itemIds={stageRecords.map(r => r.id)}
                        emptyMessage="No employees"
                      >
                        {stageRecords.map((record) => (
                          <PipelineCard
                            key={record.id}
                            id={record.id}
                            title={record.candidate_name || 'Unknown'}
                            subtitle={record.candidate_email || undefined}
                            avatarFallback={record.candidate_name || 'U'}
                            icon={<User className="h-4 w-4 text-muted-foreground" />}
                            progress={getProgressForRecord(record.id)}
                            progressLabel="Tasks"
                            showActions
                            onClick={() => handleCardClick(record)}
                            onOpen={() => setConfirmAction({ type: 'complete', record })}
                            onDelete={() => setConfirmAction({ type: 'delete', record })}
                          />
                        ))}
                      </PipelineColumn>
                    );
                  })}
                </div>
              </div>
            </div>

            <DragOverlay>
              {activeRecord ? (
                <PipelineCard
                  id={activeRecord.id}
                  title={activeRecord.candidate_name || 'Unknown'}
                  subtitle={activeRecord.candidate_email || undefined}
                  avatarFallback={activeRecord.candidate_name || 'U'}
                  icon={<User className="h-4 w-4 text-muted-foreground" />}
                  isDragOverlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* Detail Sheet */}
        <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
          <SheetContent className="w-[500px] overflow-y-auto sm:max-w-[500px]">
            <SheetHeader>
              <SheetTitle className="font-head text-[22px] font-medium tracking-[-0.02em]">{selectedRecord?.candidate_name || 'Employee'}</SheetTitle>
            </SheetHeader>

            {selectedRecord && (
              <div className="mt-5 space-y-6">
                {/* Info */}
                <FactsStrip
                  facts={[
                    { label: "Email", value: <span className="break-all font-body text-[12px] font-normal">{selectedRecord.candidate_email || '—'}</span> },
                    { label: "Stage", value: <Pill variant="info">{selectedStage?.label ?? selectedRecord.stage}</Pill> },
                    { label: "Progress", value: `${getProgressForRecord(selectedRecord.id)}%` },
                  ]}
                />

                {/* Tasks by Stage */}
                <Panel title="Checklist">
                  <div className="space-y-4 pt-3">
                    {ONBOARDING_STAGES.map(stage => {
                      const tasks = getTasksForRecord(selectedRecord.id, stage.id);
                      if (tasks.length === 0) return null;
                      const completedCount = tasks.filter(t => t.is_completed).length;
                      return (
                        <div key={stage.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Eyebrow>{stage.label}</Eyebrow>
                            <span className="font-mono text-[11px] text-[var(--dim)]">{completedCount}/{tasks.length}</span>
                          </div>
                          {tasks.map(task => (
                            <label key={task.id} className="flex cursor-pointer items-center gap-3 pl-1">
                              <Checkbox
                                checked={task.is_completed}
                                onCheckedChange={(checked) => toggleTask.mutate({ taskId: task.id, completed: !!checked })}
                              />
                              <span className={`text-[12.5px] ${task.is_completed ? 'text-[var(--dim)] line-through' : ''}`}>
                                {task.task_label}
                              </span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </Panel>

                {/* Create Employee Account Button - only on account_setup stage */}
                {selectedRecord.stage === 'account_setup' && (
                  <div className="border-t border-[var(--line)] pt-4">
                    <ButtonV2
                      variant="primary"
                      className="w-full justify-center"
                      onClick={() => setCreateAccountOpen(true)}
                    >
                      Create Employee Account
                    </ButtonV2>
                    <p className="mt-2 text-center text-[11.5px] text-[var(--dim)]">
                      This will create a user account and add them to the Employee Hub
                    </p>
                  </div>
                )}
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Create Account Dialog */}
        <Dialog open={createAccountOpen} onOpenChange={setCreateAccountOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Employee Account</DialogTitle>
              <DialogDescription>
                Set up the application account for {selectedRecord?.candidate_name}.
                The default password will be <code className="rounded bg-[var(--surf2)] px-1 font-mono">test123</code>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label>Role</Label>
                <Select value={accountRole} onValueChange={setAccountRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="setter">Setter / SDR</SelectItem>
                    <SelectItem value="account_executive">Account Executive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Department</Label>
                <Select value={accountDepartment} onValueChange={setAccountDepartment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operations">Operations (Fulfilment)</SelectItem>
                    <SelectItem value="sales">Sales (Acquisition)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <FactsStrip
                facts={[
                  { label: "Name", value: <span className="font-body font-normal">{selectedRecord?.candidate_name || '—'}</span> },
                  { label: "Email", value: <span className="break-all font-body text-[12px] font-normal">{selectedRecord?.candidate_email || '—'}</span> },
                  { label: "Password", value: "test123" },
                ]}
              />
            </div>

            <DialogFooter>
              <ButtonV2 onClick={() => setCreateAccountOpen(false)}>
                Cancel
              </ButtonV2>
              <ButtonV2 variant="primary" onClick={handleCreateAccount} disabled={creatingAccount}>
                {creatingAccount ? 'Creating...' : 'Create Account & Complete Onboarding'}
              </ButtonV2>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Complete / Delete Dialog */}
        <AlertDialog open={!!confirmAction} onOpenChange={(v) => { if (!v) setConfirmAction(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmAction?.type === 'delete' ? 'Remove from Onboarding' : 'Complete Onboarding'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction?.type === 'delete'
                  ? `Are you sure you want to remove "${confirmAction?.record.candidate_name}" from the onboarding pipeline? This will delete all onboarding tasks.`
                  : `Mark "${confirmAction?.record.candidate_name}" onboarding as complete? This will move them out of the pipeline.`
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={confirmAction?.type === 'delete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
                onClick={() => {
                  if (!confirmAction) return;
                  if (confirmAction.type === 'delete') {
                    removeFromOnboarding.mutate(confirmAction.record);
                  } else {
                    completeOnboarding.mutate(confirmAction.record);
                  }
                }}
              >
                {confirmAction?.type === 'delete' ? 'Remove' : 'Complete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </DashboardLayout>
  );
}
