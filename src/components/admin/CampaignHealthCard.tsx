import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  Calendar,
  Users,
  CheckCircle2,
  Trash2
} from "lucide-react";
import { CampaignHealthIndicator, getHealthColorClasses } from "@/lib/clientHealth";

interface Campaign {
  id: string;
  name: string;
  status: string;
  meetings_booked: number;
  meeting_target: number;
  calls_outbound: number;
  call_target: number;
  meetings_sat: number;
  launch_date: string | null;
}

interface CampaignHealthCardProps {
  campaign: Campaign;
  healthIndicator: CampaignHealthIndicator;
  assignedSetters?: string[];
  onClick?: () => void;
  onDelete?: (campaignId: string) => void;
}

export function CampaignHealthCard({ 
  campaign, 
  healthIndicator, 
  assignedSetters = [],
  onClick,
  onDelete
}: CampaignHealthCardProps) {
  const healthColors = getHealthColorClasses(healthIndicator.health);
  
  const meetingsProgress = campaign.meeting_target > 0 
    ? Math.min(100, (campaign.meetings_booked / campaign.meeting_target) * 100)
    : 0;

  const TrendIcon = healthIndicator.meetingsTrend === 'up' 
    ? TrendingUp 
    : healthIndicator.meetingsTrend === 'down' 
    ? TrendingDown 
    : Minus;

  const trendColor = healthIndicator.meetingsTrend === 'up' 
    ? 'text-green-400' 
    : healthIndicator.meetingsTrend === 'down' 
    ? 'text-red-400' 
    : 'text-muted-foreground';

  return (
    <Card 
      className={`border-border shadow-card transition-all hover:shadow-lg ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base">{campaign.name}</CardTitle>
              <Badge 
                variant="outline" 
                className={`text-[10px] ${
                  campaign.status === 'active' 
                    ? 'bg-green-500/10 text-green-400 border-green-500/30' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}
              >
                {campaign.status}
              </Badge>
            </div>
            {campaign.launch_date && (
              <p className="text-xs text-muted-foreground">
                Launched {new Date(campaign.launch_date).toLocaleDateString()}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Health Score Badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${healthColors.bg} ${healthColors.border} border`}>
              <div className={`h-2 w-2 rounded-full ${healthColors.dot}`} />
              <span className={`text-sm font-medium ${healthColors.text}`}>
                {healthIndicator.score}%
              </span>
            </div>
            
            {/* Delete Button */}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(campaign.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* KPIs Grid - Assigned Setters, Meetings Booked, Meetings SAT */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              Assigned Setters
            </div>
            <p className="text-lg font-semibold">{assignedSetters.length}</p>
            {assignedSetters.length > 0 && (
              <p className="text-[10px] text-muted-foreground truncate">
                {assignedSetters.slice(0, 2).join(', ')}{assignedSetters.length > 2 ? ` +${assignedSetters.length - 2}` : ''}
              </p>
            )}
            {assignedSetters.length === 0 && (
              <p className="text-[10px] text-amber-400">None assigned</p>
            )}
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Meetings Booked
            </div>
            <div className="flex items-center gap-1">
              <p className="text-lg font-semibold">{campaign.meetings_booked}</p>
              <TrendIcon className={`h-4 w-4 ${trendColor}`} />
            </div>
            <Progress value={meetingsProgress} className="h-1" />
            <p className="text-[10px] text-muted-foreground">
              {Math.round(meetingsProgress)}% of {campaign.meeting_target}
            </p>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" />
              Meetings SAT
            </div>
            <p className="text-lg font-semibold">{campaign.meetings_sat}</p>
            {campaign.meetings_booked > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {Math.round((campaign.meetings_sat / campaign.meetings_booked) * 100)}% show rate
              </p>
            )}
          </div>
        </div>

        {/* Flags/Issues */}
        {healthIndicator.flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {healthIndicator.flags.map((flag, i) => (
              <Badge 
                key={i} 
                variant="outline" 
                className="text-[10px] bg-red-500/10 text-red-400 border-red-500/30"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                {flag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
