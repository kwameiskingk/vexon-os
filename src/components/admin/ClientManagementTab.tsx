import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Calendar, CheckCircle, Users, Save, Loader2, ArrowRight, MessageSquare, Flame } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { MilestoneEditor } from "./MilestoneEditor";

interface ClientManagementTabProps {
  clientId: string;
  onUpdate?: () => void;
}

export const ClientManagementTab = ({ clientId, onUpdate }: ClientManagementTabProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isCSMRoute = location.pathname.startsWith("/csm");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Read-only metrics
  const [upcomingMeetings, setUpcomingMeetings] = useState(0);
  const [meetingsSat, setMeetingsSat] = useState(0);
  
  // CSM-editable fields
  const [csmNotesToClient, setCsmNotesToClient] = useState("");

  // Warm leads
  const [warmLeadsCount, setWarmLeadsCount] = useState(0);

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    try {
      const { data: profile, error: profileError } = await supabase
        .from("client_profiles")
        .select("kpi_meetings_sat, csm_notes_to_client")
        .eq("id", clientId)
        .single();

      if (profileError) throw profileError;

      setMeetingsSat((profile as any)?.kpi_meetings_sat || 0);
      setCsmNotesToClient((profile as any)?.csm_notes_to_client || "");

      // Load upcoming meetings count.
      // NULL-safe: .neq() would silently drop rows where the column is NULL.
      const { data: meetings } = await supabase
        .from("meetings")
        .select("id")
        .eq("client_profile_id", clientId)
        .eq("approved_by_admin", true)
        .or("attendance_status.is.null,attendance_status.not.in.(sat,cancelled)")
        .or("status.is.null,status.neq.client_rejected");

      setUpcomingMeetings(meetings?.length || 0);

      // Load warm leads count
      const { count } = await supabase
        .from("warm_leads")
        .select("id", { count: "exact", head: true })
        .filter("client_profile_id", "eq", clientId);

      setWarmLeadsCount(count || 0);
    } catch (error) {
      console.error("Failed to load management data:", error);
      toast.error("Failed to load management data");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("client_profiles")
        .update({
          csm_notes_to_client: csmNotesToClient || null,
          updated_at: new Date().toISOString()
        } as any)
        .eq("id", clientId);

      if (error) throw error;

      toast.success("Management data saved successfully");
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to save management data");
    } finally {
      setSaving(false);
    }
  };

  const navigateToMeetings = () => {
    const basePath = isCSMRoute ? "/csm" : "/admin";
    navigate(`${basePath}/meetings?clientId=${clientId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Client Management</h2>
          <p className="text-sm text-muted-foreground">Manage client metrics and status. These values reflect on the client's dashboard.</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Read-only Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card 
          className="border-border shadow-card hover:shadow-lg transition-shadow cursor-pointer group"
          onClick={navigateToMeetings}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Meetings</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{upcomingMeetings}</div>
                <p className="text-xs text-muted-foreground mt-1">Pending client action</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Meetings Sat</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{meetingsSat}</div>
            <p className="text-xs text-muted-foreground mt-1">Auto-updated when marked as sat</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warm Leads</CardTitle>
            <Flame className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{warmLeadsCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Enriched leads assigned to this client</p>
          </CardContent>
        </Card>
      </div>

      {/* CSM Notes to Client */}
      <Card className="border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Notes to Client
          </CardTitle>
          <CardDescription>
            These notes will be visible to the client in their Communications tab
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={csmNotesToClient}
            onChange={(e) => setCsmNotesToClient(e.target.value)}
            placeholder="Add any important notes or updates for the client..."
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Campaign Timeline Editor */}
      <MilestoneEditor clientProfileId={clientId} onUpdate={onUpdate} />
    </div>
  );
};
