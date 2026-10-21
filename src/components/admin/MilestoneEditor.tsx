import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO, differenceInDays, isAfter, isBefore } from "date-fns";
import { 
  Calendar, 
  CheckCircle, 
  FileText, 
  Users, 
  PoundSterling, 
  Plus,
  Trash2,
  Flag,
  Loader2,
  Sparkles
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Campaign {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

interface Milestone {
  id: string;
  type: string;
  title: string;
  description: string | null;
  milestone_date: string;
  value: number | null;
  position: number;
}

interface MilestoneEditorProps {
  clientProfileId: string;
  onUpdate?: () => void;
}

const milestoneConfig: Record<string, { icon: React.ComponentType<any>; color: string; label: string }> = {
  meeting_booked: { icon: Calendar, color: "bg-blue-500", label: "Meeting Booked" },
  meeting_sat: { icon: CheckCircle, color: "bg-emerald-500", label: "Meeting Sat" },
  terms_sent: { icon: FileText, color: "bg-purple-500", label: "Terms Sent" },
  vacancy: { icon: Users, color: "bg-orange-500", label: "Vacancies in Play" },
  fee_value: { icon: PoundSterling, color: "bg-amber-500", label: "Fee Value" },
  custom: { icon: Flag, color: "bg-pink-500", label: "Custom" },
};

export const MilestoneEditor = ({ clientProfileId, onUpdate }: MilestoneEditorProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [milestoneType, setMilestoneType] = useState("meeting_sat");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDescription, setMilestoneDescription] = useState("");
  const [milestoneValue, setMilestoneValue] = useState<number | string>("");

  useEffect(() => {
    loadData();
  }, [clientProfileId]);

  const loadData = async () => {
    try {
      // Get the active campaign for this client profile
      const { data: campaigns, error: campaignError } = await supabase
        .from("campaigns")
        .select("id, name, status, start_date, end_date")
        .eq("client_id", clientProfileId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);

      if (campaignError) throw campaignError;

      if (campaigns && campaigns.length > 0) {
        setCampaign(campaigns[0]);
        await loadMilestones(campaigns[0]);
      }
    } catch (error) {
      console.error("Failed to load campaign:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMilestones = async (campaignData: Campaign) => {
    try {
      const { data: milestonesData, error } = await supabase
        .from("campaign_milestones")
        .select("*")
        .eq("campaign_id", campaignData.id)
        .order("milestone_date", { ascending: true });

      if (error) throw error;

      if (milestonesData && campaignData.start_date && campaignData.end_date) {
        const startDate = parseISO(campaignData.start_date);
        const endDate = parseISO(campaignData.end_date);
        const totalDays = differenceInDays(endDate, startDate);

        const processed = milestonesData.map((m: any) => {
          const milestoneDate = parseISO(m.milestone_date);
          const daysFromStart = differenceInDays(milestoneDate, startDate);
          const position = totalDays > 0 ? Math.max(0, Math.min(100, (daysFromStart / totalDays) * 100)) : 0;
          
          return { ...m, position };
        });

        setMilestones(processed);
      }
    } catch (error) {
      console.error("Failed to load milestones:", error);
    }
  };

  const calculateProgress = () => {
    if (!campaign?.start_date || !campaign?.end_date) return 0;
    
    const now = new Date();
    const startDate = parseISO(campaign.start_date);
    const endDate = parseISO(campaign.end_date);
    
    if (isBefore(now, startDate)) return 0;
    if (isAfter(now, endDate)) return 100;
    
    const totalDays = differenceInDays(endDate, startDate);
    const elapsedDays = differenceInDays(now, startDate);
    
    return totalDays > 0 ? Math.round((elapsedDays / totalDays) * 100) : 0;
  };

  const handleAddMilestone = async () => {
    if (!campaign || !milestoneDate || !milestoneTitle.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("campaign_milestones")
        .insert({
          campaign_id: campaign.id,
          client_profile_id: clientProfileId,
          type: milestoneType,
          title: milestoneTitle.trim(),
          description: milestoneDescription.trim() || null,
          milestone_date: milestoneDate,
          value: milestoneValue !== "" ? Number(milestoneValue) : null,
          created_by: user?.id
        });

      if (error) throw error;

      toast.success("Milestone added successfully");
      resetForm();
      await loadMilestones(campaign);
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to add milestone");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    try {
      const { error } = await supabase
        .from("campaign_milestones")
        .delete()
        .eq("id", milestoneId);

      if (error) throw error;

      toast.success("Milestone deleted");
      if (campaign) await loadMilestones(campaign);
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete milestone");
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setMilestoneType("meeting_sat");
    setMilestoneDate("");
    setMilestoneTitle("");
    setMilestoneDescription("");
    setMilestoneValue("");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  if (loading) {
    return (
      <Card className="border-border shadow-card">
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!campaign || !campaign.start_date || !campaign.end_date) {
    return (
      <Card className="border-border shadow-card">
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No active campaign found</p>
            <p className="text-sm">Create an active campaign with start/end dates to manage milestones</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progress = calculateProgress();

  return (
    <Card className="border-border shadow-card">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Campaign Timeline
            </CardTitle>
            <CardDescription>
              {campaign.name} • {format(parseISO(campaign.start_date), "MMM d")} - {format(parseISO(campaign.end_date), "MMM d, yyyy")}
            </CardDescription>
          </div>
          <Button 
            size="sm" 
            onClick={() => setShowForm(!showForm)}
            variant={showForm ? "secondary" : "default"}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Milestone
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Timeline visualization */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{format(parseISO(campaign.start_date), "MMM d, yyyy")}</span>
            <span>{progress}% complete</span>
            <span>{format(parseISO(campaign.end_date), "MMM d, yyyy")}</span>
          </div>
          
          <div className="relative">
            <div className="h-4 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary/60 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Milestone markers */}
            <TooltipProvider delayDuration={100}>
              <div className="absolute inset-0 pointer-events-none">
                {milestones.map((milestone) => {
                  const config = milestoneConfig[milestone.type] || milestoneConfig.custom;
                  const Icon = config.icon;
                  
                  return (
                    <Tooltip key={milestone.id}>
                      <TooltipTrigger asChild>
                        <div 
                          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 ${config.color} rounded-full flex items-center justify-center shadow-md border-2 border-background cursor-pointer pointer-events-auto hover:scale-125 transition-transform`}
                          style={{ left: `${milestone.position}%` }}
                        >
                          <Icon className="h-2.5 w-2.5 text-white" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="font-medium">{milestone.title}</p>
                        <p className="text-xs">{format(parseISO(milestone.milestone_date), "MMM d, yyyy")}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
        </div>

        {/* Add Milestone Form */}
        {showForm && (
          <div className="p-4 border border-border rounded-lg bg-muted/30 space-y-4">
            <h4 className="font-medium">Add New Milestone</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={milestoneType} onValueChange={setMilestoneType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(milestoneConfig).map(([key, config]) => {
                      const Icon = config.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 ${config.color} rounded-full`} />
                            {config.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={milestoneDate}
                  onChange={(e) => setMilestoneDate(e.target.value)}
                  min={campaign.start_date}
                  max={campaign.end_date}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g., First meeting completed"
                value={milestoneTitle}
                onChange={(e) => setMilestoneTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Additional details..."
                value={milestoneDescription}
                onChange={(e) => setMilestoneDescription(e.target.value)}
                rows={2}
              />
            </div>

            {(milestoneType === 'fee_value' || milestoneType === 'vacancy' || milestoneType === 'terms_sent') && (
              <div className="space-y-2">
                <Label>
                  {milestoneType === 'fee_value' ? 'Value (£)' : 'Count'}
                </Label>
                <Input
                  type="number"
                  placeholder={milestoneType === 'fee_value' ? '10000' : '1'}
                  value={milestoneValue}
                  onChange={(e) => setMilestoneValue(e.target.value)}
                  className="w-32"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleAddMilestone} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Milestone
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Milestones List */}
        {milestones.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Timeline Events</h4>
            <div className="space-y-2">
              {milestones.map((milestone) => {
                const config = milestoneConfig[milestone.type] || milestoneConfig.custom;
                const Icon = config.icon;
                
                return (
                  <div 
                    key={milestone.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 ${config.color} rounded-full flex items-center justify-center`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{milestone.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(milestone.milestone_date), "MMM d, yyyy")}
                          {milestone.value !== null && (
                            <span className="ml-2">
                              • {milestone.type === 'fee_value' ? formatCurrency(milestone.value) : `Count: ${milestone.value}`}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Milestone?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove "{milestone.title}" from the timeline.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteMilestone(milestone.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {milestones.length === 0 && !showForm && (
          <p className="text-sm text-center text-muted-foreground py-4">
            No milestones yet. Click "Add Milestone" to track key events.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
