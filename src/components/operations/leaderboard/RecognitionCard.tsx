import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Award, Star } from "lucide-react";

interface RecognitionCardProps {
  award: any;
  onClick?: () => void;
}

const badgeTypeConfig: Record<string, { color: string; icon: any }> = {
  excellence: { color: "from-purple-500/20 to-purple-600/10 border-purple-500/30", icon: Star },
  loyalty: { color: "from-blue-500/20 to-blue-600/10 border-blue-500/30", icon: Award },
  leadership: { color: "from-amber-500/20 to-amber-600/10 border-amber-500/30", icon: Star },
  innovation: { color: "from-green-500/20 to-green-600/10 border-green-500/30", icon: Star },
  teamwork: { color: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30", icon: Award },
  dedication: { color: "from-rose-500/20 to-rose-600/10 border-rose-500/30", icon: Award },
  achievement: { color: "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30", icon: Star },
  outstanding_performance: { color: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30", icon: Star },
};

export const RecognitionCard = ({ award, onClick }: RecognitionCardProps) => {
  if (!award) return null;

  const config = badgeTypeConfig[award.badge_type] || badgeTypeConfig.excellence;
  const Icon = config.icon;
  
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getBadgeLabel = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <Card 
      className={`relative overflow-hidden border-2 bg-gradient-to-br ${config.color} hover:shadow-xl transition-all duration-300 hover:-translate-y-2 animate-fade-in cursor-pointer`}
      onClick={onClick}
    >
      <div className="absolute top-0 right-0 opacity-10">
        <Icon className="h-40 w-40" />
      </div>
      
      <CardHeader className="relative z-10 pb-3">
        <div className="flex items-center justify-between mb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Recognition Award</CardTitle>
          <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">
            {getBadgeLabel(award.badge_type)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="relative z-10">
        <div className="flex items-center gap-4 mb-4">
          <Avatar className="h-16 w-16 border-2 border-background shadow-lg">
            <AvatarFallback className="text-xl font-bold bg-primary/20 text-primary">
              {getInitials(award.recipient_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="text-xl font-bold">{award.recipient_name}</h3>
            <p className="text-sm text-muted-foreground">{award.recipient_email}</p>
          </div>
        </div>

        <div className="bg-background/50 rounded-lg p-4 border border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Award className="h-4 w-4 text-primary" />
            <p className="text-xs text-muted-foreground font-semibold">Award Title</p>
          </div>
          <p className="text-lg font-bold">{award.award_title}</p>
          {award.notes && (
            <p className="text-sm text-muted-foreground mt-2">{award.notes}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
