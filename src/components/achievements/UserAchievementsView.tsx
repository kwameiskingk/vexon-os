import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AchievementGrid, type Achievement, type AchievementProgress, type EarnedAchievement } from "./AchievementGrid";
import { AchievementFilters } from "./AchievementFilters";
import { AchievementInfoModal } from "./AchievementInfoModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Award, Info } from "lucide-react";

interface UserAchievementsViewProps {
  userRole: 'setter' | 'account_executive' | 'csm';
  userDepartment?: string | null;
}

export const UserAchievementsView = ({ userRole, userDepartment }: UserAchievementsViewProps) => {
  const queryClient = useQueryClient();

  // Fetch achievement definitions for this role
  const { data: achievements = [], isLoading: achievementsLoading } = useQuery({
    queryKey: ['achievement-definitions', userRole, userDepartment],
    queryFn: async () => {
      let query = supabase
        .from('achievement_definitions')
        .select('*')
        .eq('is_active', true)
        .or(`target_role.eq.${userRole},target_role.eq.all`)
        .order('sort_order', { ascending: true });

      // For setters, also filter by department
      if (userRole === 'setter' && userDepartment) {
        query = query.or(`target_department.is.null,target_department.eq.${userDepartment}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Trigger achievement calculation then fetch progress
  const { data: progress = [], isLoading: progressLoading } = useQuery({
    queryKey: ['user-achievement-progress'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Trigger calculation - refetch progress after it completes
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        supabase.functions.invoke('calculate-achievement-progress', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).then(() => {
          // Refetch progress after calculation completes
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['user-achievement-progress'] });
          }, 500);
        }).catch(err => console.warn('Achievement calc failed:', err));
      }

      const { data, error } = await supabase
        .from('user_achievement_progress')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      return data;
    },
    staleTime: 30_000, // Don't re-trigger calc too frequently
  });

  // Fetch current user's earned achievements
  const { data: earnedAchievements = [], isLoading: earnedLoading } = useQuery({
    queryKey: ['user-earned-achievements'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Get user email from profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single();

      if (!profile?.email) return [];

      const { data, error } = await supabase
        .from('leaderboard_achievements')
        .select('*')
        .eq('email', profile.email)
        .not('achievement_definition_id', 'is', null);

      if (error) throw error;
      return data;
    },
  });

  const isLoading = achievementsLoading || progressLoading || earnedLoading;

  return (
    <UserAchievementsPanel
      achievements={achievements}
      progress={progress}
      earnedAchievements={earnedAchievements}
      isLoading={isLoading}
    />
  );
};

export interface UserAchievementsPanelProps {
  achievements: Achievement[];
  progress: AchievementProgress[];
  earnedAchievements: EarnedAchievement[];
  isLoading: boolean;
}

/**
 * Pure rendering (3 Sep): the live view above and the setter demo surface
 * (acting-as SDR on fixtures) share this so the two can never drift.
 */
export const UserAchievementsPanel = ({ achievements, progress, earnedAchievements, isLoading }: UserAchievementsPanelProps) => {
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInfoModal, setShowInfoModal] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-9 w-20 rounded-full" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const earnedCount = earnedAchievements.length;
  const totalCount = achievements.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Award className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Your Achievements</h2>
            <p className="text-sm text-muted-foreground">
              Track your progress and unlock badges
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowInfoModal(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Info className="h-5 w-5" />
        </Button>
      </div>

      {/* Info Modal */}
      <AchievementInfoModal 
        open={showInfoModal} 
        onOpenChange={setShowInfoModal}
        context="achievements"
      />

      {/* Filters */}
      <AchievementFilters
        activeFilter={filter}
        onFilterChange={setFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        earnedCount={earnedCount}
        totalCount={totalCount}
      />

      {/* Grid */}
      <AchievementGrid
        achievements={achievements}
        progress={progress}
        earnedAchievements={earnedAchievements}
        filter={filter}
        searchQuery={searchQuery}
      />
    </div>
  );
};
