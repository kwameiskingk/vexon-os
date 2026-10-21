// Campaign Weekly Goals Utilities

export interface WeeklyGoal {
  id: string;
  campaign_id: string;
  client_id: string;
  week_number: number;
  week_start: string;
  week_end: string;
  target: number;
  achieved: number;
  goal_met: boolean;
}

export function getCurrentCampaignWeek(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

export function getWeeklyTarget(weekNumber: number, totalWeeks: number = 12): number {
  const phase1Weeks = Math.max(1, Math.round(totalWeeks * 0.66));
  return weekNumber <= phase1Weeks ? 1 : 2;
}

export function getGoalHitRate(goals: WeeklyGoal[]): number {
  if (goals.length === 0) return 0;
  const metCount = goals.filter(g => g.goal_met).length;
  return Math.round((metCount / goals.length) * 100);
}

export function getCompletedGoalHitRate(goals: WeeklyGoal[]): { met: number; total: number; rate: number } {
  const today = new Date();
  const completedWeeks = goals.filter(g => new Date(g.week_end) < today);
  const met = completedWeeks.filter(g => g.goal_met).length;
  const total = completedWeeks.length;
  return { met, total, rate: total > 0 ? Math.round((met / total) * 100) : 0 };
}

export function getConsecutiveStreak(goals: WeeklyGoal[]): number {
  const today = new Date();
  const sorted = [...goals]
    .filter(g => new Date(g.week_end) < today)
    .sort((a, b) => b.week_number - a.week_number);
  
  let streak = 0;
  for (const goal of sorted) {
    if (goal.goal_met) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function isQualifiedMeetingType(leadType: string | null): boolean {
  return ['video_conference', 'mobile_phone_call', 'terms_sent'].includes(leadType || '');
}

export function getGoalStatusColor(goal: WeeklyGoal, isCurrent: boolean): 'green' | 'amber' | 'red' | 'muted' {
  if (goal.goal_met) return 'green';
  if (isCurrent) return goal.achieved > 0 ? 'amber' : 'muted';
  const today = new Date();
  if (new Date(goal.week_end) < today) return 'red'; // past week, not met
  return 'muted'; // future week
}
