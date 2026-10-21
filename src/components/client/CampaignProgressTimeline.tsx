import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays, parseISO, isAfter, isBefore } from "date-fns";
import { 
  Calendar, 
  CheckCircle, 
  FileText, 
  Users, 
  PoundSterling, 
  Clock,
  Flag,
  Sparkles,
  TrendingUp,
  FileSignature,
  PlayCircle
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Campaign {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  client_id: string;
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

interface ProfileDates {
  terms_signed_date: string | null;
  campaign_start_date: string | null;
}

export interface CampaignProgressDemoData {
  campaign: Campaign | null;
  milestones: Milestone[];
  profileDates: ProfileDates;
}

interface CampaignProgressTimelineProps {
  clientProfileId: string;
  demoData?: CampaignProgressDemoData;
}

const milestoneConfig: Record<string, { icon: React.ComponentType<any>; color: string; bgColor: string; label: string }> = {
  terms_signed: { icon: FileSignature, color: "text-yellow-400", bgColor: "bg-yellow-500", label: "Agreement Signed" },
  campaign_started: { icon: PlayCircle, color: "text-green-400", bgColor: "bg-green-500", label: "Campaign Started" },
  meeting_booked: { icon: Calendar, color: "text-blue-400", bgColor: "bg-blue-500", label: "Meeting Booked" },
  meeting_sat: { icon: CheckCircle, color: "text-emerald-400", bgColor: "bg-emerald-500", label: "Meeting Sat" },
  terms_sent: { icon: FileText, color: "text-purple-400", bgColor: "bg-purple-500", label: "Terms Sent" },
  vacancy: { icon: Users, color: "text-orange-400", bgColor: "bg-orange-500", label: "Vacancies in Play" },
  fee_value: { icon: PoundSterling, color: "text-amber-400", bgColor: "bg-amber-500", label: "Fee Value" },
  custom: { icon: Flag, color: "text-pink-400", bgColor: "bg-pink-500", label: "Milestone" },
};

export const CampaignProgressTimeline = ({ clientProfileId, demoData }: CampaignProgressTimelineProps) => {
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [profileDates, setProfileDates] = useState<ProfileDates>({ 
    terms_signed_date: null, 
    campaign_start_date: null 
  });

  useEffect(() => {
    if (demoData) {
      setCampaign(demoData.campaign);
      setMilestones(demoData.milestones);
      setProfileDates(demoData.profileDates);
      setLoading(false);
      return;
    }
    loadCampaignData();
  }, [clientProfileId]);

  const loadCampaignData = async () => {
    try {
      // First, fetch profile dates (always needed)
      const { data: profile, error: profileError } = await supabase
        .from("client_profiles")
        .select("terms_signed_date, campaign_start_date")
        .eq("id", clientProfileId)
        .single();

      if (profileError) throw profileError;

      const fetchedProfileDates = {
        terms_signed_date: (profile as any)?.terms_signed_date || null,
        campaign_start_date: (profile as any)?.campaign_start_date || null
      };
      setProfileDates(fetchedProfileDates);

      // Get the active campaign for this client profile
      const { data: campaigns, error: campaignError } = await supabase
        .from("campaigns")
        .select("id, name, status, start_date, end_date, client_id")
        .eq("client_id", clientProfileId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);

      if (campaignError) throw campaignError;

      if (campaigns && campaigns.length > 0) {
        setCampaign(campaigns[0]);

        // Load milestones for this campaign
        const { data: milestonesData, error: milestonesError } = await supabase
          .from("campaign_milestones")
          .select("*")
          .eq("campaign_id", campaigns[0].id)
          .order("milestone_date", { ascending: true });

        if (milestonesError) throw milestonesError;

        if (campaigns[0].start_date && campaigns[0].end_date) {
          const startDate = parseISO(campaigns[0].start_date);
          const endDate = parseISO(campaigns[0].end_date);
          const totalDays = differenceInDays(endDate, startDate);

          // Build combined milestones including profile dates
          const allMilestones: any[] = [];

          // Add profile dates as milestones if they exist
          if (fetchedProfileDates.terms_signed_date) {
            allMilestones.push({
              id: "profile-terms-signed",
              type: "terms_signed",
              title: "Terms Signed",
              description: null,
              milestone_date: fetchedProfileDates.terms_signed_date,
              value: null
            });
          }

          if (fetchedProfileDates.campaign_start_date) {
            allMilestones.push({
              id: "profile-campaign-started",
              type: "campaign_started",
              title: "Campaign Started",
              description: null,
              milestone_date: fetchedProfileDates.campaign_start_date,
              value: null
            });
          }

          // Add regular milestones
          if (milestonesData) {
            allMilestones.push(...milestonesData);
          }

          // Sort by date
          allMilestones.sort((a, b) => 
            new Date(a.milestone_date).getTime() - new Date(b.milestone_date).getTime()
          );

          // Calculate positions
          const basePositions = allMilestones.map((m: any) => {
            const milestoneDate = parseISO(m.milestone_date);
            const daysFromStart = differenceInDays(milestoneDate, startDate);
            const position = totalDays > 0 ? Math.max(0, Math.min(100, (daysFromStart / totalDays) * 100)) : 0;
            
            return {
              id: m.id,
              type: m.type,
              title: m.title,
              description: m.description,
              milestone_date: m.milestone_date,
              value: m.value,
              position
            };
          });

          // Offset overlapping milestones
          const processedMilestones = basePositions.map((milestone, index) => {
            const samePositionBefore = basePositions
              .slice(0, index)
              .filter(m => Math.abs(m.position - milestone.position) < 5).length;
            
            const offset = samePositionBefore * 6;
            const adjustedPosition = Math.min(96, milestone.position + offset);
            
            return {
              ...milestone,
              position: adjustedPosition
            };
          });

          setMilestones(processedMilestones);
        }
      } else {
        // No campaign - still show profile date milestones at fixed positions
        const profileMilestones: Milestone[] = [];

        if (fetchedProfileDates.terms_signed_date) {
          profileMilestones.push({
            id: "profile-terms-signed",
            type: "terms_signed",
            title: "Terms Signed",
            description: null,
            milestone_date: fetchedProfileDates.terms_signed_date,
            value: null,
            position: 5
          });
        }

        if (fetchedProfileDates.campaign_start_date) {
          profileMilestones.push({
            id: "profile-campaign-started",
            type: "campaign_started",
            title: "Campaign Started",
            description: null,
            milestone_date: fetchedProfileDates.campaign_start_date,
            value: null,
            position: fetchedProfileDates.terms_signed_date ? 15 : 5
          });
        }

        setMilestones(profileMilestones);
      }
    } catch (error) {
      console.error("Failed to load campaign data:", error);
    } finally {
      setLoading(false);
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

  const getDuration = () => {
    if (!campaign?.start_date || !campaign?.end_date) return "N/A";
    
    const startDate = parseISO(campaign.start_date);
    const endDate = parseISO(campaign.end_date);
    const totalDays = differenceInDays(endDate, startDate);
    const months = Math.round(totalDays / 30);
    
    if (months === 1) return "1 month";
    if (months > 1) return `${months} months`;
    return `${totalDays} days`;
  };

  const getDaysIntoCampaign = () => {
    if (!campaign?.start_date) return 0;
    const start = parseISO(campaign.start_date);
    const now = new Date();
    if (isBefore(now, start)) return 0;
    return Math.max(0, differenceInDays(now, start));
  };


  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  // Check if we have anything to show
  const hasContent = campaign || profileDates.terms_signed_date || profileDates.campaign_start_date;

  if (loading) {
    return (
      <Card className="glass-card border-border overflow-hidden">
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-16 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!hasContent) {
    return (
      <Card className="glass-card border-border overflow-hidden">
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No active campaign found</p>
            <p className="text-sm opacity-75">Your campaign progress will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progress = calculateProgress();
  const hasCampaign = campaign && campaign.start_date && campaign.end_date;

  return (
    <Card className="glass-card border-border overflow-visible relative z-0">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      
      <CardHeader className="pb-4 relative z-10">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              Campaign Progress
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {hasCampaign ? `${campaign.name} • ${getDuration()}` : "Getting Started"}
            </p>
          </div>
          <Badge 
            variant="secondary" 
            className={`${hasCampaign && progress === 100 
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" 
              : hasCampaign 
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
            } px-3 py-1`}
          >
            {hasCampaign ? (progress === 100 ? "Completed" : "Active") : "Pre-Campaign"}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6 relative z-10">
        {/* Date range display - only show if campaign exists */}
        {hasCampaign && (
          <div className="flex justify-between items-start text-sm">
            <div className="flex flex-col items-start gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Start Date
              </span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                <span className="text-foreground font-medium">
                  {format(parseISO(campaign.start_date!), "MMM d, yyyy")}
                </span>
              </div>
            </div>
            
            {/* Days into campaign in center */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Days In
              </span>
              <Badge variant="secondary" className="px-3 py-1">
                {getDaysIntoCampaign()} {getDaysIntoCampaign() === 1 ? 'day' : 'days'} in
              </Badge>
            </div>

            
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                End Date
              </span>
              <div className="flex items-center gap-2">
                <span className="text-foreground font-medium">
                  {format(parseISO(campaign.end_date!), "MMM d, yyyy")}
                </span>
                <div className="h-2 w-2 rounded-full bg-primary" />
              </div>
            </div>
          </div>
        )}

        {/* Pre-campaign info display */}
        {!hasCampaign && (
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground">
              Key milestones are being tracked. Your full campaign timeline will appear once the campaign is created.
            </p>
          </div>
        )}

        {/* Premium Progress Bar Container */}
        <div className="relative pt-10 pb-2">
          {/* Milestone markers positioned above the bar */}
          <TooltipProvider delayDuration={0}>
            <div className="absolute left-0 right-0 top-0 h-10 z-30">
              {milestones.map((milestone) => {
                const config = milestoneConfig[milestone.type] || milestoneConfig.custom;
                const Icon = config.icon;
                
                // Clamp position to prevent edge overflow
                const clampedPosition = Math.max(4, Math.min(96, milestone.position));
                
                return (
                  <Tooltip key={milestone.id}>
                    <TooltipTrigger asChild>
                      <div 
                        className="absolute bottom-0 -translate-x-1/2 cursor-pointer group"
                        style={{ left: `${clampedPosition}%` }}
                      >
                        {/* Marker container */}
                        <div 
                          className={`relative w-6 h-6 ${config.bgColor} rounded-full flex items-center justify-center 
                                     border-2 border-background shadow-md transition-all duration-200 
                                     group-hover:scale-110 group-hover:shadow-lg`}
                        >
                          <Icon className="h-3 w-3 text-white" />
                        </div>
                        
                        {/* Connector line down to bar */}
                        <div className={`absolute top-full left-1/2 -translate-x-1/2 w-px h-2.5 ${config.bgColor}`} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent 
                      side="top" 
                      sideOffset={12}
                      className="z-[100] bg-popover border border-border px-3 py-2 shadow-xl rounded-lg max-w-xs"
                      avoidCollisions={true}
                      collisionPadding={16}
                    >
                      <div className="space-y-1">
                        <p className="font-medium text-sm text-foreground">{milestone.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(milestone.milestone_date), "MMM d, yyyy")}
                        </p>
                        {milestone.description && (
                          <p className="text-xs text-muted-foreground/80">
                            {milestone.description}
                          </p>
                        )}
                        {milestone.value !== null && milestone.type === 'fee_value' && (
                          <p className="text-xs font-semibold text-amber-500">
                            {formatCurrency(milestone.value)}
                          </p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>

          {/* Outer subtle glow */}
          <div 
            className="absolute left-0 right-0 bottom-2 h-4 rounded-full opacity-30 blur-sm pointer-events-none"
            style={{ 
              background: hasCampaign 
                ? `linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.4) ${progress}%, transparent ${progress}%)` 
                : 'transparent'
            }}
          />
          
          {/* Main progress bar - narrow 3D style */}
          <div className="relative h-5 rounded-full overflow-hidden bg-muted/60 border border-border/50"
               style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3), inset 0 -1px 2px rgba(255,255,255,0.05)' }}>
            
            {/* Progress fill - only show if campaign exists */}
            {hasCampaign && (
              <div 
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                style={{ 
                  width: `${progress}%`,
                  background: 'linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.7) 100%)',
                  boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -1px 2px rgba(0,0,0,0.2)'
                }}
              >
                {/* Inner highlight for 3D effect */}
                <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent rounded-t-full" />
              </div>
            )}

            {/* Current position indicator */}
            {hasCampaign && progress > 0 && progress < 100 && (
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-1 h-3 bg-foreground rounded-full z-10"
                style={{ 
                  left: `${progress}%`, 
                  transform: 'translateX(-50%) translateY(-50%)',
                  boxShadow: '0 0 6px rgba(255,255,255,0.5)'
                }}
              />
            )}
          </div>
        </div>

        {/* Progress stats row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              {hasCampaign ? "Progress" : "Milestones"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {hasCampaign && (
              <div className="text-2xl font-bold text-foreground tabular-nums">
                {progress}%
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {milestones.length} milestone{milestones.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Legend */}
        {milestones.length > 0 && (
          <div className="flex flex-wrap gap-4 pt-4 border-t border-border/50">
            {Object.entries(milestoneConfig).map(([key, config]) => {
              const count = milestones.filter(m => m.type === key).length;
              if (count === 0) return null;
              
              const Icon = config.icon;
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <div className={`w-5 h-5 ${config.bgColor} rounded-full flex items-center justify-center`}>
                    <Icon className="h-2.5 w-2.5 text-white" />
                  </div>
                  <span className="text-muted-foreground">
                    {config.label}
                    {count > 1 && <span className="ml-1 text-foreground/70">({count})</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {milestones.length === 0 && (
          <div className="text-center py-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Milestones will appear here as your campaign progresses
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
