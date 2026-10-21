import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Target, Calendar, Clock, Plus, Edit2, X, History, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, addDays, differenceInDays } from "date-fns";

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
  client_profiles?: ClientProfile;
}

interface ClientAssignmentSectionProps {
  setterId: string;
  setterUserId: string;
  department: string;
  onUpdate?: () => void;
}

export function ClientAssignmentSection({ setterId, setterUserId, department, onUpdate }: ClientAssignmentSectionProps) {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  // QA: Multiple client assignments - changed from single to array
  const [activeAssignments, setActiveAssignments] = useState<Assignment[]>([]);
  const [pastAssignments, setPastAssignments] = useState<Assignment[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [meetingTarget, setMeetingTarget] = useState(3);
  const [durationDays, setDurationDays] = useState(30);
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  
  // Max assignments limit
  const MAX_ACTIVE_ASSIGNMENTS = 5;

  useEffect(() => {
    loadClients();
    loadAssignments();
  }, [setterId]);

  useEffect(() => {
    if (selectedClientId) {
      const client = clients.find(c => c.id === selectedClientId);
      setSelectedClient(client || null);
    } else {
      setSelectedClient(null);
    }
  }, [selectedClientId, clients]);

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

  // QA: Multiple client assignments - load ALL active assignments (not just single)
  const loadAssignments = async () => {
    // Load all active assignments (up to 5)
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
    } else {
      setActiveAssignments([]);
    }

    // Load past assignments
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
      .limit(10);

    if (past) {
      setPastAssignments(past as Assignment[]);
    }
  };

  // QA: Multiple assignments - validate max 5 before allowing new assignment
  const handleAssign = async () => {
    if (!selectedClientId) {
      toast.error("Please select a client");
      return;
    }

    if (activeAssignments.length >= MAX_ACTIVE_ASSIGNMENTS) {
      toast.error(`Maximum ${MAX_ACTIVE_ASSIGNMENTS} active assignments allowed`);
      return;
    }

    // Check if already assigned to this client
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
          created_by: user?.id
        });

      if (error) throw error;

      toast.success("Client assigned successfully");
      setIsAssigning(false);
      setSelectedClientId("");
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

  const calculatePacing = (assignment: Assignment): { status: string; label: string; color: string } => {
    const now = new Date();
    const startDate = new Date(assignment.started_at);
    const totalDays = assignment.duration_days;
    const daysElapsed = differenceInDays(now, startDate);
    const percentTimeElapsed = Math.min(daysElapsed / totalDays, 1);
    const percentMeetingsCompleted = assignment.meetings_completed / assignment.meeting_target;

    if (percentMeetingsCompleted >= percentTimeElapsed + 0.1) {
      return { status: 'ahead', label: 'Ahead', color: 'text-green-500' };
    }
    if (percentMeetingsCompleted >= percentTimeElapsed - 0.1) {
      return { status: 'on_track', label: 'On Track', color: 'text-yellow-500' };
    }
    return { status: 'behind', label: 'Behind', color: 'text-destructive' };
  };

  // Only show for fulfillment setters
  if (department !== 'fulfilment') {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Client Assignments
          {activeAssignments.length > 0 && (
            <Badge variant="outline" className="ml-2">
              {activeAssignments.length}/{MAX_ACTIVE_ASSIGNMENTS}
            </Badge>
          )}
        </h3>
        {/* QA: Multiple assignments - disable button when at max */}
        {activeAssignments.length < MAX_ACTIVE_ASSIGNMENTS && !isAssigning && (
          <Button variant="outline" size="sm" onClick={() => setIsAssigning(true)}>
            <Plus className="h-3 w-3 mr-1" />
            Assign Client
          </Button>
        )}
        {activeAssignments.length >= MAX_ACTIVE_ASSIGNMENTS && !isAssigning && (
          <Badge variant="secondary" className="text-xs">
            Max {MAX_ACTIVE_ASSIGNMENTS} reached
          </Badge>
        )}
      </div>

      {/* QA: Multiple assignments - display all active assignments as cards */}
      {activeAssignments.length > 0 && (
        <div className="space-y-3">
          {activeAssignments.map((assignment) => (
            <Card key={assignment.id} className="glass-card p-4">
              {editingAssignmentId === assignment.id ? (
                // Edit form for this specific assignment
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Edit Assignment - {assignment.client_profiles?.company_name}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Meeting Target</Label>
                      <Input
                        type="number"
                        min={1}
                        value={meetingTarget}
                        onChange={(e) => setMeetingTarget(Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Duration (days)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={durationDays}
                        onChange={(e) => setDurationDays(Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => handleUpdateAssignment(assignment.id)} 
                      disabled={isSaving} 
                      className="flex-1"
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button variant="outline" onClick={() => setEditingAssignmentId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                // Display view for assignment
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        {assignment.client_profiles?.logo ? (
                          <img 
                            src={assignment.client_profiles.logo} 
                            alt="" 
                            className="w-8 h-8 rounded object-cover"
                          />
                        ) : (
                          <Building2 className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold">{assignment.client_profiles?.company_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Started {format(new Date(assignment.started_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        setMeetingTarget(assignment.meeting_target);
                        setDurationDays(assignment.duration_days);
                        setEditingAssignmentId(assignment.id);
                      }}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-destructive hover:bg-destructive/10" 
                        onClick={() => handleEndAssignment(assignment.id)}
                        title="End assignment"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Target className="h-3 w-3" /> Progress
                      </span>
                      <span className="font-medium">
                        {assignment.meetings_completed} / {assignment.meeting_target} meetings
                      </span>
                    </div>
                    <Progress 
                      value={(assignment.meetings_completed / assignment.meeting_target) * 100} 
                      className="h-2"
                    />
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>
                        Day {Math.min(differenceInDays(new Date(), new Date(assignment.started_at)) + 1, assignment.duration_days)} of {assignment.duration_days}
                      </span>
                    </div>
                    <Badge 
                      variant={calculatePacing(assignment).status === 'ahead' ? 'success' : 
                               calculatePacing(assignment).status === 'behind' ? 'destructive' : 'default'}
                    >
                      {calculatePacing(assignment).label}
                    </Badge>
                  </div>

                  {/* Client Meeting Requirements Info */}
                  {assignment.client_profiles?.kpi_meeting_requirements && (
                    <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                      Client total requirement: {assignment.client_profiles.kpi_meeting_requirements} meetings
                    </div>
                  )}
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* New Assignment Form */}
      {isAssigning && (
        <Card className="glass-card p-4">
          <h4 className="text-sm font-medium mb-4">Assign to Client</h4>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Select Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a client..." />
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

            {selectedClient && (
              <div className="p-3 bg-muted/30 rounded-lg text-xs">
                <span className="text-muted-foreground">Client Meeting Requirements: </span>
                <span className="font-medium">
                  {selectedClient.kpi_meeting_requirements || 'Not set'}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Meeting Target</Label>
                <Input
                  type="number"
                  min={1}
                  value={meetingTarget}
                  onChange={(e) => setMeetingTarget(Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Setter's target for this assignment
                </p>
              </div>
              <div>
                <Label className="text-xs">Duration (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ends: {format(addDays(new Date(), durationDays), 'MMM d, yyyy')}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAssign} disabled={isSaving || !selectedClientId} className="flex-1">
                {isSaving ? "Assigning..." : "Assign Client"}
              </Button>
              <Button variant="outline" onClick={() => {
                setIsAssigning(false);
                setSelectedClientId("");
              }}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* No Active Assignment */}
      {activeAssignments.length === 0 && !isAssigning && (
        <Card className="glass-card p-4 text-center">
          <p className="text-sm text-muted-foreground">No active client assignments</p>
          <p className="text-xs text-muted-foreground mt-1">
            Assign up to {MAX_ACTIVE_ASSIGNMENTS} clients to track meeting progress
          </p>
        </Card>
      )}

      {/* Past Assignments */}
      {pastAssignments.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="history" className="border-none">
            <AccordionTrigger className="text-sm text-muted-foreground hover:no-underline py-2">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Assignment History ({pastAssignments.length})
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {pastAssignments.map((assignment) => (
                  <Card key={assignment.id} className="glass-card p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{assignment.client_profiles?.company_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(assignment.started_at), 'MMM d')} - {format(new Date(assignment.completed_at || assignment.ends_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {assignment.meetings_completed}/{assignment.meeting_target}
                        </p>
                        <Badge variant={assignment.status === 'completed' ? 'success' : 'secondary'} className="text-xs">
                          {assignment.status}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
