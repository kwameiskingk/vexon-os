import { useState } from "react";
import { getTitleLabel, getTitleBadgeClasses } from "@/lib/setterTitles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Medal, Award, Phone, MessageSquare, Briefcase, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { AchievementBadges } from "./AchievementBadges";
import { PerformanceStreak } from "./PerformanceStreak";
import { ProgressBars } from "./ProgressBars";
import { AchievementCard } from "@/components/achievements/AchievementCard";
import { UserAvatar } from "@/components/ui/user-avatar";
import { 
  getTrendStatus, 
  getTrendColorClass 
} from "@/lib/trends";
import { useAvatarMapByEmail } from "@/hooks/useAvatarMap";

interface LeaderboardTableProps {
  leaderboard: any[];
  achievements?: any[];
  performanceData?: any[];
  previousWeekData?: any[];
  achievementDefinitions?: any[];
  earnedAchievementsByEmail?: Record<string, any[]>;
}

export const LeaderboardTable = ({ leaderboard, achievements, performanceData, previousWeekData, achievementDefinitions, earnedAchievementsByEmail }: LeaderboardTableProps) => {
  const [selectedSetter, setSelectedSetter] = useState<any>(null);
  const avatarMap = useAvatarMapByEmail(leaderboard.map(s => s.email));

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
    return <span className="text-sm text-muted-foreground">#{rank}</span>;
  };

  const getSetterAchievements = (email: string) => {
    if (!achievements) return [];
    return achievements.filter(a => a.email?.toLowerCase() === email?.toLowerCase());
  };

  const getSetterTrend = (email: string) => {
    if (!performanceData || !previousWeekData) return null;
    const currentData = performanceData.filter(p => p.email?.toLowerCase() === email?.toLowerCase());
    const previousData = previousWeekData.filter(p => p.email?.toLowerCase() === email?.toLowerCase());
    if (currentData.length === 0 && previousData.length === 0) return null;
    const currentMeetings = currentData.reduce((sum, p) => sum + (p.meetings_booked || 0), 0);
    const previousMeetings = previousData.reduce((sum, p) => sum + (p.meetings_booked || 0), 0);
    if (previousMeetings === 0) return currentMeetings > 0 ? 100 : 0;
    return ((currentMeetings - previousMeetings) / previousMeetings) * 100;
  };

  const getTrendIcon = (trend: number | null) => {
    if (trend === null) return null;
    const status = getTrendStatus(trend);
    const Icon = status === 'improving' ? TrendingUp : status === 'declining' ? TrendingDown : Minus;
    const colorClass = getTrendColorClass(trend);
    return <Icon className={`h-3.5 w-3.5 ${colorClass}`} />;
  };

  const formatTalkTime = (seconds: number) => {
    const mins = Math.round(seconds / 60);
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    if (hours > 0) return `${hours}h ${remainMins}m`;
    return `${mins}m`;
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-14">Rank</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Meetings</TableHead>
              <TableHead className="text-right">Talk Time</TableHead>
              <TableHead className="text-right">Calls</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaderboard.map((setter) => (
              <TableRow 
                key={setter.email} 
                className="cursor-pointer hover:bg-muted/30 transition-colors duration-200 animate-fade-in"
                onClick={() => setSelectedSetter(setter)}
              >
                <TableCell>
                  <div className="flex items-center justify-center">
                    {getRankBadge(setter.rank)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <UserAvatar name={setter.name} avatarUrl={setter.avatar_url || avatarMap.get(setter.email?.toLowerCase())} size="sm" />
                      {getTrendIcon(getSetterTrend(setter.email))}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{setter.name}</p>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTitleBadgeClasses(setter.title)}`}>
                          {getTitleLabel(setter.title)}
                        </Badge>
                        {(setter.achievement_count || 0) > 0 && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            🏅 {setter.achievement_count}
                          </Badge>
                        )}
                      </div>
                      <AchievementBadges 
                        achievements={getSetterAchievements(setter.email)} 
                        compact 
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {setter.department}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold text-primary">{setter.meetings_booked || 0}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold">{formatTalkTime(setter.talk_time_seconds || 0)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold">{setter.dials_made || 0}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selectedSetter} onOpenChange={(open) => !open && setSelectedSetter(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <UserAvatar name={selectedSetter?.name || ""} avatarUrl={selectedSetter?.avatar_url || avatarMap.get(selectedSetter?.email?.toLowerCase())} size="lg" />
              <div>
                <h3 className="text-2xl font-bold">{selectedSetter?.name}</h3>
                <p className="text-sm text-muted-foreground capitalize">{selectedSetter?.department}</p>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedSetter && (
            <div className="space-y-6 mt-4">
              <PerformanceStreak 
                email={selectedSetter.email} 
                performanceData={performanceData} 
              />

              <ProgressBars setter={selectedSetter} />

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Performance Stats
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <Trophy className="h-8 w-8 text-primary" />
                        <div>
                          <p className="text-sm text-muted-foreground">Meetings Booked</p>
                          <p className="text-3xl font-bold">{selectedSetter.meetings_booked || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <Phone className="h-8 w-8 text-primary" />
                        <div>
                          <p className="text-sm text-muted-foreground">Calls Made</p>
                          <p className="text-3xl font-bold">{selectedSetter.dials_made || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <Briefcase className="h-8 w-8 text-primary" />
                        <div>
                          <p className="text-sm text-muted-foreground">Talk Time</p>
                          <p className="text-3xl font-bold">{formatTalkTime(selectedSetter.talk_time_seconds || 0)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="h-8 w-8 text-primary" />
                        <div>
                          <p className="text-sm text-muted-foreground">Warm Leads</p>
                          <p className="text-3xl font-bold">{selectedSetter.conversations || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Achievements Section */}
              {(() => {
                const email = selectedSetter.email?.toLowerCase();
                const earned = earnedAchievementsByEmail?.[email] || [];
                if (earned.length === 0 && (!achievementDefinitions || achievementDefinitions.length === 0)) {
                  return (
                    <AchievementBadges 
                      achievements={getSetterAchievements(selectedSetter.email)} 
                      compact={false}
                    />
                  );
                }
                return (
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      🏅 Achievements
                      {earned.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {earned.length} earned
                        </Badge>
                      )}
                    </h4>
                    {earned.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {earned.map((a: any) => (
                          <AchievementCard
                            key={a.id}
                            achievement={a.achievement_definitions}
                            isEarned={true}
                            earnedDate={a.earned_at}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No achievements earned yet this month.</p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
