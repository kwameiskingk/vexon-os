import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Award, CheckCircle, Users, TrendingUp, ChevronRight,
  Flame, Trophy, Target, Phone, PhoneCall, Zap, Handshake, BarChart2,
  DollarSign, Heart, UserPlus, Shield, Activity, Star
} from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  flame: Flame, trophy: Trophy, target: Target, 'trending-up': TrendingUp,
  'check-circle': CheckCircle, award: Award, phone: Phone, 'phone-call': PhoneCall,
  zap: Zap, users: Users, handshake: Handshake, 'bar-chart-2': BarChart2,
  'dollar-sign': DollarSign, heart: Heart, 'user-plus': UserPlus, shield: Shield,
  activity: Activity, star: Star,
};

export const AdminSetterAchievementProgress = () => {
  const [selectedSetter, setSelectedSetter] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: setters = [], isLoading: settersLoading } = useQuery({
    queryKey: ['admin-setters-for-achievements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setters_profiles')
        .select('id, user_id, full_name, email, department')
        .eq('active', true)
        .neq('department', 'sales') // AE telemetry rows, not achievement subjects
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: definitions = [] } = useQuery({
    queryKey: ['admin-setter-achievement-defs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('achievement_definitions')
        .select('*')
        .eq('is_active', true)
        .or('target_role.eq.setter,target_role.eq.all')
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: progressRecords = [], isLoading: progressLoading } = useQuery({
    queryKey: ['admin-all-setter-progress'],
    queryFn: async () => {
      const userIds = setters.filter(s => s.user_id).map(s => s.user_id!);
      if (!userIds.length) return [];
      const { data, error } = await supabase
        .from('user_achievement_progress')
        .select('*')
        .in('user_id', userIds);
      if (error) throw error;
      return data || [];
    },
    enabled: setters.length > 0,
  });

  const { data: earnedRecords = [] } = useQuery({
    queryKey: ['admin-all-setter-earned'],
    queryFn: async () => {
      const emails = setters.filter(s => s.email).map(s => s.email!);
      if (!emails.length) return [];
      const { data, error } = await supabase
        .from('leaderboard_achievements')
        .select('*')
        .in('email', emails)
        .not('achievement_definition_id', 'is', null);
      if (error) throw error;
      return data || [];
    },
    enabled: setters.length > 0,
  });

  if (settersLoading || progressLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  const getSetterStats = (setter: any) => {
    const earned = earnedRecords.filter(e => e.email?.toLowerCase() === setter.email?.toLowerCase());
    const progress = progressRecords.filter(p => p.user_id === setter.user_id);
    const inProgress = progress.filter(p => p.progress_pct > 0 && p.progress_pct < 100).length;
    return { earnedCount: earned.length, inProgressCount: inProgress };
  };

  const totalEarned = earnedRecords.length;
  const settersWithProgress = new Set(progressRecords.filter(p => p.progress_pct > 0).map(p => p.user_id)).size;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Users className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-xl font-bold">{setters.length}</p>
            <p className="text-xs text-muted-foreground">Active Setters</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-xl font-bold">{settersWithProgress}</p>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Award className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-xl font-bold">{totalEarned}</p>
            <p className="text-xs text-muted-foreground">Total Badges Earned</p>
          </CardContent>
        </Card>
      </div>

      {/* Setter compact cards */}
      {setters.length === 0 ? (
        <EmptyState icon={Users} title="No active setters" description="No setters found." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {setters.filter(s => s.user_id).map(setter => {
            const { earnedCount, inProgressCount } = getSetterStats(setter);
            return (
              <Card
                key={setter.id}
                className="cursor-pointer hover:border-primary/40 transition-colors group"
                onClick={() => { setSelectedSetter(setter); setModalOpen(true); }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">
                      {(setter.full_name || setter.email || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{setter.full_name || setter.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {earnedCount > 0 && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">{earnedCount} earned</Badge>
                      )}
                      {inProgressCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{inProgressCount} in progress</Badge>
                      )}
                      {earnedCount === 0 && inProgressCount === 0 && (
                        <span className="text-[10px] text-muted-foreground">No progress yet</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <SetterDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        setter={selectedSetter}
        definitions={definitions}
        progressRecords={progressRecords}
        earnedRecords={earnedRecords}
      />
    </div>
  );
};

function SetterDetailModal({ open, onOpenChange, setter, definitions, progressRecords, earnedRecords }: {
  open: boolean; onOpenChange: (v: boolean) => void; setter: any;
  definitions: any[]; progressRecords: any[]; earnedRecords: any[];
}) {
  if (!setter) return null;

  const setterProgress = progressRecords.filter(p => p.user_id === setter.user_id);
  const setterEarned = earnedRecords.filter(e => e.email?.toLowerCase() === setter.email?.toLowerCase());
  const earnedDefIds = new Set(setterEarned.map(e => e.achievement_definition_id));

  const earned = definitions.filter(d => earnedDefIds.has(d.id));
  const inProgress = definitions.filter(d => {
    if (earnedDefIds.has(d.id)) return false;
    const prog = setterProgress.find(p => p.achievement_definition_id === d.id);
    return prog && prog.progress_pct > 0;
  });
  const notStarted = definitions.filter(d => {
    if (earnedDefIds.has(d.id)) return false;
    const prog = setterProgress.find(p => p.achievement_definition_id === d.id);
    return !prog || prog.progress_pct === 0;
  });

  const renderIcon = (iconName: string, className: string) => {
    const Icon = iconMap[iconName] || Award;
    return <Icon className={className} />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">
                {(setter.full_name || "?").charAt(0).toUpperCase()}
              </span>
            </div>
            {setter.full_name || setter.email}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {earned.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" /> Earned ({earned.length})
              </h4>
              <div className="space-y-2">
                {earned.map(def => (
                  <div key={def.id} className="flex items-center gap-3 rounded-lg bg-emerald-500/10 p-2.5">
                    {renderIcon(def.icon, "h-5 w-5 text-emerald-500 shrink-0")}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{def.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{def.description}</p>
                    </div>
                    <Badge variant="default" className="text-[10px] shrink-0">Earned</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {inProgress.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" /> In Progress ({inProgress.length})
              </h4>
              <div className="space-y-2">
                {inProgress.map(def => {
                  const prog = setterProgress.find(p => p.achievement_definition_id === def.id);
                  const pct = prog?.progress_pct ?? 0;
                  const current = prog?.current_progress ?? 0;
                  const target = prog?.target_value ?? 0;
                  return (
                    <div key={def.id} className="rounded-lg border p-2.5 space-y-1.5">
                      <div className="flex items-center gap-3">
                        {renderIcon(def.icon, "h-5 w-5 text-primary shrink-0")}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{def.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{def.description}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{current}/{target}</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {notStarted.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Not Started ({notStarted.length})</h4>
              <div className="space-y-1.5">
                {notStarted.map(def => (
                  <div key={def.id} className="flex items-center gap-3 rounded-lg p-2 opacity-60">
                    {renderIcon(def.icon, "h-5 w-5 text-muted-foreground shrink-0")}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{def.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {earned.length === 0 && inProgress.length === 0 && notStarted.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No achievements configured yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
