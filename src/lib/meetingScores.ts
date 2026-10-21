export type ScoreValue = 1 | 2 | 3 | 4 | 5;

export const SCORE_DIMENSIONS = [
  { key: 'fit', label: 'Fit' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'authority', label: 'Authority' },
  { key: 'next_step', label: 'Next Step' },
] as const;

export function scoreColorClasses(n: number): string {
  const r = Math.round(n);
  if (r <= 2) return 'bg-destructive/15 text-destructive border-destructive/30';
  if (r === 3) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
  if (r === 4) return 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30';
  return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40';
}

export function overallBadgeVariant(overall: number): 'destructive' | 'pending' | 'healthy' {
  if (overall < 3) return 'destructive';
  if (overall < 4) return 'pending';
  return 'healthy';
}

export interface MeetingScore {
  id: string;
  appointment_id: string | null;
  meeting_date: string;
  setter_name: string;
  client_name: string;
  prospect_company: string;
  fit: number;
  engagement: number;
  authority: number;
  next_step: number;
  notes: string | null;
  overall_quality: number;
  matched: boolean;
  synced_at: string;
}
