// Client Health Computation Utilities
// Health is derived from campaign performance and weekly goal achievement
import { type WeeklyGoal, getCompletedGoalHitRate } from './campaignGoals';

export interface CampaignHealthData {
  id: string;
  name: string;
  status: string;
  meetings_booked: number;
  meeting_target: number;
  calls_outbound: number;
  call_target: number;
  meetings_sat: number;
  launch_date: string | null;
  end_date: string | null;
}

export interface ClientHealthSummary {
  overallHealth: 'green' | 'amber' | 'red';
  healthScore: number;
  healthLabel: string;
  activeCampaigns: number;
  pausedCampaigns: number;
  daysLive: number;
  meetingsLast7Days: number;
  meetingsLast14Days: number;
  flags: string[];
}

export interface CampaignHealthIndicator {
  campaignId: string;
  health: 'green' | 'amber' | 'red';
  score: number;
  meetingsTrend: 'up' | 'down' | 'stable';
  connectRate: number;
  expectedConnectRate: number;
  flags: string[];
}

// Compute overall health for a client based on their campaigns
export function computeClientHealth(
  campaigns: CampaignHealthData[],
  meetingsLast7Days: number,
  meetingsLast14Days: number,
  launchDate: string | null,
  weeklyGoals?: WeeklyGoal[]
): ClientHealthSummary {
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const pausedCampaigns = campaigns.filter(c => c.status === 'paused').length;
  
  // Calculate days live from earliest campaign launch or first campaign
  let daysLive = 0;
  if (launchDate) {
    daysLive = Math.floor((Date.now() - new Date(launchDate).getTime()) / (1000 * 60 * 60 * 24));
  }

  const flags: string[] = [];
  
  // Calculate aggregate health score
  let totalScore = 0;
  let campaignCount = 0;
  
  campaigns.forEach(campaign => {
    if (campaign.status !== 'active') return;
    
    const meetingsScore = campaign.meeting_target > 0 
      ? (campaign.meetings_booked / campaign.meeting_target) * 100 
      : 0;
    const activityScore = campaign.call_target > 0 
      ? (campaign.calls_outbound / campaign.call_target) * 100 
      : 0;
    
    const campaignScore = (meetingsScore * 0.6) + (activityScore * 0.4);
    totalScore += Math.min(100, Math.max(0, campaignScore));
    campaignCount++;
  });
  
  let healthScore = campaignCount > 0 ? Math.round(totalScore / campaignCount) : 0;
  
  // Factor in weekly goal achievement if available
  if (weeklyGoals && weeklyGoals.length > 0) {
    const goalHitRate = getCompletedGoalHitRate(weeklyGoals);
    if (goalHitRate.total > 0) {
      // Blend: 50% campaign performance, 50% goal hit rate
      healthScore = Math.round((healthScore * 0.5) + (goalHitRate.rate * 0.5));
    }
  }
  
  // Determine overall health status
  let overallHealth: 'green' | 'amber' | 'red' = 'green';
  let healthLabel = 'Healthy';
  
  if (healthScore < 40 || activeCampaigns === 0) {
    overallHealth = 'red';
    healthLabel = 'At Risk';
  } else if (healthScore < 70) {
    overallHealth = 'amber';
    healthLabel = 'Needs Attention';
  }
  
  // Generate flags from weekly goals
  if (weeklyGoals && weeklyGoals.length > 0) {
    const goalHitRate = getCompletedGoalHitRate(weeklyGoals);
    if (goalHitRate.total >= 2 && goalHitRate.rate < 50) {
      flags.push('Missing weekly goals');
    }
  }
  
  // Generate flags
  if (meetingsLast7Days === 0 && activeCampaigns > 0) {
    flags.push('No meetings in 7 days');
  }
  if (activeCampaigns === 0 && pausedCampaigns > 0) {
    flags.push('All campaigns paused');
  }
  if (activeCampaigns === 0 && pausedCampaigns === 0) {
    flags.push('No active campaigns');
  }
  if (meetingsLast14Days > 0 && meetingsLast7Days < meetingsLast14Days * 0.3) {
    flags.push('Meeting volume declining');
  }
  
  return {
    overallHealth,
    healthScore,
    healthLabel,
    activeCampaigns,
    pausedCampaigns,
    daysLive,
    meetingsLast7Days,
    meetingsLast14Days,
    flags
  };
}

// Compute health for a single campaign
export function computeCampaignHealth(
  campaign: CampaignHealthData,
  meetingsThisWeek: number,
  meetingsLastWeek: number,
  totalDials: number,
  totalConnects: number
): CampaignHealthIndicator {
  const meetingsScore = campaign.meeting_target > 0 
    ? (campaign.meetings_booked / campaign.meeting_target) * 100 
    : 0;
  const activityScore = campaign.call_target > 0 
    ? (campaign.calls_outbound / campaign.call_target) * 100 
    : 0;
  
  const score = Math.round(Math.min(100, Math.max(0, (meetingsScore * 0.6) + (activityScore * 0.4))));
  
  let health: 'green' | 'amber' | 'red' = 'green';
  if (score < 40) health = 'red';
  else if (score < 70) health = 'amber';
  
  // Determine meeting trend
  let meetingsTrend: 'up' | 'down' | 'stable' = 'stable';
  if (meetingsThisWeek > meetingsLastWeek * 1.2) meetingsTrend = 'up';
  else if (meetingsThisWeek < meetingsLastWeek * 0.8) meetingsTrend = 'down';
  
  // Calculate connect rate
  const connectRate = totalDials > 0 ? Math.round((totalConnects / totalDials) * 100) : 0;
  const expectedConnectRate = 3; // 3% baseline for cold calling
  
  const flags: string[] = [];
  if (campaign.status === 'paused') flags.push('Campaign paused');
  if (meetingsThisWeek === 0 && campaign.status === 'active') flags.push('No meetings this week');
  if (meetingsTrend === 'down') flags.push('Declining meetings');
  
  return {
    campaignId: campaign.id,
    health,
    score,
    meetingsTrend,
    connectRate,
    expectedConnectRate,
    flags
  };
}

// Get health indicator color classes
export function getHealthColorClasses(health: 'green' | 'amber' | 'red'): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (health) {
    case 'green':
      return {
        bg: 'bg-green-500/10',
        text: 'text-green-400',
        border: 'border-green-500/30',
        dot: 'bg-green-500'
      };
    case 'amber':
      return {
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
        dot: 'bg-amber-500'
      };
    case 'red':
      return {
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        border: 'border-red-500/30',
        dot: 'bg-red-500'
      };
  }
}
