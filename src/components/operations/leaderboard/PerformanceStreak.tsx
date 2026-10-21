import { Card, CardContent } from "@/components/ui/card";
import { Flame, Trophy } from "lucide-react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format } from "date-fns";

interface PerformanceStreakProps {
  email: string;
  performanceData?: any[];
}

export const PerformanceStreak = ({ email, performanceData }: PerformanceStreakProps) => {
  if (!performanceData) return null;

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const setterData = performanceData.filter(
    p => p.email?.toLowerCase() === email?.toLowerCase()
  );

  // Calculate meeting streak
  let meetingStreak = 0;
  let currentMeetingStreak = 0;
  
  daysInMonth.forEach(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayData = setterData.find(d => d.date === dayStr);
    
    if (dayData && dayData.meetings_booked > 0) {
      currentMeetingStreak++;
      meetingStreak = Math.max(meetingStreak, currentMeetingStreak);
    } else {
      currentMeetingStreak = 0;
    }
  });

  // Calculate top 3 streak
  let top3Streak = 0;
  let currentTop3Streak = 0;
  
  daysInMonth.forEach(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayData = performanceData.filter(d => d.date === dayStr);
    const sorted = dayData.sort((a, b) => (b.meetings_booked || 0) - (a.meetings_booked || 0));
    const top3 = sorted.slice(0, 3);
    
    if (top3.some(s => s.email?.toLowerCase() === email?.toLowerCase())) {
      currentTop3Streak++;
      top3Streak = Math.max(top3Streak, currentTop3Streak);
    } else {
      currentTop3Streak = 0;
    }
  });

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card className="border-2 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-background">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Flame className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-sm text-muted-foreground">Performance Streak</p>
              <p className="text-2xl font-bold">{meetingStreak} days</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-2 border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-background">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Trophy className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-sm text-muted-foreground">Top 3 Streak</p>
              <p className="text-2xl font-bold">{top3Streak} days</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
