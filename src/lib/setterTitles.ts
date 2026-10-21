export type SetterTitle = 'trainee_sdr' | 'sdr' | 'lead_sdr' | 'senior_sdr' | 'ae';

export const TITLE_LABELS: Record<SetterTitle, string> = {
  trainee_sdr: 'Trainee SDR',
  sdr: 'SDR',
  lead_sdr: 'Lead SDR',
  senior_sdr: 'Senior SDR',
  ae: 'AE',
};

// The SDR promotion ladder. 'ae' is deliberately NOT on it — AE is a
// different job, not a rung above senior_sdr.
export const TITLE_ORDER: SetterTitle[] = ['trainee_sdr', 'sdr', 'lead_sdr', 'senior_sdr'];

export function getTitleLabel(title: string | null | undefined): string {
  return TITLE_LABELS[(title as SetterTitle)] || 'SDR';
}

export function getNextTitle(current: SetterTitle): SetterTitle | null {
  const idx = TITLE_ORDER.indexOf(current);
  if (idx === -1) return null; // off-ladder titles ('ae') never promote
  return idx < TITLE_ORDER.length - 1 ? TITLE_ORDER[idx + 1] : null;
}

export function getPreviousTitle(current: SetterTitle): SetterTitle | null {
  const idx = TITLE_ORDER.indexOf(current);
  return idx > 0 ? TITLE_ORDER[idx - 1] : null;
}

export function getTitleBadgeClasses(title: string | null | undefined): string {
  switch (title) {
    case 'ae':
      return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    case 'senior_sdr':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'lead_sdr':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'trainee_sdr':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'sdr':
    default:
      return 'bg-primary/20 text-primary border-primary/30';
  }
}
