import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// Trend thresholds
export const TREND_THRESHOLD_IMPROVING = 10;
export const TREND_THRESHOLD_DECLINING = -10;

// Composite weights for holistic trend detection
export const COMPOSITE_WEIGHTS = {
  meetings: 0.5,
  dials: 0.3,
  talkTime: 0.2
} as const;

export type TrendStatus = 'improving' | 'stable' | 'declining';

/**
 * Calculate percentage change between two values
 * Returns 0 if previous is 0 and current is 0
 * Returns 100 if previous is 0 and current is positive
 */
export const calculateTrendPercentage = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Calculate composite performance score using weighted metrics
 * Weights: Meetings 50%, Dials 30%, Talk Time 20%
 */
export const calculateCompositeScore = (
  meetingTrend: number,
  dialsTrend: number,
  talkTimeTrend: number
): number => {
  return (meetingTrend * COMPOSITE_WEIGHTS.meetings) + 
         (dialsTrend * COMPOSITE_WEIGHTS.dials) + 
         (talkTimeTrend * COMPOSITE_WEIGHTS.talkTime);
};

/**
 * Classify trend based on composite score
 * >10% = improving, <-10% = declining, else stable
 */
export const getTrendStatus = (score: number): TrendStatus => {
  if (score > TREND_THRESHOLD_IMPROVING) return 'improving';
  if (score < TREND_THRESHOLD_DECLINING) return 'declining';
  return 'stable';
};

/**
 * Get appropriate Lucide icon class name for a trend value
 */
export const getTrendIconName = (score: number): 'TrendingUp' | 'TrendingDown' | 'Minus' => {
  if (score > TREND_THRESHOLD_IMPROVING) return 'TrendingUp';
  if (score < TREND_THRESHOLD_DECLINING) return 'TrendingDown';
  return 'Minus';
};

/**
 * Get trend icon component props
 */
export const getTrendIconProps = (score: number) => {
  if (score > TREND_THRESHOLD_IMPROVING) {
    return { icon: TrendingUp, className: "h-4 w-4 text-green-500" };
  }
  if (score < TREND_THRESHOLD_DECLINING) {
    return { icon: TrendingDown, className: "h-4 w-4 text-red-500" };
  }
  return { icon: Minus, className: "h-4 w-4 text-muted-foreground" };
};

/**
 * Format trend value with null safety
 * Returns "0" for invalid numbers
 */
export const formatTrendValue = (value: number | undefined | null): string => {
  if (typeof value !== 'number' || !isFinite(value)) return '0';
  return value.toFixed(0);
};

/**
 * Format trend with sign prefix
 */
export const formatTrendWithSign = (value: number | undefined | null): string => {
  const formatted = formatTrendValue(value);
  const numValue = parseFloat(formatted);
  if (numValue > 0) return `+${formatted}`;
  return formatted;
};

/**
 * Get color class for trend value
 */
export const getTrendColorClass = (score: number): string => {
  if (score > TREND_THRESHOLD_IMPROVING) return 'text-green-500';
  if (score < TREND_THRESHOLD_DECLINING) return 'text-red-500';
  return 'text-muted-foreground';
};

/**
 * Calculate week-over-week trend from performance data arrays
 */
export const calculateWeekOverWeekTrend = (
  currentWeekData: { meetings_booked?: number; dials_made?: number; talk_time?: number }[],
  previousWeekData: { meetings_booked?: number; dials_made?: number; talk_time?: number }[]
): { compositeScore: number; status: TrendStatus; meetingTrend: number; dialsTrend: number; talkTimeTrend: number } => {
  const currentTotals = currentWeekData.reduce((acc, p) => ({
    meetings: acc.meetings + (p.meetings_booked || 0),
    dials: acc.dials + (p.dials_made || 0),
    talkTime: acc.talkTime + (p.talk_time || 0)
  }), { meetings: 0, dials: 0, talkTime: 0 });

  const previousTotals = previousWeekData.reduce((acc, p) => ({
    meetings: acc.meetings + (p.meetings_booked || 0),
    dials: acc.dials + (p.dials_made || 0),
    talkTime: acc.talkTime + (p.talk_time || 0)
  }), { meetings: 0, dials: 0, talkTime: 0 });

  const meetingTrend = calculateTrendPercentage(currentTotals.meetings, previousTotals.meetings);
  const dialsTrend = calculateTrendPercentage(currentTotals.dials, previousTotals.dials);
  const talkTimeTrend = calculateTrendPercentage(currentTotals.talkTime, previousTotals.talkTime);

  const compositeScore = calculateCompositeScore(meetingTrend, dialsTrend, talkTimeTrend);

  return {
    compositeScore,
    status: getTrendStatus(compositeScore),
    meetingTrend,
    dialsTrend,
    talkTimeTrend
  };
};
