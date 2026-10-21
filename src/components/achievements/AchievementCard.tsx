import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Flame, Trophy, Target, TrendingUp, CheckCircle, Award, 
  Phone, PhoneCall, Zap, Users, Handshake, BarChart2, 
  DollarSign, Heart, UserPlus, Shield, Activity, Star
} from "lucide-react";

interface AchievementCardProps {
  achievement: {
    id: string;
    key: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    category: string;
    tier?: string | null;
    is_permanent?: boolean;
  };
  progress?: {
    current_progress: number;
    target_value: number;
    progress_pct: number;
  } | null;
  isEarned?: boolean;
  earnedDate?: string;
  className?: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  flame: Flame,
  trophy: Trophy,
  target: Target,
  'trending-up': TrendingUp,
  'check-circle': CheckCircle,
  award: Award,
  phone: Phone,
  'phone-call': PhoneCall,
  zap: Zap,
  users: Users,
  handshake: Handshake,
  'bar-chart-2': BarChart2,
  'dollar-sign': DollarSign,
  heart: Heart,
  'user-plus': UserPlus,
  shield: Shield,
  activity: Activity,
  star: Star,
};

const colorMap: Record<string, { ring: string; bg: string; text: string }> = {
  orange: { ring: 'ring-orange-500', bg: 'bg-orange-500/20', text: 'text-orange-500' },
  amber: { ring: 'ring-amber-500', bg: 'bg-amber-500/20', text: 'text-amber-500' },
  gold: { ring: 'ring-yellow-500', bg: 'bg-yellow-500/20', text: 'text-yellow-500' },
  slate: { ring: 'ring-slate-400', bg: 'bg-slate-400/20', text: 'text-slate-400' },
  teal: { ring: 'ring-teal-500', bg: 'bg-teal-500/20', text: 'text-teal-500' },
  emerald: { ring: 'ring-emerald-500', bg: 'bg-emerald-500/20', text: 'text-emerald-500' },
  green: { ring: 'ring-green-500', bg: 'bg-green-500/20', text: 'text-green-500' },
  blue: { ring: 'ring-blue-500', bg: 'bg-blue-500/20', text: 'text-blue-500' },
  sky: { ring: 'ring-sky-500', bg: 'bg-sky-500/20', text: 'text-sky-500' },
  indigo: { ring: 'ring-indigo-500', bg: 'bg-indigo-500/20', text: 'text-indigo-500' },
  purple: { ring: 'ring-purple-500', bg: 'bg-purple-500/20', text: 'text-purple-500' },
  rose: { ring: 'ring-rose-500', bg: 'bg-rose-500/20', text: 'text-rose-500' },
};

const tierLabels: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};

export const AchievementCard = ({ 
  achievement, 
  progress, 
  isEarned = false,
  earnedDate,
  className 
}: AchievementCardProps) => {
  const IconComponent = iconMap[achievement.icon] || Award;
  const colors = colorMap[achievement.color] || colorMap.teal;
  const progressPct = progress?.progress_pct ?? 0;
  const currentProgress = progress?.current_progress ?? 0;
  const targetValue = progress?.target_value ?? 0;

  return (
    <div 
      className={cn(
        "relative rounded-xl border border-border bg-card p-5 transition-all duration-200 h-full flex flex-col",
        "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
        isEarned && "border-green-500/50 bg-green-500/10",
        achievement.tier && "pr-24",
        className
      )}
    >
      {/* Tier badge */}
      {achievement.tier && (
        <Badge 
          variant="outline" 
          className={cn(
            "absolute top-3 right-3 text-xs font-medium",
            achievement.tier === 'gold' && "border-yellow-500/50 text-yellow-600 bg-yellow-500/10",
            achievement.tier === 'silver' && "border-slate-400/50 text-slate-500 bg-slate-400/10",
            achievement.tier === 'bronze' && "border-orange-500/50 text-orange-600 bg-orange-500/10",
            achievement.tier === 'platinum' && "border-primary/50 text-primary bg-primary/10"
          )}
        >
          {tierLabels[achievement.tier]}
        </Badge>
      )}

      {/* Icon with progress ring */}
      <div className="flex items-start gap-4">
        <div className="relative">
          {/* Outer ring representing progress */}
          <div 
            className={cn(
              "h-16 w-16 rounded-full flex items-center justify-center",
              "ring-4 ring-muted-foreground/10",
              isEarned && colors.ring
            )}
            style={{
              background: `conic-gradient(hsl(var(--primary)) ${progressPct}%, transparent ${progressPct}%)`,
              padding: '3px',
            }}
          >
            {/* Inner circle with icon */}
            <div className={cn(
              "h-full w-full rounded-full flex items-center justify-center bg-card",
              isEarned && colors.bg
            )}>
              <IconComponent className={cn("h-7 w-7", isEarned ? colors.text : "text-muted-foreground")} />
            </div>
          </div>
          
          {/* Checkmark for earned */}
          {isEarned && (
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-md">
              <CheckCircle className="h-4 w-4 text-white" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground">
            {achievement.name}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
            {achievement.description}
          </p>
          
          {/* Earned date or progress */}
          {isEarned && earnedDate ? (
            <p className="text-xs text-foreground/80 mt-2 font-medium">
              ✓ Earned on {new Date(earnedDate).toLocaleDateString()}
            </p>
          ) : progress && targetValue > 0 && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {currentProgress} / {targetValue}
                </span>
                <span className="font-medium text-foreground">
                  {Math.round(progressPct)}%
                </span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>
          )}
        </div>
      </div>

      {/* Permanent badge - positioned below content with spacing */}
      {achievement.is_permanent && (
        <div className="mt-3 flex justify-end">
          <Badge variant="secondary" className="text-xs">
            Career
          </Badge>
        </div>
      )}
    </div>
  );
};
