import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Flame, Trophy, Target, TrendingUp, CheckCircle, Award,
  Phone, PhoneCall, Zap, Users, Handshake, BarChart2,
  DollarSign, Heart, UserPlus, Shield, Activity, Star,
  Lightbulb, ArrowRight
} from "lucide-react";

interface AchievementDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    criteria?: any;
  } | null;
  progress?: {
    current_progress: number;
    target_value: number;
    progress_pct: number;
  } | null;
  isEarned?: boolean;
  earnedDate?: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  flame: Flame, trophy: Trophy, target: Target, 'trending-up': TrendingUp,
  'check-circle': CheckCircle, award: Award, phone: Phone, 'phone-call': PhoneCall,
  zap: Zap, users: Users, handshake: Handshake, 'bar-chart-2': BarChart2,
  'dollar-sign': DollarSign, heart: Heart, 'user-plus': UserPlus,
  shield: Shield, activity: Activity, star: Star,
};

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-500', border: 'border-orange-500/30' },
  amber: { bg: 'bg-amber-500/20', text: 'text-amber-500', border: 'border-amber-500/30' },
  gold: { bg: 'bg-yellow-500/20', text: 'text-yellow-500', border: 'border-yellow-500/30' },
  slate: { bg: 'bg-slate-400/20', text: 'text-slate-400', border: 'border-slate-400/30' },
  teal: { bg: 'bg-teal-500/20', text: 'text-teal-500', border: 'border-teal-500/30' },
  emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-500', border: 'border-emerald-500/30' },
  green: { bg: 'bg-green-500/20', text: 'text-green-500', border: 'border-green-500/30' },
  blue: { bg: 'bg-blue-500/20', text: 'text-blue-500', border: 'border-blue-500/30' },
  sky: { bg: 'bg-sky-500/20', text: 'text-sky-500', border: 'border-sky-500/30' },
  indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-500', border: 'border-indigo-500/30' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-500', border: 'border-purple-500/30' },
  rose: { bg: 'bg-rose-500/20', text: 'text-rose-500', border: 'border-rose-500/30' },
};

const tierLabels: Record<string, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };

function getTipsForCategory(category: string, key: string): string[] {
  const tips: Record<string, string[]> = {
    streak: [
      "Consistency is key — aim to hit your daily targets every single day",
      "Set a morning routine to start calls early and build momentum",
      "Track your streak visually to stay motivated",
    ],
    quantity: [
      "Focus on volume — the more dials you make, the more meetings you'll book",
      "Block dedicated calling time in your calendar",
      "Use power hours to push through large call volumes",
    ],
    quality: [
      "Focus on meaningful conversations that convert",
      "Review your best calls and replicate the approach",
      "Ask your manager for coaching on pitch refinement",
    ],
    improvement: [
      "Compare your current week to last week's performance",
      "Set small weekly goals that build toward the achievement",
      "Celebrate incremental progress to stay motivated",
    ],
  };
  return tips[category] || tips.quantity;
}

export const AchievementDetailModal = ({
  open, onOpenChange, achievement, progress, isEarned = false, earnedDate
}: AchievementDetailModalProps) => {
  if (!achievement) return null;

  const IconComponent = iconMap[achievement.icon] || Award;
  const colors = colorMap[achievement.color] || colorMap.teal;
  const progressPct = progress?.progress_pct ?? 0;
  const currentProgress = progress?.current_progress ?? 0;
  const targetValue = progress?.target_value ?? 0;
  const hasProgress = targetValue > 0 && currentProgress > 0;

  const status = isEarned ? 'earned' : hasProgress ? 'in_progress' : 'not_started';
  const tips = getTipsForCategory(achievement.category, achievement.key);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">{achievement.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Icon + Name */}
          <div className="flex items-center gap-4">
            <div className={cn(
              "h-16 w-16 rounded-full flex items-center justify-center shrink-0",
              colors.bg, isEarned && "ring-4 ring-emerald-500/30"
            )}>
              <IconComponent className={cn("h-8 w-8", colors.text)} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-foreground">{achievement.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs capitalize">{achievement.category}</Badge>
                {achievement.tier && (
                  <Badge variant="outline" className={cn("text-xs",
                    achievement.tier === 'gold' && "border-yellow-500/50 text-yellow-600",
                    achievement.tier === 'silver' && "border-slate-400/50 text-slate-500",
                    achievement.tier === 'bronze' && "border-orange-500/50 text-orange-600",
                    achievement.tier === 'platinum' && "border-primary/50 text-primary"
                  )}>
                    {tierLabels[achievement.tier]}
                  </Badge>
                )}
                {achievement.is_permanent && (
                  <Badge variant="secondary" className="text-xs">Career</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground">{achievement.description}</p>

          {/* Status Section */}
          {status === 'earned' && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Achievement Earned!</span>
              </div>
              {earnedDate && (
                <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80">
                  Earned on {new Date(earnedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
              {targetValue > 0 && (
                <p className="text-sm text-muted-foreground">
                  You completed {targetValue} / {targetValue} — well done!
                </p>
              )}
            </div>
          )}

          {status === 'in_progress' && (
            <div className="space-y-3">
              <div className={cn("rounded-lg border p-4 space-y-3", colors.border)}>
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-foreground">In Progress</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{currentProgress} / {targetValue}</span>
                    <span className="font-medium">{Math.round(progressPct)}%</span>
                  </div>
                  <Progress value={progressPct} className="h-3" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {targetValue - currentProgress} more to go — keep pushing!
                </p>
              </div>

              {/* Tips */}
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold">Tips to Achieve</span>
                </div>
                <ul className="space-y-1.5">
                  {tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {status === 'not_started' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold text-foreground">Not Started Yet</span>
                </div>
                {targetValue > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Target: {targetValue} — start working toward this goal!
                  </p>
                )}
              </div>

              {/* How to obtain */}
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold">How to Earn This</span>
                </div>
                <ul className="space-y-1.5">
                  {tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
