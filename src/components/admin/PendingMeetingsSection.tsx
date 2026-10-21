import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, Calendar } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface PendingMeetingsSectionProps {
  clientId: string;
  onUpdate: () => void;
}

export const PendingMeetingsSection = ({ clientId, onUpdate }: PendingMeetingsSectionProps) => {
  const [pendingMeetings, setPendingMeetings] = useState<any[]>([]);
  const [allMeetings, setAllMeetings] = useState<any[]>([]);
  const [setterProfiles, setSetterProfiles] = useState<any[]>([]);
  const [clientProfiles, setClientProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignMeetingId, setReassignMeetingId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  

  const loadPendingMeetings = async () => {
    setLoading(true);
    
    // Load pending meetings for this client
    const { data: meetings } = await supabase
      .from("meetings")
      .select("*")
      .eq("client_profile_id", clientId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    
    if (meetings) setPendingMeetings(meetings);

    // Load all meetings for this client (full history, any status)
    const { data: all } = await supabase
      .from("meetings")
      .select("*")
      .eq("client_profile_id", clientId)
      .order("meeting_date", { ascending: false });
    
    if (all) setAllMeetings(all);

    // Load setter profiles for display
    const { data: setters } = await supabase
      .from("setters_profiles")
      .select("id, user_id, full_name, email")
      .neq("department", "sales"); // AE telemetry rows, not bookable setters
    
    if (setters) setSetterProfiles(setters);

    // Load all client profiles for reassignment
    const { data: clients } = await supabase
      .from("client_profiles")
      .select("id, company_name, contact_name")
      .eq("status", "active")
      .order("company_name");
    
    if (clients) setClientProfiles(clients);

    setLoading(false);
  };

  useEffect(() => {
    loadPendingMeetings();
  }, [clientId]);



  const getSetterName = (meeting: any) => {
    if (!meeting.logged_by_setter_id && !meeting.setter_profile_id) {
      return "SDR Trialist";
    }
    
    if (meeting.logged_by_setter_id) {
      const setter = setterProfiles.find(s => s.user_id === meeting.logged_by_setter_id);
      if (setter) return setter.full_name || setter.email;
    }
    
    if (meeting.setter_profile_id) {
      const setter = setterProfiles.find(s => s.id === meeting.setter_profile_id);
    if (setter) return setter.full_name || setter.email;
    }
    
    return "Unknown Setter";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="pending">Pending approval</Badge>;
      case "approved":
      case "admin_approved":
        return <Badge variant="info">Approved</Badge>;
      case "sat":
        return <Badge variant="success">Sat</Badge>;
      case "no_show":
        return <Badge variant="destructive">No show</Badge>;
      case "declined":
      case "rejected":
      case "admin_rejected":
      case "client_rejected":
        return <Badge variant="destructive">Declined</Badge>;
      case "rescheduled":
        return <Badge variant="secondary">Rescheduled</Badge>;
      case "cancelled":
        return <Badge variant="secondary">Cancelled</Badge>;
      case "client_accepted":
        return <Badge variant="info">Client accepted</Badge>;
      case "client_pending_response":
        return <Badge variant="pending">Awaiting client</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };


  const handleApproveMeeting = async (meetingId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from("meetings")
      .update({
        status: "approved",
        approved_by_admin: true,
        approved_by: user?.id,
        approved_at: new Date().toISOString()
      })
      .eq("id", meetingId);
    
    if (error) {
      toast.error("Failed to approve meeting");
    } else {
      toast.success("Meeting approved");
      loadPendingMeetings();
      onUpdate();
    }
  };

  const handleDeclineMeeting = async (meetingId: string) => {
    const { error } = await supabase
      .from("meetings")
      .update({ status: "declined" })
      .eq("id", meetingId);
    
    if (error) {
      toast.error("Failed to decline meeting");
    } else {
      toast.success("Meeting declined");
      loadPendingMeetings();
      onUpdate();
    }
  };

  const handleReassignMeeting = async (newClientId: string) => {
    if (!reassignMeetingId) return;

    const { error } = await supabase
      .from("meetings")
      .update({ client_profile_id: newClientId })
      .eq("id", reassignMeetingId);

    if (error) {
      toast.error("Failed to reassign meeting");
    } else {
      toast.success("Meeting reassigned");
      setReassignModalOpen(false);
      setReassignMeetingId(null);
      setClientSearch("");
      loadPendingMeetings();
      onUpdate();
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending Meetings ({pendingMeetings.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingMeetings.length === 0 && (
            <p className="text-sm text-muted-foreground">No pending meetings.</p>
          )}
          {pendingMeetings.map(meeting => (
            <div key={meeting.id} className="border-b pb-4 last:border-0">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h4 className="font-semibold">{meeting.prospect_name} at {meeting.company_name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(meeting.meeting_date + 'T' + meeting.meeting_time), 'PPP')} at {meeting.meeting_time}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Logged by: {getSetterName(meeting)} on {format(new Date(meeting.created_at), 'PPp')}
                  </p>
                  {meeting.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">"{meeting.notes}"</p>
                  )}
                </div>
                <div className="flex gap-2 flex-col min-w-[120px]">
                  <Button size="sm" onClick={() => handleApproveMeeting(meeting.id)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeclineMeeting(meeting.id)}>
                    Decline
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => {
                      setReassignMeetingId(meeting.id);
                      setReassignModalOpen(true);
                    }}
                  >
                    Reassign
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* All Appointments History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            All Appointments ({allMeetings.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {allMeetings.length === 0 && (
            <p className="text-sm text-muted-foreground">No appointments logged yet.</p>
          )}
          {allMeetings.map(meeting => (
            <div key={meeting.id} className="border-b pb-4 last:border-0">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold">{meeting.prospect_name} at {meeting.company_name}</h4>
                    {getStatusBadge(meeting.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(meeting.meeting_date + 'T' + meeting.meeting_time), 'PPP')} at {meeting.meeting_time}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Logged by: {getSetterName(meeting)} on {format(new Date(meeting.created_at), 'PPp')}
                  </p>
                  {meeting.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">"{meeting.notes}"</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Reassign Modal */}
      <Dialog open={reassignModalOpen} onOpenChange={setReassignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Meeting to Another Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search clients..."
                value={clientSearch}
                onChange={(e) => {
                  setClientSearch(e.target.value);
                  setShowClientDropdown(true);
                }}
                onFocus={() => setShowClientDropdown(true)}
                className="w-full px-3 py-2 border rounded-md"
              />
              {showClientDropdown && clientSearch && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                  {clientProfiles
                    .filter(c =>
                      c.company_name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
                      c.contact_name?.toLowerCase().includes(clientSearch.toLowerCase())
                    )
                    .map((client) => (
                      <div
                        key={client.id}
                        className="px-3 py-2 hover:bg-accent cursor-pointer"
                        onClick={() => {
                          handleReassignMeeting(client.id);
                          setShowClientDropdown(false);
                        }}
                      >
                        <div className="font-medium text-sm">{client.company_name}</div>
                        {client.contact_name && (
                          <div className="text-xs text-muted-foreground">{client.contact_name}</div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
