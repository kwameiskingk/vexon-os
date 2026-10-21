import { useState } from "react";
import { AchievementCard } from "./AchievementCard";
import { AchievementDetailModal } from "./AchievementDetailModal";
import { EmptyState } from "@/components/ui/empty-state";
import { Award } from "lucide-react";

export interface Achievement {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  tier?: string | null;
  is_permanent?: boolean;
  target_role: string;
  target_department?: string | null;
  sort_order?: number | null;
}

export interface AchievementProgress {
  achievement_definition_id: string;
  current_progress: number;
  target_value: number;
  progress_pct: number;
}

export interface EarnedAchievement {
  achievement_definition_id: string;
  date_awarded: string;
  tier?: string | null;
}

interface AchievementGridProps {
  achievements: Achievement[];
  progress: AchievementProgress[];
  earnedAchievements: EarnedAchievement[];
  filter?: string;
  searchQuery?: string;
}

/**
 * Derive a "family" key from the achievement key by stripping the tier suffix.
 * e.g. "ful_streak_bronze" → "ful_streak", "talk_time_streak_gold" → "talk_time_streak"
 * Achievements without a tier get their own unique family.
 */
function getFamilyKey(achievement: Achievement): string {
  if (!achievement.tier) return `_solo_${achievement.key}`;

  // Special family groupings for keys that don't follow _tier suffix convention
  if (achievement.key.startsWith('setter_of_the_')) return 'setter_of_the';
  if (achievement.key.startsWith('secure_client_testimonial')) return 'secure_client_testimonial';

  const suffixes = ['_bronze', '_silver', '_gold', '_platinum'];
  let base = achievement.key;
  for (const suffix of suffixes) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return base;
}

const tierOrder: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

export const AchievementGrid = ({
  achievements,
  progress,
  earnedAchievements,
  filter = 'all',
  searchQuery = '',
}: AchievementGridProps) => {
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const progressMap = new Map(progress.map(p => [p.achievement_definition_id, p]));
  const earnedMap = new Map(earnedAchievements.map(e => [e.achievement_definition_id, e]));

  // Filter achievements
  const filteredAchievements = achievements.filter(achievement => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        achievement.name.toLowerCase().includes(query) ||
        achievement.description.toLowerCase().includes(query) ||
        achievement.category.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    switch (filter) {
      case 'earned':
        return earnedMap.has(achievement.id);
      case 'available':
        return !earnedMap.has(achievement.id);
      case 'streak':
        return achievement.category === 'streak';
      case 'quality':
        return achievement.category === 'quality';
      case 'quantity':
        return achievement.category === 'quantity';
      case 'improvement':
        return achievement.category === 'improvement';
      default:
        return true;
    }
  });

  // Group achievements by family, preserving sort_order for family ordering
  const familyMap = new Map<string, Achievement[]>();
  const familyMinSort = new Map<string, number>();

  // Sort by sort_order first to determine family ordering
  const sorted = [...filteredAchievements].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  for (const ach of sorted) {
    const family = getFamilyKey(ach);
    if (!familyMap.has(family)) {
      familyMap.set(family, []);
      familyMinSort.set(family, ach.sort_order ?? 999);
    }
    familyMap.get(family)!.push(ach);
  }

  // Sort within each family by tier order
  for (const [, group] of familyMap) {
    group.sort((a, b) => (tierOrder[a.tier ?? ''] ?? 99) - (tierOrder[b.tier ?? ''] ?? 99));
  }

  // Order families by their minimum sort_order
  const orderedFamilies = [...familyMap.entries()].sort(
    (a, b) => (familyMinSort.get(a[0]) ?? 999) - (familyMinSort.get(b[0]) ?? 999)
  );

  if (filteredAchievements.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title="No achievements found"
        description={searchQuery 
          ? "Try adjusting your search or filters" 
          : "No achievements match the selected filter"
        }
      />
    );
  }

  const handleCardClick = (achievement: Achievement) => {
    setSelectedAchievement(achievement);
    setModalOpen(true);
  };

  const selectedEarned = selectedAchievement ? earnedMap.get(selectedAchievement.id) : undefined;
  const selectedProgress = selectedAchievement ? progressMap.get(selectedAchievement.id) : undefined;

  return (
    <>
      <div className="space-y-4">
        {orderedFamilies.map(([familyKey, group]) => (
          <div key={familyKey} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.map(achievement => {
              const earned = earnedMap.get(achievement.id);
              const prog = progressMap.get(achievement.id);
              
              return (
                <div key={achievement.id} className="cursor-pointer h-full" onClick={() => handleCardClick(achievement)}>
                  <AchievementCard
                    achievement={achievement}
                    progress={prog}
                    isEarned={!!earned}
                    earnedDate={earned?.date_awarded}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <AchievementDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        achievement={selectedAchievement}
        progress={selectedProgress}
        isEarned={!!selectedEarned}
        earnedDate={selectedEarned?.date_awarded}
      />
    </>
  );
};
