import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, Calendar, TrendingUp, Phone, Clock } from "lucide-react";

interface ProgressBarsProps {
  setter: {
    meetings_booked?: number;
    dials_made?: number;
    talk_time?: number;
    talk_time_seconds?: number;
    daily_dials_target?: number;
    daily_meetings_target?: number;
    daily_talk_time_target?: number;
    weekly_meetings_target?: number;
  };
}

export const ProgressBars = ({ setter }: ProgressBarsProps) => {
  // Use setter's actual targets from setters_profiles, with sensible defaults
  const dailyDialsTarget = setter.daily_dials_target || 150;
  const dailyMeetingsTarget = setter.daily_meetings_target || 2;
  const dailyTalkTimeTarget = setter.daily_talk_time_target || 90; // minutes
  const weeklyMeetingsTarget = setter.weekly_meetings_target || 6;
  
  const currentDials = setter.dials_made || 0;
  const currentMeetings = setter.meetings_booked || 0;
  const currentTalkTime = Math.floor((setter.talk_time_seconds || setter.talk_time || 0) / 60); // convert seconds to minutes
  
  const dialsProgress = Math.min((currentDials / dailyDialsTarget) * 100, 100);
  const dailyMeetingsProgress = Math.min((currentMeetings / dailyMeetingsTarget) * 100, 100);
  const talkTimeProgress = Math.min((currentTalkTime / dailyTalkTimeTarget) * 100, 100);
  const weeklyMeetingsProgress = Math.min((currentMeetings / weeklyMeetingsTarget) * 100, 100);

  return (
    <div>
      <h4 className="font-semibold mb-3 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        Progress Tracking
      </h4>
      <div className="space-y-4">
        {/* Daily Dials */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Daily Dials</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {currentDials} / {dailyDialsTarget}
              </span>
            </div>
            <Progress value={dialsProgress} className="h-3" />
          </CardContent>
        </Card>
        
        {/* Daily Meetings */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Daily Meetings</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {currentMeetings} / {dailyMeetingsTarget}
              </span>
            </div>
            <Progress value={dailyMeetingsProgress} className="h-3" />
          </CardContent>
        </Card>

        {/* Talk Time */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Talk Time</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {currentTalkTime}m / {dailyTalkTimeTarget}m
              </span>
            </div>
            <Progress value={talkTimeProgress} className="h-3" />
          </CardContent>
        </Card>
        
        {/* Weekly Meetings */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Weekly Meetings</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {currentMeetings} / {weeklyMeetingsTarget}
              </span>
            </div>
            <Progress value={weeklyMeetingsProgress} className="h-3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
