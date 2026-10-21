import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Phone, MessageSquare, Star, Award } from "lucide-react";
import * as LucideIcons from "lucide-react";

interface UserProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  isAdmin?: boolean;
}

const getLucideIcon = (iconName: string) => {
  const icons = LucideIcons as any;
  const pascalName = iconName
    .split(/[-_]/)
    .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  return icons[pascalName] || Award;
};

export const UserProfileModal = ({ open, onOpenChange, user, isAdmin }: UserProfileModalProps) => {
  const userEmail = user?.email;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: achievements } = useQuery({
    queryKey: ['user-profile-achievements', userEmail, currentMonth],
    queryFn: async () => {
      if (!userEmail) return [];

      const { data: earned } = await supabase
        .from('leaderboard_achievements')
        .select('achievement_key, tier, date_awarded, achievement_definitions(name, icon, color, tier, category)')
        .eq('email', userEmail)
        .eq('month_awarded', currentMonth);

      return earned || [];
    },
    enabled: open && !!userEmail && !isAdmin,
  });

  if (!user) return null;

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  if (isAdmin) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Admin Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-2 border-primary/20">
                <AvatarFallback className="text-2xl font-bold bg-primary/20 text-primary">
                  {getInitials(user.name || user.recipient_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-xl font-bold">{user.name || user.recipient_name}</h3>
                <p className="text-sm text-muted-foreground">{user.email || user.recipient_email}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Setter Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              {user.rank === 1 && (
                <Trophy className="absolute -top-6 left-1/2 -translate-x-1/2 h-6 w-6 text-yellow-500 animate-pulse" />
              )}
              <Avatar className="h-20 w-20 border-2 border-primary/20">
                <AvatarFallback className="text-2xl font-bold bg-primary/20 text-primary">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold">{user.name}</h3>
              <p className="text-sm text-muted-foreground capitalize">{user.department}</p>
              {user.rank && (
                <p className="text-sm font-semibold text-primary mt-1">Rank #{user.rank}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">Meetings Booked</p>
              </div>
              <p className="text-2xl font-bold">{user.meetings_booked || 0}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <Phone className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">Calls Made</p>
              </div>
              <p className="text-2xl font-bold">{user.dials_made || 0}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">Conversations</p>
              </div>
              <p className="text-2xl font-bold">{user.conversations || 0}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <Star className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">Talk Time (min)</p>
              </div>
              <p className="text-2xl font-bold">{user.talk_time || 0}</p>
            </div>
          </div>

          {/* Achievements */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏅</span>
              <h4 className="font-semibold">Achievements</h4>
            </div>
            {achievements && achievements.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {achievements.map((a: any, idx: number) => {
                  const def = a.achievement_definitions;
                  const name = def?.name || a.achievement_key;
                  const icon = def?.icon;
                  const Icon = icon ? getLucideIcon(icon) : Award;
                  const tier = a.tier || def?.tier;
                  return (
                    <Badge
                      key={idx}
                      variant="outline"
                      className="flex items-center gap-1.5 px-3 py-1.5 border-primary/30 bg-primary/10 text-primary"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{name}</span>
                      {tier && (
                        <span className="text-[10px] opacity-70 capitalize">({tier})</span>
                      )}
                    </Badge>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No achievements earned yet this month.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
