import { useState, useRef } from "react";
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
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2 } from "@/components/ui-v2";
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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PipelineColumn } from "@/components/onboarding/PipelineColumn";
import { PipelineCard } from "@/components/onboarding/PipelineCard";

const OFFBOARDING_STAGES = [
  { stage: 1, title: 'Cancellation Request', color: 'bg-red-500' },
  { stage: 2, title: 'Campaign Wind-Down', color: 'bg-orange-500' },
  { stage: 3, title: 'Data Handover', color: 'bg-amber-500' },
  { stage: 4, title: 'Account Closure', color: 'bg-purple-500' },
  { stage: 5, title: 'Final Invoice', color: 'bg-blue-500' },
  { stage: 6, title: 'Completed', color: 'bg-green-500' },
];

const STAGE_TASKS: Record<number, { key: string; label: string }[]> = {
  1: [
    { key: 'receive_notice', label: 'Receive cancellation notice' },
    { key: 'confirm_reason', label: 'Confirm reason for cancellation' },
    { key: 'retention_attempt', label: 'Attempt retention conversation' },
    { key: 'approve_cancellation', label: 'Approve cancellation' },
  ],
  2: [
    { key: 'pause_campaigns', label: 'Pause active campaigns' },
    { key: 'notify_setters', label: 'Notify assigned setters' },
    { key: 'complete_pending', label: 'Complete pending meetings' },
    { key: 'stop_outreach', label: 'Stop outbound outreach' },
  ],
  3: [
    { key: 'export_data', label: 'Export client data & reports' },
    { key: 'share_metrics', label: 'Share final metrics report' },
    { key: 'transfer_leads', label: 'Transfer warm leads' },
    { key: 'handover_docs', label: 'Handover documentation' },
  ],
  4: [
    { key: 'revoke_access', label: 'Revoke portal access' },
    { key: 'remove_credentials', label: 'Remove stored credentials' },
    { key: 'unassign_setters', label: 'Unassign setters' },
    { key: 'archive_client', label: 'Archive client profile' },
  ],
  5: [
    { key: 'calculate_final', label: 'Calculate final balance' },
    { key: 'send_invoice', label: 'Send final invoice' },
    { key: 'confirm_payment', label: 'Confirm payment received' },
    { key: 'close_accounting', label: 'Close accounting record' },
  ],
  6: [
    { key: 'confirm_complete', label: 'Confirm all tasks complete' },
    { key: 'send_farewell', label: 'Send farewell communication' },
    { key: 'request_feedback', label: 'Request exit feedback' },
  ],
};

interface ClientOffboarding {
  id: string;
  client_profile_id: string;
  current_stage: number;
  reason: string | null;
  assigned_csm_id: string | null;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  company_name?: string;
  logo?: string | null;
}

interface OffboardingTask {
  id: string;
  client_offboarding_id: string;
  stage: number;
  task_key: string;
  task_label: string;
  is_completed: boolean;
  completed_at: string | null;
}

const CSMOffboarding = () => {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<ClientOffboarding | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [newReason, setNewReason] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<ClientOffboarding | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Fetch active clients for the add modal
  const { data: activeClients = [] } = useQuery({
    queryKey: ['active-clients-for-offboarding'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_profiles')
        .select('id, company_name, logo')
        .eq('status', 'active')
        .order('company_name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: offboardingRecords = [], isLoading, refetch } = useQuery({
    queryKey: ['client-offboarding-pipeline'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_offboarding_stages')
        .select(`
          *,
          client_profiles!inner (company_name, logo)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Soft-removed rows stay in the table (full history) but leave the
      // board. Filtered client-side so the query still works before the
      // removed_at migration is applied.
      return (data || [])
        .filter((r) => !(r as { removed_at?: string | null }).removed_at)
        .map((r: any) => ({
          ...r,
          company_name: r.client_profiles?.company_name || 'Unknown',
          logo: r.client_profiles?.logo || null,
        })) as ClientOffboarding[];
    },
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['client-offboarding-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_offboarding_tasks')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as OffboardingTask[];
    },
  });

  const moveToStage = useMutation({
    mutationFn: async ({ id, newStage }: { id: string; newStage: number }) => {
      const { error } = await supabase
        .from('client_offboarding_stages')
        .update({
          current_stage: newStage,
          completed_at: newStage === 6 ? new Date().toISOString() : null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offboarding-pipeline'] });
      toast.success('Stage updated');
    },
    onError: () => toast.error('Failed to update stage'),
  });

  const toggleTask = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('client_offboarding_tasks')
        .update({
          is_completed: completed,
          completed_at: completed ? new Date().toISOString() : null,
          completed_by: completed ? user.user?.id : null,
        })
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offboarding-tasks'] });
    },
  });

  const addOffboarding = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();

      const { data: record, error } = await supabase
        .from('client_offboarding_stages')
        .insert({
          client_profile_id: selectedClientId,
          reason: newReason || null,
          assigned_csm_id: user.user?.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Create tasks for all stages
      const allTaskInserts: any[] = [];
      for (const stage of OFFBOARDING_STAGES) {
        const tasks = STAGE_TASKS[stage.stage] || [];
        tasks.forEach(t => {
          allTaskInserts.push({
            client_offboarding_id: record.id,
            stage: stage.stage,
            task_key: t.key,
            task_label: t.label,
          });
        });
      }
      if (allTaskInserts.length > 0) {
        await supabase.from('client_offboarding_tasks').insert(allTaskInserts);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offboarding-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['client-offboarding-tasks'] });
      toast.success('Client added to offboarding pipeline');
      setAddModalOpen(false);
      setSelectedClientId('');
      setNewReason('');
    },
    onError: () => toast.error('Failed to add client'),
  });

  // Remove from the board — soft-remove only, mirroring onboarding: the
  // stage row and its task history are kept (removed_at stamp).
  const removeFromBoard = useMutation({
    mutationFn: async (record: ClientOffboarding) => {
      const { error } = await supabase
        .from('client_offboarding_stages')
        .update({ removed_at: new Date().toISOString() } as never)
        .eq('id', record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offboarding-pipeline'] });
      toast.success('Removed from the offboarding board — record and history kept');
      setConfirmRemove(null);
      setDetailOpen(false);
    },
    onError: () => {
      toast.error('Failed to remove — has the offboarding soft-remove migration been applied?');
      setConfirmRemove(null);
    },
  });

  const markInactive = useMutation({
    mutationFn: async (clientProfileId: string) => {
      const { error } = await supabase
        .from('client_profiles')
        .update({ status: 'inactive' })
        .eq('id', clientProfileId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-offboarding-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['active-clients-for-offboarding'] });
      toast.success('Client marked inactive — all historical data retained');
      setDetailOpen(false);
    },
    onError: () => toast.error('Failed to mark client inactive'),
  });

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const overId = over.id as string;
    if (overId.startsWith('stage-')) {
      const newStage = parseInt(overId.replace('stage-', ''));
      const record = offboardingRecords.find(r => r.id === (active.id as string));
      if (record && record.current_stage !== newStage) {
        moveToStage.mutate({ id: record.id, newStage });
      }
    }
  };

  const clientsByStage = OFFBOARDING_STAGES.reduce((acc, stage) => {
    acc[stage.stage] = offboardingRecords.filter(r => r.current_stage === stage.stage);
    return acc;
  }, {} as Record<number, ClientOffboarding[]>);

  const activeRecord = activeId ? offboardingRecords.find(r => r.id === activeId) : null;

  const getTasksForRecord = (recordId: string, stage: number) =>
    allTasks.filter(t => t.client_offboarding_id === recordId && t.stage === stage);

  const getProgressForRecord = (recordId: string) => {
    const recordTasks = allTasks.filter(t => t.client_offboarding_id === recordId);
    if (recordTasks.length === 0) return 0;
    return Math.round((recordTasks.filter(t => t.is_completed).length / recordTasks.length) * 100);
  };

  const handleCardClick = (record: ClientOffboarding) => {
    setSelectedRecord(record);
    setDetailOpen(true);
  };

  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' });
  const scrollRight = () => scrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' });

  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
        <PageHeader
          title="Client Offboarding"
          subtitle="Manage client departure workflow across 6 stages"
          actions={<div className="flex items-center gap-[6px]">
            <ButtonV2 size="sm" onClick={() => refetch()}>Refresh</ButtonV2>
            <ButtonV2 size="sm" variant="primary" onClick={() => setAddModalOpen(true)}>Start offboarding</ButtonV2>
          </div>}
        />

        {isLoading ? (
          <div className="flex gap-4 overflow-hidden">
            {OFFBOARDING_STAGES.map((s) => (
              <Skeleton key={s.stage} className="h-[400px] w-[280px] rounded-lg shrink-0" />
            ))}
          </div>
        ) : offboardingRecords.length === 0 ? (
          <div className="border-t border-[var(--line)] py-10 text-center">
            <p className="text-[12px] text-[var(--dim)]">No client offboarding records yet.</p>
            <p className="mt-1 text-[11.5px] text-[var(--dim)]">Click "Start offboarding" to begin the departure process for a client.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="relative">
              <Button variant="outline" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-[var(--surf2)] border-[var(--line2)] -ml-3" aria-label="Scroll left" onClick={scrollLeft}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button variant="outline" size="icon" className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-[var(--surf2)] border-[var(--line2)] -mr-3" aria-label="Scroll right" onClick={scrollRight}>
                <ChevronRight className="h-5 w-5" />
              </Button>

              <div ref={scrollRef} className="overflow-x-auto scrollbar-hide px-6" style={{ scrollbarWidth: 'none' }}>
                <div className="flex gap-4 pb-4">
                  {OFFBOARDING_STAGES.map((stage) => {
                    const stageClients = clientsByStage[stage.stage] || [];
                    return (
                      <PipelineColumn
                        key={stage.stage}
                        id={`stage-${stage.stage}`}
                        title={stage.title}
                        count={stageClients.length}
                        badgeColor={stage.color}
                        itemIds={stageClients.map(c => c.id)}
                        emptyMessage="Drop clients here"
                      >
                        {stageClients.map((client) => (
                          <PipelineCard
                            key={client.id}
                            id={client.id}
                            title={client.company_name || 'Unknown'}
                            avatarSrc={client.logo}
                            avatarFallback={client.company_name || 'C'}
                            progress={getProgressForRecord(client.id)}
                            progressLabel="Tasks"
                            showActions
                            onClick={() => handleCardClick(client)}
                            onDelete={() => setConfirmRemove(client)}
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
                  title={activeRecord.company_name || 'Unknown'}
                  avatarSrc={activeRecord.logo}
                  avatarFallback={activeRecord.company_name || 'C'}
                  isDragOverlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* Detail Sheet */}
        <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
          <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{selectedRecord?.company_name || 'Client'}</SheetTitle>
            </SheetHeader>
            {selectedRecord && (
              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Current Stage</span>
                    <Badge className={OFFBOARDING_STAGES.find(s => s.stage === selectedRecord.current_stage)?.color + ' text-white'}>
                      {OFFBOARDING_STAGES.find(s => s.stage === selectedRecord.current_stage)?.title}
                    </Badge>
                  </div>
                  {selectedRecord.reason && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Reason</span>
                      <span className="text-sm font-medium">{selectedRecord.reason}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Progress</span>
                    <span className="text-sm font-medium">{getProgressForRecord(selectedRecord.id)}%</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm">Checklist</h3>
                  {OFFBOARDING_STAGES.map(stage => {
                    const tasks = getTasksForRecord(selectedRecord.id, stage.stage);
                    if (tasks.length === 0) return null;
                    const completedCount = tasks.filter(t => t.is_completed).length;
                    return (
                      <div key={stage.stage} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{stage.title}</span>
                          <span className="text-xs text-muted-foreground">{completedCount}/{tasks.length}</span>
                        </div>
                        {tasks.map(task => (
                          <div key={task.id} className="flex items-center gap-3 pl-1">
                            <Checkbox
                              checked={task.is_completed}
                              onCheckedChange={(checked) => toggleTask.mutate({ taskId: task.id, completed: !!checked })}
                            />
                            <span className={`text-sm ${task.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                              {task.task_label}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-border space-y-2">
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={selectedRecord.current_stage !== 6 || markInactive.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Mark ${selectedRecord.company_name} as inactive? They will be removed from active views; all historical data is retained.`
                        )
                      ) {
                        markInactive.mutate(selectedRecord.client_profile_id);
                      }
                    }}
                  >
                    Mark Client Inactive
                  </Button>
                  {selectedRecord.current_stage !== 6 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Move the client to "Completed" to enable marking them inactive.
                    </p>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Confirm remove-from-board (soft-remove) */}
        <AlertDialog open={!!confirmRemove} onOpenChange={(v) => { if (!v) setConfirmRemove(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from Offboarding</AlertDialogTitle>
              <AlertDialogDescription>
                Remove "{confirmRemove?.company_name}" from the offboarding board? Nothing is
                deleted — the offboarding record and task history are kept, and the client can
                be re-added later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => confirmRemove && removeFromBoard.mutate(confirmRemove)}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Add Client Modal */}
        <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start Client Offboarding</DialogTitle>
              <DialogDescription>
                Select a client to begin the offboarding process.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Client</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeClients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason for Departure</Label>
                <Textarea value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="Budget, performance, pivot, etc." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
              <Button
                onClick={() => addOffboarding.mutate()}
                disabled={!selectedClientId || addOffboarding.isPending}
              >
                Start Offboarding
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  );
};

export default CSMOffboarding;
