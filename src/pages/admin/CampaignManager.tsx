import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, Trash2, Archive, Calendar, Plus, BarChart3, Activity } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";

interface Campaign {
  id: string;
  name: string;
  client_id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  launch_date: string | null;
  notes: string | null;
  meetings_booked: number;
  meetings_sat: number;
  meeting_target: number;
  campaign_number: number;
  created_at: string;
  updated_at: string;
}

interface Client {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  logo: string | null;
}

interface ClientProfile {
  id: string;
  health_score: number;
}

interface Meeting {
  id: string;
  meeting_date: string;
  meeting_time: string;
  prospect_name: string;
  prospect_email: string;
  prospect_mobile: string | null;
  status: string;
  setter_id: string;
}

interface CampaignNote {
  id: string;
  note: string;
  author: string;
  created_at: string;
}

const CampaignManager = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isCSMRoute = location.pathname.startsWith("/csm");
  // 14 Oct 2026: Reporting and Client Health retired; both paths lead to the client list.
  const reportingPath = isCSMRoute ? "/csm/clients" : "/admin/operations/clients";
  const fallbackPath = isCSMRoute ? "/csm/clients" : "/admin/clients";

  // Determine if we came from a client profile so Back can return there
  const fromClientPath = location.state?.fromClientPath as string | undefined;
  
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [campaignNotes, setCampaignNotes] = useState<CampaignNote[]>([]);
  const [setters, setSetters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [healthScore, setHealthScore] = useState(5);
  const [satMeetings, setSatMeetings] = useState(0);

  useEffect(() => {
    if (id) {
      loadCampaignData();
    }
  }, [id]);

  const loadCampaignData = async () => {
    setLoading(true);
    
    // Load campaign
    const { data: campaignData, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (campaignError || !campaignData) {
      toast.error("Failed to load campaign");
      navigate(fallbackPath);
      return;
    }

    setCampaign(campaignData);

    // Load client
    const { data: clientData } = await supabase
      .from("client_profiles")
      .select("*")
      .eq("id", campaignData.client_id)
      .maybeSingle();

    if (clientData) setClient(clientData);

    // Load client profile for health score
    const { data: profileData } = await supabase
      .from("client_profiles")
      .select("id, health_score")
      .eq("id", campaignData.client_id)
      .maybeSingle();

    if (profileData) {
      setClientProfile(profileData);
      setHealthScore(profileData.health_score || 5);
    }

    // Set SAT meetings from campaign
    setSatMeetings(campaignData.meetings_sat || 0);

    // Load meetings for this client (using client_profile_id which is the correct FK)
    const { data: meetingsData } = await supabase
      .from("meetings")
      .select("*")
      .eq("client_profile_id", campaignData.client_id)
      .order("meeting_date", { ascending: false });

    if (meetingsData) setMeetings(meetingsData);

    // Load setters
    const { data: setterRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "setter");

    if (setterRoles) {
      // Former employees are no longer assignable to campaigns.
      const offboarded = await fetchOffboardedUserIds();
      const setterIds = Array.from(
        new Set(setterRoles.map((sr) => sr.user_id).filter((id) => !offboarded.has(id)))
      );

      if (setterIds.length === 0) {
        setSetters([]);
      } else {
        const { data: setterProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", setterIds);

        setSetters(
          (setterProfiles || []).map((p) => ({
            id: p.id,
            name: p.full_name || "Unknown",
            email: p.email || "",
          }))
        );
      }
    }

    // Parse notes from JSON if they exist
    if (campaignData.notes) {
      try {
        const parsed = JSON.parse(campaignData.notes);
        if (Array.isArray(parsed)) {
          setCampaignNotes(parsed);
        }
      } catch {
        // Notes is plain text, convert to array format
        setCampaignNotes([{
          id: Date.now().toString(),
          note: campaignData.notes,
          author: "System",
          created_at: campaignData.created_at
        }]);
      }
    }

    setLoading(false);
    console.log(`[CampaignManager] Loaded campaign: ${campaignData.name}`);
  };

  const getCampaignAgeColor = (): { color: string; label: string; emoji: string } => {
    if (!campaign?.launch_date) {
      return { color: "hsl(var(--muted))", label: "No launch date set", emoji: "⚪" };
    }

    const daysSinceLaunch = differenceInDays(new Date(), new Date(campaign.launch_date));

    if (daysSinceLaunch < 30) {
      return { color: "hsl(142 76% 36%)", label: "Fresh campaign (< 30 days)", emoji: "🟩" };
    } else if (daysSinceLaunch <= 60) {
      return { color: "hsl(38 92% 50%)", label: "Maturing campaign (30-60 days)", emoji: "🟧" };
    } else {
      return { color: "hsl(0 84% 60%)", label: "Mature campaign (> 60 days)", emoji: "🟥" };
    }
  };

  const handleSaveReportingData = async () => {
    if (!campaign || !clientProfile) return;

    // Update campaign SAT meetings
    const { error: campaignError } = await supabase
      .from("campaigns")
      .update({
        meetings_sat: satMeetings,
        launch_date: campaign.launch_date,
        end_date: campaign.end_date,
        status: campaign.status,
        updated_at: new Date().toISOString()
      })
      .eq("id", campaign.id);

    if (campaignError) {
      toast.error("Failed to save campaign data");
      return;
    }

    // Update client health score
    const { error: profileError } = await supabase
      .from("client_profiles")
      .update({
        health_score: healthScore
      })
      .eq("id", clientProfile.id);

    if (profileError) {
      toast.error("Failed to save health score");
      return;
    }

    toast.success("Reporting data updated successfully");
    setEditMode(false);
    console.log(`[CampaignManager] Updated reporting data for ${campaign.name} → Health: ${healthScore}, SAT: ${satMeetings}`);
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !campaign) return;

    const { data: userData } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userData.user?.id)
      .maybeSingle();

    const note: CampaignNote = {
      id: Date.now().toString(),
      note: newNote,
      author: profile?.full_name || "Admin",
      created_at: new Date().toISOString()
    };

    const updatedNotes = [...campaignNotes, note];
    setCampaignNotes(updatedNotes);

    const { error } = await supabase
      .from("campaigns")
      .update({ 
        notes: JSON.stringify(updatedNotes),
        updated_at: new Date().toISOString()
      })
      .eq("id", campaign.id);

    if (error) {
      toast.error("Failed to add note");
      setCampaignNotes(campaignNotes);
    } else {
      toast.success("Note added");
      setNewNote("");
    }
  };

  const handleDeleteCampaign = async () => {
    if (!campaign) return;

    const { error } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", campaign.id);

    if (error) {
      toast.error("Failed to delete campaign");
    } else {
      toast.success("Campaign deleted");
      navigate(fallbackPath);
    }
  };

  const handleArchiveCampaign = async () => {
    if (!campaign) return;

    const { error } = await supabase
      .from("campaigns")
      .update({ status: "completed" })
      .eq("id", campaign.id);

    if (error) {
      toast.error("Failed to archive campaign");
    } else {
      toast.success("Campaign archived");
      setCampaign({ ...campaign, status: "completed" });
    }
  };


  if (loading || !campaign || !client) {
    return (
      <DashboardLayout role="admin">
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading campaign...</p>
        </div>
      </DashboardLayout>
    );
  }

  const campaignAgeData = getCampaignAgeColor();

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(fromClientPath || reportingPath)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Reporting Control Center
              </h1>
              <p className="text-muted-foreground">
                {client.company_name} • Campaign #{campaign.campaign_number}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(reportingPath)}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Back to Clients
            </Button>
            {editMode ? (
              <>
                <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                <Button onClick={handleSaveReportingData}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditMode(true)}>
                <Activity className="h-4 w-4 mr-2" />
                Edit Metrics
              </Button>
            )}
          </div>
        </div>

        {/* Scatter Plot Impact Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Health Score Editor */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Client Health Score
              </CardTitle>
              <CardDescription>
                Affects X-axis position on scatter plot (0 = Critical, 10 = Excellent)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Health Score</Label>
                  <span className="text-3xl font-bold text-primary">{healthScore}</span>
                </div>
                {editMode ? (
                  <Slider
                    value={[healthScore]}
                    onValueChange={(value) => setHealthScore(value[0])}
                    min={0}
                    max={10}
                    step={1}
                    className="w-full"
                  />
                ) : (
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-red-500 via-orange-400 to-green-500 transition-all duration-300"
                      style={{ width: `${(healthScore / 10) * 100}%` }}
                    />
                  </div>
                )}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0 - Critical</span>
                  <span>5 - Neutral</span>
                  <span>10 - Excellent</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SAT Meetings Counter */}
          <Card className="border-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-accent" />
                SAT Meetings Count
              </CardTitle>
              <CardDescription>
                Affects Y-axis position on scatter plot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>Total SAT Meetings</Label>
                {editMode ? (
                  <Input
                    type="number"
                    min={0}
                    value={satMeetings}
                    onChange={(e) => setSatMeetings(parseInt(e.target.value) || 0)}
                    className="text-2xl font-bold h-16"
                  />
                ) : (
                  <div className="text-5xl font-bold text-accent">{satMeetings}</div>
                )}
                <p className="text-sm text-muted-foreground">
                  Higher values indicate more successful meetings attended
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Campaign Timeline
              </CardTitle>
              <CardDescription>
                Launch date affects color coding on scatter plot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Launch Date</Label>
                {editMode ? (
                  <Input
                    type="date"
                    value={campaign.launch_date || ""}
                    className="[color-scheme:dark]"
                    onChange={(e) => setCampaign({ ...campaign, launch_date: e.target.value })}
                  />
                ) : (
                  <p className="text-lg font-medium">
                    {campaign.launch_date ? format(new Date(campaign.launch_date), "PPP") : "Not set"}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                {editMode ? (
                  <Input
                    type="date"
                    value={campaign.end_date || ""}
                    className="[color-scheme:dark]"
                    onChange={(e) => setCampaign({ ...campaign, end_date: e.target.value })}
                  />
                ) : (
                  <p className="text-lg font-medium">
                    {campaign.end_date ? format(new Date(campaign.end_date), "PPP") : "Ongoing"}
                  </p>
                )}
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{campaignAgeData.emoji}</span>
                  <div>
                    <p className="font-medium" style={{ color: campaignAgeData.color }}>
                      {campaignAgeData.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      This determines the marker color on the scatter plot
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Status */}
          <Card>
            <CardHeader>
              <CardTitle>Campaign Status</CardTitle>
              <CardDescription>Current operational status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {editMode ? (
                <Select value={campaign.status} onValueChange={(value) => setCampaign({ ...campaign, status: value })}>
                  <SelectTrigger className="h-16 text-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge 
                  variant={campaign.status === "active" ? "default" : "secondary"} 
                  className="text-2xl px-6 py-3"
                >
                  {campaign.status}
                </Badge>
              )}
              <div className="pt-4 space-y-2 border-t">
                <p className="text-sm font-medium">Campaign Number</p>
                <p className="text-3xl font-bold text-primary">#{campaign.campaign_number}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Scatter Plot Preview */}
        <Card className="border-primary/30 bg-gradient-to-br from-background to-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Scatter Plot Position Preview
            </CardTitle>
            <CardDescription>
              Visual representation of where this client appears on the Reporting dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative h-64 border border-border rounded-lg bg-background/50 p-4">
              {/* Axes */}
              <div className="absolute bottom-4 left-4 right-4 h-px bg-border" />
              <div className="absolute bottom-4 left-4 top-4 w-px bg-border" />
              
              {/* Labels */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
                Health Score →
              </div>
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-muted-foreground">
                ← SAT Meetings
              </div>
              
              {/* Data point */}
              <div 
                className="absolute w-6 h-6 rounded-full border-2 border-background shadow-lg transition-all duration-300"
                style={{
                  left: `${((healthScore / 10) * 80) + 10}%`,
                  bottom: `${((satMeetings / Math.max(satMeetings, 50)) * 80) + 10}%`,
                  backgroundColor: campaignAgeData.color
                }}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="w-full h-full" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1">
                        <p className="font-bold">{client.company_name}</p>
                        <p>Health: {healthScore}/10</p>
                        <p>SAT Meetings: {satMeetings}</p>
                        <p>{campaignAgeData.label}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              {/* Quadrant lines */}
              <div className="absolute bottom-1/2 left-4 right-4 h-px bg-border/30" />
              <div className="absolute bottom-4 top-4 left-1/2 w-px bg-border/30" />
            </div>
          </CardContent>
        </Card>

        {/* Tabs for detailed sections */}
        <Tabs defaultValue="notes" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="notes">Notes & History</TabsTrigger>
            <TabsTrigger value="meetings">Meetings & Warm Leads</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Notes Tab */}
          <TabsContent value="notes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Notes</CardTitle>
                <CardDescription>Internal notes and updates for this campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleAddNote} disabled={!newNote.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  {campaignNotes.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No notes yet. Add one above!</p>
                  ) : (
                    campaignNotes.map((note) => (
                      <div key={note.id} className="p-4 border border-border rounded-lg bg-secondary/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{note.author}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(note.created_at), "PPp")}
                          </span>
                        </div>
                        <p className="text-sm">{note.note}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Meetings Tab */}
          <TabsContent value="meetings" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Campaign Meetings</CardTitle>
                    <CardDescription>All meetings booked for {client.company_name}</CardDescription>
                  </div>
                  <Button onClick={() => navigate(isCSMRoute ? "/csm/meetings" : "/admin/meetings")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Meeting
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left p-2 text-sm font-medium">Date</th>
                        <th className="text-left p-2 text-sm font-medium">Time</th>
                        <th className="text-left p-2 text-sm font-medium">Prospect</th>
                        <th className="text-left p-2 text-sm font-medium">Contact</th>
                        <th className="text-left p-2 text-sm font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meetings.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-8 text-muted-foreground">
                            No meetings yet
                          </td>
                        </tr>
                      ) : (
                        meetings.map((meeting) => (
                          <tr key={meeting.id} className="border-b hover:bg-muted/50">
                            <td className="p-2 text-sm">{format(new Date(meeting.meeting_date), "PPP")}</td>
                            <td className="p-2 text-sm">{meeting.meeting_time}</td>
                            <td className="p-2 text-sm font-medium">{meeting.prospect_name}</td>
                            <td className="p-2 text-sm">{meeting.prospect_email}</td>
                            <td className="p-2">
                              <Badge variant={meeting.status === "confirmed" ? "default" : "secondary"}>
                                {meeting.status}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Settings</CardTitle>
                <CardDescription>Manage campaign goals and configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Meeting Target</Label>
                    <Input
                      type="number"
                      value={campaign.meeting_target}
                      onChange={(e) => setCampaign({ ...campaign, meeting_target: parseInt(e.target.value) || 0 })}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Campaign Number</Label>
                    <Input
                      type="number"
                      value={campaign.campaign_number}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={campaign.start_date || ""}
                      className="[color-scheme:dark]"
                      onChange={(e) => setCampaign({ ...campaign, start_date: e.target.value })}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={campaign.end_date || ""}
                      className="[color-scheme:dark]"
                      onChange={(e) => setCampaign({ ...campaign, end_date: e.target.value })}
                      disabled={!editMode}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Danger Zone</CardTitle>
                <CardDescription>Irreversible campaign actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full" onClick={handleArchiveCampaign}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive Campaign
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Campaign
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {campaign.name}. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteCampaign} className="bg-destructive hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      </PageContainer>
    </DashboardLayout>
  );
};

export default CampaignManager;