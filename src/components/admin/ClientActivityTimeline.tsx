import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { 
  Calendar, 
  Play, 
  Pause, 
  Users, 
  CheckCircle2, 
  AlertCircle,
  MessageSquare,
  Rocket,
  TrendingUp,
  UserPlus
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface TimelineEvent {
  id: string;
  type: 'campaign_launch' | 'campaign_pause' | 'campaign_resume' | 'setter_change' | 
        'meeting_milestone' | 'stipulation' | 'status_change' | 'payment' | 'note';
  title: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface ClientActivityTimelineProps {
  clientId: string;
}

export function ClientActivityTimeline({ clientId }: ClientActivityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivityEvents();
  }, [clientId]);

  const loadActivityEvents = async () => {
    try {
      const allEvents: TimelineEvent[] = [];

      // Load campaigns for launch/status events
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (campaigns) {
        campaigns.forEach(campaign => {
          // Campaign creation/launch
          allEvents.push({
            id: `campaign-launch-${campaign.id}`,
            type: 'campaign_launch',
            title: 'Campaign Launched',
            description: `${campaign.name} campaign started`,
            timestamp: campaign.launch_date || campaign.created_at,
            metadata: { campaignId: campaign.id, campaignName: campaign.name }
          });

          // Campaign status changes (paused/completed)
          if (campaign.status === 'paused') {
            allEvents.push({
              id: `campaign-pause-${campaign.id}`,
              type: 'campaign_pause',
              title: 'Campaign Paused',
              description: `${campaign.name} campaign was paused`,
              timestamp: campaign.updated_at,
              metadata: { campaignId: campaign.id }
            });
          }
        });
      }

      // Load meetings for milestone events
      const { data: meetings } = await supabase
        .from("meetings")
        .select("*")
        .eq("client_profile_id", clientId)
        .eq("status", "completed")
        .order("meeting_date", { ascending: false })
        .limit(20);

      if (meetings) {
        // Group meetings by count milestones (every 5 meetings)
        const completedCount = meetings.length;
        const milestones = [5, 10, 25, 50, 100];
        milestones.forEach(milestone => {
          if (completedCount >= milestone) {
            const milestoneDate = meetings[Math.min(milestone - 1, meetings.length - 1)]?.meeting_date;
            if (milestoneDate) {
              allEvents.push({
                id: `milestone-${milestone}`,
                type: 'meeting_milestone',
                title: `${milestone} Meetings Milestone`,
                description: `Reached ${milestone} completed meetings`,
                timestamp: milestoneDate,
                metadata: { count: milestone }
              });
            }
          }
        });
      }

      // Load stipulations
      const { data: stipulations } = await supabase
        .from("client_stipulations")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (stipulations) {
        stipulations.forEach(stip => {
          allEvents.push({
            id: `stip-${stip.id}`,
            type: 'stipulation',
            title: stip.resolved ? 'Issue Resolved' : 'Issue Flagged',
            description: stip.issue,
            timestamp: stip.resolved_at || stip.created_at,
            metadata: { severity: stip.severity, resolved: stip.resolved }
          });
        });
      }

      // Load payments
      const { data: payments } = await supabase
        .from("accounting_records")
        .select("*")
        .eq("client_profile_id", clientId)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(10);

      if (payments) {
        payments.forEach(payment => {
          allEvents.push({
            id: `payment-${payment.id}`,
            type: 'payment',
            title: 'Payment Received',
            description: `£${payment.amount?.toLocaleString()} received`,
            timestamp: payment.updated_at || payment.created_at,
            metadata: { amount: payment.amount }
          });
        });
      }

      // Sort all events by timestamp (most recent first)
      allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setEvents(allEvents.slice(0, 30)); // Limit to 30 most recent
    } catch (error) {
      console.error("Error loading activity events:", error);
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'campaign_launch':
        return <Rocket className="h-4 w-4" />;
      case 'campaign_pause':
        return <Pause className="h-4 w-4" />;
      case 'campaign_resume':
        return <Play className="h-4 w-4" />;
      case 'setter_change':
        return <UserPlus className="h-4 w-4" />;
      case 'meeting_milestone':
        return <TrendingUp className="h-4 w-4" />;
      case 'stipulation':
        return <AlertCircle className="h-4 w-4" />;
      case 'status_change':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'payment':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'note':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Calendar className="h-4 w-4" />;
    }
  };

  const getEventColor = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'campaign_launch':
      case 'campaign_resume':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'campaign_pause':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'meeting_milestone':
        return 'bg-primary/20 text-primary border-primary/30';
      case 'stipulation':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'payment':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  if (loading) {
    return (
      <Card className="border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-4">
                <div className="h-8 w-8 rounded-full bg-muted"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-muted"></div>
                  <div className="h-3 w-2/3 rounded bg-muted"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Activity Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No activity recorded yet
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              
              <div className="space-y-6">
                {events.map((event, index) => (
                  <div key={event.id} className="relative flex gap-4">
                    {/* Icon */}
                    <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border ${getEventColor(event.type)}`}>
                      {getEventIcon(event.type)}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 pt-0.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{event.title}</span>
                        {event.metadata?.severity && (
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] ${
                              event.metadata.severity === 'critical' 
                                ? 'border-red-500/50 text-red-400' 
                                : event.metadata.severity === 'high'
                                ? 'border-amber-500/50 text-amber-400'
                                : 'border-muted-foreground/50'
                            }`}
                          >
                            {event.metadata.severity}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                        {' · '}
                        {format(new Date(event.timestamp), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
