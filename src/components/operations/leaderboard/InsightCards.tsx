import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Target, Flame, Award, Medal } from "lucide-react";

interface InsightCardsProps {
  leaderboard: any[];
  earnedAchievementsByEmail?: Record<string, any[]>;
}

export const InsightCards = ({ leaderboard, earnedAchievementsByEmail = {} }: InsightCardsProps) => {
  const getMostConsistent = () => {
    return leaderboard.find(s => s.rank === 1);
  };

  const getHighestConversion = () => {
    if (leaderboard.length === 0) return null;
    return leaderboard.reduce((best, current) => {
      const currentRate = current.dials_made > 0 ? (current.meetings_booked / current.dials_made) * 100 : 0;
      const bestRate = best.dials_made > 0 ? (best.meetings_booked / best.dials_made) * 100 : 0;
      return currentRate > bestRate ? current : best;
    }, leaderboard[0]);
  };

  const getWarmLeadSpecialist = () => {
    if (leaderboard.length === 0) return null;
    return leaderboard.reduce((best, current) => {
      return (current.conversations || 0) > (best.conversations || 0) ? current : best;
    }, leaderboard[0]);
  };

  const getAchievementHunter = () => {
    if (leaderboard.length === 0) return null;
    let best: any = null;
    let bestCount = 0;
    leaderboard.forEach(s => {
      const count = (earnedAchievementsByEmail[s.email] || []).length;
      if (count > bestCount) {
        bestCount = count;
        best = { ...s, badgeCount: count };
      }
    });
    return best;
  };

  const mostConsistent = getMostConsistent();
  const highestConversion = getHighestConversion();
  const warmLeadSpecialist = getWarmLeadSpecialist();
  const achievementHunter = getAchievementHunter();

  const insights = [
    {
      title: "Top Performer",
      setter: mostConsistent,
      icon: Award,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      detail: mostConsistent ? `${mostConsistent.meetings_booked} meetings` : ''
    },
    {
      title: "Highest Call-to-Meeting Conversion",
      setter: highestConversion,
      icon: Target,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      detail: highestConversion && highestConversion.dials_made > 0
        ? `${((highestConversion.meetings_booked / highestConversion.dials_made) * 100).toFixed(1)}% rate`
        : ''
    },
    {
      title: "Warm Lead Specialist",
      setter: warmLeadSpecialist,
      icon: Flame,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      detail: warmLeadSpecialist ? `${warmLeadSpecialist.conversations || 0} warm leads` : ''
    },
    {
      title: "Achievement Hunter",
      setter: achievementHunter,
      icon: Medal,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      detail: achievementHunter ? `${achievementHunter.badgeCount} badges earned` : ''
    }
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        📈 Performance Insights
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {insights.map((insight, idx) => {
          const Icon = insight.icon;
          if (!insight.setter) return null;
          
          return (
            <Card key={idx} className={`border ${insight.bgColor} hover:shadow-lg transition-all duration-300 hover:-translate-y-1`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${insight.color}`} />
                  {insight.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">{insight.setter.name}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {insight.detail}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
