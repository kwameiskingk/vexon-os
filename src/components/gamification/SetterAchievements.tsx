import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Zap, Flame, Target, Award, TrendingUp } from "lucide-react";

interface SetterAchievementsProps {
  achievements: any[];
}

const achievementConfig: Record<string, { icon: any; color: string; label: string }> = {
  power_booker: {
    icon: Star,
    color: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
    label: "Power Booker"
  },
  elite_closer: {
    icon: Zap,
    color: "bg-purple-500/20 text-purple-600 border-purple-500/30",
    label: "Elite Closer"
  },
  machine_mode: {
    icon: Flame,
    color: "bg-orange-500/20 text-orange-600 border-orange-500/30",
    label: "Machine Mode"
  },
  lead_magnet: {
    icon: Target,
    color: "bg-blue-500/20 text-blue-600 border-blue-500/30",
    label: "Lead Magnet"
  },
  rising_star: {
    icon: TrendingUp,
    color: "bg-green-500/20 text-green-600 border-green-500/30",
    label: "Rising Star"
  }
};

export const SetterAchievements = ({ achievements }: SetterAchievementsProps) => {
  if (!achievements || achievements.length === 0) return null;

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          Your Achievements
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {achievements.map((achievement, idx) => {
            const config = achievementConfig[achievement.achievement_key];
            if (!config) return null;
            const Icon = config.icon;
            return (
              <Badge 
                key={idx} 
                variant="outline" 
                className={`${config.color} flex items-center gap-1.5 px-3 py-1.5 animate-fade-in`}
              >
                <Icon className="h-4 w-4" />
                <span>{config.label}</span>
              </Badge>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
