import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Target, Clock, Calendar, TrendingUp, TrendingDown, Minus, Globe, Users, Briefcase, Link as LinkIcon, FileText, ExternalLink } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ClientProfile {
  company_name: string;
  logo: string | null;
  industry?: string | null;
  website?: string | null;
  country?: string | null;
  size?: string | null;
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
  status: string;
  client_profiles?: ClientProfile;
}

interface SourceMaterial {
  id: string;
  title: string;
  file_path: string;
  file_name: string;
  category: string;
}

interface ClientAssignmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: Assignment | null;
}

export function ClientAssignmentModal({ open, onOpenChange, assignment }: ClientAssignmentModalProps) {
  const [calendlyLink, setCalendlyLink] = useState<string | null>(null);
  const [sourceMaterials, setSourceMaterials] = useState<SourceMaterial[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  useEffect(() => {
    if (open && assignment?.client_id) {
      loadClientExtras(assignment.client_id);
    }
  }, [open, assignment?.client_id]);

  const loadClientExtras = async (clientId: string) => {
    setLoadingMaterials(true);
    const [profileRes, materialsRes] = await Promise.all([
      supabase
        .from("client_profiles")
        .select("calendly_link")
        .eq("id", clientId)
        .single(),
      supabase
        .from("client_source_materials")
        .select("id, title, file_path, file_name, category")
        .eq("client_profile_id", clientId)
        .order("created_at", { ascending: false }),
    ]);

    setCalendlyLink((profileRes.data as any)?.calendly_link || null);
    setSourceMaterials((materialsRes.data || []) as SourceMaterial[]);
    setLoadingMaterials(false);
  };

  const handleViewFile = async (material: SourceMaterial) => {
    const { data } = await supabase.storage
      .from("source-materials")
      .createSignedUrl(material.file_path, 3600);

    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      toast.error("Failed to open file");
    }
  };

  if (!assignment) return null;

  const calculatePacingStatus = (): { status: 'ahead' | 'on_track' | 'behind'; label: string } => {
    const now = new Date();
    const startDate = new Date(assignment.started_at);
    const totalDays = assignment.duration_days;
    const daysElapsed = differenceInDays(now, startDate);
    const percentTimeElapsed = Math.min(daysElapsed / totalDays, 1);
    const percentMeetingsCompleted = assignment.meetings_completed / assignment.meeting_target;
    
    if (percentMeetingsCompleted >= percentTimeElapsed + 0.1) {
      return { status: 'ahead', label: 'Ahead of Schedule' };
    }
    if (percentMeetingsCompleted >= percentTimeElapsed - 0.1) {
      return { status: 'on_track', label: 'On Track' };
    }
    return { status: 'behind', label: 'Behind Schedule' };
  };

  const pacing = calculatePacingStatus();
  const progressPercent = Math.min((assignment.meetings_completed / assignment.meeting_target) * 100, 100);
  const daysElapsed = differenceInDays(new Date(), new Date(assignment.started_at));
  const daysRemaining = Math.max(assignment.duration_days - daysElapsed, 0);
  const meetingsNeeded = assignment.meeting_target - assignment.meetings_completed;
  const meetingsPerDay = daysRemaining > 0 ? (meetingsNeeded / daysRemaining).toFixed(1) : 'N/A';

  const PacingIcon = pacing.status === 'ahead' ? TrendingUp : pacing.status === 'behind' ? TrendingDown : Minus;
  const clientProfile = assignment.client_profiles;

  const getCategoryLabel = (cat: string) => {
    const map: Record<string, string> = { call_sheet: "Call Sheet", script: "Script", training: "Training", general: "Document" };
    return map[cat] || cat;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              {clientProfile?.logo ? (
                <img 
                  src={clientProfile.logo} 
                  alt={clientProfile.company_name} 
                  className="w-10 h-10 rounded-lg object-cover"
                />
              ) : (
                <Building2 className="h-6 w-6 text-primary" />
              )}
            </div>
            <div>
              <p className="font-semibold text-lg">{clientProfile?.company_name || 'Assigned Client'}</p>
              <p className="text-xs text-muted-foreground font-normal">Your current client assignment</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Client Info */}
          {clientProfile && (clientProfile.industry || clientProfile.website || clientProfile.country) && (
            <Card className="p-4 bg-muted/30">
              <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wide mb-3">Client Details</h4>
              <div className="grid grid-cols-2 gap-3">
                {clientProfile.industry && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{clientProfile.industry}</span>
                  </div>
                )}
                {clientProfile.country && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{clientProfile.country}</span>
                  </div>
                )}
                {clientProfile.size && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{clientProfile.size}</span>
                  </div>
                )}
                {clientProfile.website && (
                  <div className="flex items-center gap-2 col-span-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={clientProfile.website.startsWith("http") ? clientProfile.website : `https://${clientProfile.website}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline truncate"
                    >
                      {clientProfile.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
                {calendlyLink && (
                  <div className="flex items-center gap-2 col-span-2">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={calendlyLink.startsWith("http") ? calendlyLink : `https://${calendlyLink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline truncate"
                    >
                      Calendly Booking Link
                    </a>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Calendly fallback if no other client info shown */}
          {calendlyLink && !(clientProfile && (clientProfile.industry || clientProfile.website || clientProfile.country)) && (
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-primary" />
                <a
                  href={calendlyLink.startsWith("http") ? calendlyLink : `https://${calendlyLink}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Calendly Booking Link
                </a>
              </div>
            </Card>
          )}

          {/* Progress Section */}
          <Card className="p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wide">Meeting Progress</h4>
              <Badge 
                variant={pacing.status === 'ahead' ? 'success' : pacing.status === 'behind' ? 'destructive' : 'default'}
              >
                <PacingIcon className="h-3 w-3 mr-1" />
                {pacing.label}
              </Badge>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Meetings Booked</span>
                </div>
                <span className="text-xl font-bold">
                  {assignment.meetings_completed} <span className="text-sm text-muted-foreground font-normal">/ {assignment.meeting_target}</span>
                </span>
              </div>
              <Progress value={progressPercent} className="h-3" />
              <p className="text-xs text-muted-foreground text-center">
                {progressPercent.toFixed(0)}% complete
              </p>
            </div>
          </Card>

          {/* Timeline & Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase">Time Remaining</span>
              </div>
              <p className="text-2xl font-bold">{daysRemaining}</p>
              <p className="text-xs text-muted-foreground">days left</p>
            </Card>
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase">Required Pace</span>
              </div>
              <p className="text-2xl font-bold">{meetingsPerDay}</p>
              <p className="text-xs text-muted-foreground">meetings/day needed</p>
            </Card>
          </div>

          {/* Assignment Dates */}
          <Card className="p-4 bg-muted/30">
            <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wide mb-3">Assignment Timeline</h4>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Started</span>
              </div>
              <span className="font-medium">{format(new Date(assignment.started_at), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Ends</span>
              </div>
              <span className="font-medium">{format(new Date(assignment.ends_at), 'MMM d, yyyy')}</span>
            </div>
          </Card>

          {/* Source Materials */}
          {sourceMaterials.length > 0 && (
            <Card className="p-4 bg-muted/30">
              <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wide mb-3">
                Source Materials
              </h4>
              <div className="space-y-2">
                {sourceMaterials.map(m => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleViewFile(m)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.title}</p>
                        <p className="text-[10px] text-muted-foreground">{getCategoryLabel(m.category)}</p>
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {loadingMaterials && (
            <div className="h-12 bg-muted/30 rounded-lg animate-pulse" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
