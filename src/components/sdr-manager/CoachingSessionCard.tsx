import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, CheckSquare, Clock, Play, Star } from "lucide-react";
import { format, isToday } from "date-fns";

interface CoachingSessionCardProps {
  session: {
    id: string;
    session_date: string;
    session_time?: string | null;
    session_type: string;
    custom_session_label?: string | null;
    status?: string;
    observations?: string | null;
    improvements?: string | null;
    action_items?: string[] | null;
    overall_rating?: number | null;
    agenda?: string | null;
    call_recording_link?: string | null;
    setters_profiles?: { full_name: string } | null;
  };
  getSessionTypeBadge: (type: string, customLabel?: string | null) => JSX.Element;
  onClick?: () => void;
  onStartSession?: () => void;
}

const sessionTypeColors: Record<string, string> = {
  onboarding: 'border-l-blue-500',
  weekly_1to1: 'border-l-green-500',
  pip_review: 'border-l-red-500',
  call_review: 'border-l-purple-500',
  custom: 'border-l-muted-foreground',
};

const CoachingSessionCard = ({ session, getSessionTypeBadge, onClick, onStartSession }: CoachingSessionCardProps) => {
  const isScheduled = session.status === 'scheduled';
  const canStart = isScheduled && isToday(new Date(session.session_date));

  return (
    <Card
      className={`bg-card/50 backdrop-blur border-border/50 cursor-pointer hover:bg-accent/30 transition-all border-l-4 ${sessionTypeColors[session.session_type] || sessionTypeColors.custom}`}
      onClick={onClick}
    >
      <CardContent className="py-4 px-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">
              {(session.setters_profiles as any)?.full_name}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {format(new Date(session.session_date), 'MMM d, yyyy')}
              </div>
              {session.session_time && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {session.session_time}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {getSessionTypeBadge(session.session_type, session.custom_session_label)}
          </div>
        </div>

        {/* Agenda preview for scheduled */}
        {isScheduled && session.agenda && (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-2.5 py-1.5 line-clamp-2">
            📋 {session.agenda}
          </div>
        )}

        {/* Content */}
        {isScheduled ? (
          canStart ? (
            <Button
              size="sm"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                onStartSession?.();
              }}
            >
              <Play className="h-4 w-4 mr-2" />
              Start Session
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-1">
              Session available on the day
            </p>
          )
        ) : (
          <div className="space-y-2">
            {/* Rating */}
            {session.overall_rating && (
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={`h-3.5 w-3.5 ${i < session.overall_rating! ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}
                  />
                ))}
              </div>
            )}

            {session.improvements && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Focus</p>
                <p className="text-xs line-clamp-1 mt-0.5">{session.improvements}</p>
              </div>
            )}

            {session.action_items && session.action_items.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckSquare className="h-3 w-3" />
                {session.action_items.length} action item{session.action_items.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CoachingSessionCard;
