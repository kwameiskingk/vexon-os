import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Target, Clock, Plus, Edit2, X, History, CalendarDays } from "lucide-react";
import { format, addDays, differenceInDays, startOfWeek, endOfWeek } from "date-fns";

interface ClientProfile {
  id: string;
  company_name: string;
  kpi_meeting_requirements: number | null;
  logo: string | null;
}

interface Assignment {
  id: string;
  setter_id: string;
  client_id: string;
  meeting_target: number;
  duration_days: number;
  meetings_completed: number;
  started_at: string;
  ends_at: string;
  completed_at: string | null;
  status: string;
  lead_list_id?: string | null;
  client_profiles?: ClientProfile;
}

interface ClientLeadList {
  id: string;
  name: string;
  list_type?: string | null;
  is_default?: boolean;
}

interface SetterClientsTabProps {
  setterId: string;
  department: string;
  onUpdate?: () => void;
}

export function SetterClientsTab({ setterId, department, onUpdate }: SetterClientsTabProps) {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [activeAssignments, setActiveAssignments] = useState<Assignment[]>([]);
  const [pastAssignments, setPastAssignments] = useState<Assignment[]>([]);
  const [rosterEntries, setRosterEntries] = useState<Array<{ id: string; roster_date: string; client_profiles: { company_name: string; logo: string | null } | null }>>([]); 
  const [isAssigning, setIsAssigning] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [meetingTarget, setMeetingTarget] = useState(2);
  const [durationDays, setDurationDays] = useState(30);
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const [clientLeadLists, setClientLeadLists] = useState<ClientLeadList[]>([]);
  const [selectedLeadListId, setSelectedLeadListId] = useState<string>("");
  const [leadListNames, setLeadListNames] = useState<Record<string, string>>({});

  const MAX_ACTIVE_ASSIGNMENTS = 5;

  useEffect(() => {
    loadClients();
    loadAssignments();
    loadRosterEntries();
  }, [setterId]);

  useEffect(() => {
    if (selectedClientId) {
      const client = clients.find(c => c.id === selectedClientId);
      setSelectedClient(client || null);
      loadClientLeadLists(selectedClientId);
    } else {
      setSelectedClient(null);
      setClientLeadLists([]);
      setSelectedLeadListId("");
    }
  }, [selectedClientId, clients]);

  // Lead lists for the chosen client. If the client has a default list (or
  // exactly one list) it's preselected; the CSM can still override or clear.
  const loadClientLeadLists = async (clientId: string) => {
    const { data, error } = await supabase
      .from("client_lead_lists")
      .select("*")
      .eq("client_profile_id", clientId)
      .neq("status", "rejected")
      .order("created_at", { ascending: false });
    const lists = error ? [] : ((data || []) as unknown as ClientLeadList[]);
    setClientLeadLists(lists);
    const preselected = lists.find(l => l.is_default) || (lists.length === 1 ? lists[0] : null);
    setSelectedLeadListId(preselected?.id || "");
  };

  const loadClients = async () => {
    const { data } = await supabase
      .from("client_profiles")
      .select("id, company_name, kpi_meeting_requirements, logo")
      .eq("status", "active")
      .order("company_name");
    
    if (data) {
      setClients(data);
    }
  };

  const loadRosterEntries = async () => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

    const { data } = await supabase
      .from("roster_entries")
      .select("id, roster_date, client_profiles!inner(company_name, logo)")
      .eq("setter_profile_id", setterId)
      .gte("roster_date", format(weekStart, 'yyyy-MM-dd'))
      .lte("roster_date", format(weekEnd, 'yyyy-MM-dd'))
      .order("roster_date", { ascending: true });

    if (data) {
      setRosterEntries(data as any);
    }
  };

  const loadAssignments = async () => {
    const { data: active } = await supabase
      .from("setter_client_assignments")
      .select(`
        *,
        client_profiles (
          id,
          company_name,
          kpi_meeting_requirements,
          logo
        )
      `)
      .eq("setter_id", setterId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (active && active.length > 0) {
      setActiveAssignments(active as Assignment[]);
      // Resolve lead-list names for badges. lead_list_id is absent until the
      // lead-list migration runs, so this no-ops pre-migration.
      const listIds = [...new Set(active.map((a) => (a as Assignment).lead_list_id).filter(Boolean))] as string[];
      if (listIds.length > 0) {
        const { data: lists } = await supabase
          .from("client_lead_lists")
          .select("id, name")
          .in("id", listIds);
        setLeadListNames(Object.fromEntries((lists || []).map((l) => [l.id, l.name])));
      }
    } else {
      setActiveAssignments([]);
    }

    const { data: past } = await supabase
      .from("setter_client_assignments")
      .select(`
        *,
        client_profiles (
          id,
          company_name,
          kpi_meeting_requirements,
          logo
        )
      `)
      .eq("setter_id", setterId)
      .neq("status", "active")
      .order("completed_at", { ascending: false })
      .limit(5);

    if (past) {
      setPastAssignments(past as Assignment[]);
    }
  };

  const handleAssign = async () => {
    if (!selectedClientId) {
      toast.error("Please select a client");
      return;
    }

    if (activeAssignments.length >= MAX_ACTIVE_ASSIGNMENTS) {
      toast.error(`Maximum ${MAX_ACTIVE_ASSIGNMENTS} active assignments allowed`);
      return;
    }

    if (activeAssignments.some(a => a.client_id === selectedClientId)) {
      toast.error("Setter is already assigned to this client");
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const endsAt = addDays(new Date(), durationDays);

      const { error } = await supabase
        .from("setter_client_assignments")
        .insert({
          setter_id: setterId,
          client_id: selectedClientId,
          meeting_target: meetingTarget,
          duration_days: durationDays,
          started_at: new Date().toISOString(),
          ends_at: endsAt.toISOString(),
          created_by: user?.id,
          lead_list_id: selectedLeadListId || null,
        } as never);

      if (error) throw error;

      toast.success("Client assigned successfully");
      setIsAssigning(false);
      setSelectedClientId("");
      setSelectedLeadListId("");
      setMeetingTarget(3);
      setDurationDays(30);
      loadAssignments();
      onUpdate?.();
    } catch (error: any) {
      console.error("Assignment error:", error);
      if (error.message?.includes("more than 5")) {
        toast.error("Maximum 5 active assignments allowed");
      } else {
        toast.error("Failed to assign client");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateAssignment = async (assignmentId: string) => {
    const assignment = activeAssignments.find(a => a.id === assignmentId);
    if (!assignment) return;

    setIsSaving(true);
    try {
      const endsAt = addDays(new Date(assignment.started_at), durationDays);

      const { error } = await supabase
        .from("setter_client_assignments")
        .update({
          meeting_target: meetingTarget,
          duration_days: durationDays,
          ends_at: endsAt.toISOString()
        })
        .eq("id", assignmentId);

      if (error) throw error;

      toast.success("Assignment updated");
      setEditingAssignmentId(null);
      loadAssignments();
      onUpdate?.();
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update assignment");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEndAssignment = async (assignmentId: string) => {
    if (!confirm("Are you sure you want to end this assignment?")) return;

    try {
      const { error } = await supabase
        .from("setter_client_assignments")
        .update({
          status: "cancelled",
          completed_at: new Date().toISOString()
        })
        .eq("id", assignmentId);

      if (error) throw error;

      toast.success("Assignment ended");
      loadAssignments();
      onUpdate?.();
    } catch (error) {
      console.error("End assignment error:", error);
      toast.error("Failed to end assignment");
    }
  };

  const calculatePacing = (assignment: Assignment): { status: string; label: string } => {
    const now = new Date();
    const startDate = new Date(assignment.started_at);
    const totalDays = assignment.duration_days;
    const daysElapsed = differenceInDays(now, startDate);
    const percentTimeElapsed = Math.min(daysElapsed / totalDays, 1);
    const percentMeetingsCompleted = assignment.meetings_completed / assignment.meeting_target;

    if (percentMeetingsCompleted >= percentTimeElapsed + 0.1) {
      return { status: 'ahead', label: 'Ahead' };
    }
    if (percentMeetingsCompleted >= percentTimeElapsed - 0.1) {
      return { status: 'on_track', label: 'On Track' };
    }
    return { status: 'behind', label: 'Behind' };
  };

  // Only show for fulfillment setters
  if (department !== 'fulfilment') {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        Client assignments are only available for Fulfilment setters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Roster Schedule for This Week */}
      {rosterEntries.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">This Week's Roster</span>
          </div>
          <div className="space-y-1.5">
            {rosterEntries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
                    {entry.client_profiles?.logo ? (
                      <img src={entry.client_profiles.logo} alt="" className="w-4 h-4 rounded object-cover" />
                    ) : (
                      <Building2 className="h-3 w-3 text-primary" />
                    )}
                  </div>
                  <span className="text-sm font-medium">{entry.client_profiles?.company_name || 'Client'}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {format(new Date(entry.roster_date + 'T00:00:00'), 'EEE, MMM d')}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Active Assignments</span>
          {activeAssignments.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {activeAssignments.length}/{MAX_ACTIVE_ASSIGNMENTS}
            </Badge>
          )}
        </div>
        {activeAssignments.length < MAX_ACTIVE_ASSIGNMENTS && !isAssigning && (
          <Button variant="outline" size="sm" onClick={() => setIsAssigning(true)}>
            <Plus className="h-3 w-3 mr-1" />
            Assign
          </Button>
        )}
      </div>

      {/* Active Assignments */}
      {activeAssignments.length > 0 ? (
        <div className="space-y-2">
          {activeAssignments.map((assignment) => (
            <Card key={assignment.id} className="p-3 bg-card/50">
              {editingAssignmentId === assignment.id ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">{assignment.client_profiles?.company_name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Target</Label>
                      <Input
                        type="number"
                        min={1}
                        value={meetingTarget}
                        onChange={(e) => setMeetingTarget(Number(e.target.value))}
                        className="h-8 mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Days</Label>
                      <Input
                        type="number"
                        min={1}
                        value={durationDays}
                        onChange={(e) => setDurationDays(Number(e.target.value))}
                        className="h-8 mt-1"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm"
                      onClick={() => handleUpdateAssignment(assignment.id)} 
                      disabled={isSaving}
                      className="flex-1 h-7"
                    >
                      {isSaving ? "..." : "Save"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditingAssignmentId(null)} className="h-7">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded bg-primary/20 flex items-center justify-center">
                        {assignment.client_profiles?.logo ? (
                          <img src={assignment.client_profiles.logo} alt="" className="w-5 h-5 rounded object-cover" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{assignment.client_profiles?.company_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(assignment.started_at), 'MMM d')} - {format(new Date(assignment.ends_at), 'MMM d')}
                          {assignment.lead_list_id && leadListNames[assignment.lead_list_id]
                            ? ` · List: ${leadListNames[assignment.lead_list_id]}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        setMeetingTarget(assignment.meeting_target);
                        setDurationDays(assignment.duration_days);
                        setEditingAssignmentId(assignment.id);
                      }}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-destructive hover:bg-destructive/10" 
                        onClick={() => handleEndAssignment(assignment.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {assignment.meetings_completed}/{assignment.meeting_target} meetings
                      </span>
                      <Badge 
                        variant={calculatePacing(assignment).status === 'ahead' ? 'success' : 
                                 calculatePacing(assignment).status === 'behind' ? 'destructive' : 'default'}
                        className="text-xs h-5"
                      >
                        {calculatePacing(assignment).label}
                      </Badge>
                    </div>
                    <Progress 
                      value={(assignment.meetings_completed / assignment.meeting_target) * 100} 
                      className="h-1.5"
                    />
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      ) : !isAssigning && (
        <div className="text-center py-4 text-muted-foreground text-sm border border-dashed rounded-lg">
          No active client assignments
        </div>
      )}

      {/* New Assignment Form */}
      {isAssigning && (
        <Card className="p-3 bg-card/50 border-primary/30">
          <p className="text-sm font-medium mb-3">Assign to Client</p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="mt-1 h-8">
                  <SelectValue placeholder="Select client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients
                    .filter(c => !activeAssignments.some(a => a.client_id === c.id))
                    .map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.company_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClient?.kpi_meeting_requirements && (
              <p className="text-xs text-muted-foreground">
                Client requirement: {selectedClient.kpi_meeting_requirements} meetings
              </p>
            )}

            {clientLeadLists.length > 0 && (
              <div>
                <Label className="text-xs">Lead list</Label>
                <Select
                  value={selectedLeadListId || "none"}
                  onValueChange={(v) => setSelectedLeadListId(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue placeholder="No lead list" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No lead list</SelectItem>
                    {clientLeadLists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                        {list.is_default ? " (default)" : ""}
                        {list.list_type ? ` · ${list.list_type}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Close dials/talk time and booked appointments are attributed to this list while assigned.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Meeting Target</Label>
                <Input
                  type="number"
                  min={1}
                  value={meetingTarget}
                  onChange={(e) => setMeetingTarget(Number(e.target.value))}
                  className="h-8 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Duration (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="h-8 mt-1"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAssign} disabled={isSaving || !selectedClientId} className="flex-1 h-8">
                {isSaving ? "Assigning..." : "Assign Client"}
              </Button>
              <Button variant="outline" onClick={() => {
                setIsAssigning(false);
                setSelectedClientId("");
              }} className="h-8">
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Past Assignments */}
      {pastAssignments.length > 0 && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="history" className="border-none">
            <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
              <span className="flex items-center gap-1">
                <History className="h-3 w-3" />
                Past Assignments ({pastAssignments.length})
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1.5 pt-1">
                {pastAssignments.map((assignment) => (
                  <div key={assignment.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                    <span>{assignment.client_profiles?.company_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {assignment.meetings_completed}/{assignment.meeting_target}
                      </span>
                      <Badge variant="secondary" className="text-xs h-5 capitalize">
                        {assignment.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
