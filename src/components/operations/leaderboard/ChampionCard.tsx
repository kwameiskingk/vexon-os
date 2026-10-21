import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Award, Star, TrendingUp, Phone, MessageSquare, Crown } from "lucide-react";

interface ChampionCardProps {
  setter: any;
  title: string;
  badgeColor: "gold" | "silver" | "blue";
  period: "month" | "week";
}

const badgeConfig = {
  gold: {
    bg: "bg-gradient-to-br from-primary/20 to-primary/10",
    border: "border-primary/30",
    icon: "text-primary",
    badge: "bg-primary/20 text-primary border-primary/30"
  },
  silver: {
    bg: "bg-gradient-to-br from-white/[0.08] to-white/[0.04]",
    border: "border-white/[0.15]",
    icon: "text-muted-foreground",
    badge: "bg-white/[0.08] text-muted-foreground border-white/[0.15]"
  },
  blue: {
    bg: "bg-gradient-to-br from-primary/15 to-primary/8",
    border: "border-primary/25",
    icon: "text-primary/80",
    badge: "bg-primary/15 text-primary/90 border-primary/25"
  }
};

export const ChampionCard = ({ setter, title, badgeColor, period }: ChampionCardProps) => {
  if (!setter) return null;

  const config = badgeConfig[badgeColor];
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <Card className={`relative overflow-hidden border-2 ${config.border} ${config.bg} hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 animate-fade-in cursor-pointer`}>
      <div className="absolute top-0 right-0 opacity-10">
        {badgeColor === "gold" ? (
          <Trophy className={`h-32 w-32 ${config.icon}`} />
        ) : badgeColor === "blue" ? (
          <Star className={`h-32 w-32 ${config.icon}`} />
        ) : (
          <Award className={`h-32 w-32 ${config.icon}`} />
        )}
      </div>
      
      <CardHeader className="relative z-10 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
          <Badge variant="outline" className={`${config.badge} text-xs`}>
            {period === "month" ? "Monthly" : "Weekly"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="relative z-10 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            {setter.rank === 1 && (
              <Crown className={`absolute -top-5 left-1/2 -translate-x-1/2 h-5 w-5 ${config.icon} animate-pulse`} />
            )}
            <Avatar className="h-12 w-12 border-2 border-background shadow-lg">
              <AvatarFallback className={`text-lg font-bold bg-${config.icon.replace('text-', '')}/20 ${config.icon}`}>
                {getInitials(setter.name)}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold truncate">{setter.name}</h3>
            <p className="text-xs text-muted-foreground capitalize">{setter.department}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-background/50 rounded-lg p-2 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <Trophy className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground">Meetings</p>
            </div>
            <p className="text-xl font-bold">{setter.meetings_booked || 0}</p>
          </div>
          <div className="bg-background/50 rounded-lg p-2 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <Phone className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground">Calls</p>
            </div>
            <p className="text-xl font-bold">{setter.dials_made || 0}</p>
          </div>
          <div className="bg-background/50 rounded-lg p-2 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground">Warm Leads</p>
            </div>
            <p className="text-xl font-bold">{setter.conversations || 0}</p>
          </div>
          <div className="bg-background/50 rounded-lg p-2 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground">Talk Time</p>
            </div>
            <p className="text-xl font-bold">{Math.round((setter.talk_time_seconds || 0) / 60)}m</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
