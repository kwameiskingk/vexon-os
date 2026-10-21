// Display vocabulary for the Candidates tab. DB values are the source of
// truth (CHECK constraints in migration 20260807120000); these are the
// human-facing labels only.

export const BUCKET_TABS = [
  { bucket: "SHORTLIST", label: "Call list" },
  { bucket: "MAYBE", label: "Maybe" },
  { bucket: "REJECT", label: "Rejected" },
  { bucket: "REVIEW_MANUALLY", label: "Could Not Read" },
] as const;

export const REVIEW_STATUS_OPTIONS = [
  { value: "to_call", label: "To call" },
  { value: "called", label: "Called" },
  { value: "interviewing", label: "Interviewing" },
  { value: "booked", label: "Booked" },
  { value: "not_suitable", label: "Not suitable" },
  { value: "hired", label: "Hired" },
  { value: "withdrawn", label: "Withdrawn" },
] as const;

export const reviewStatusLabel = (value: string | null): string | null =>
  REVIEW_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;

export const REJECT_REASON_LABELS: Record<string, string> = {
  tenure_under_10_months: "Tenure under 10 months",
  b2c_only: "B2C only",
  no_sales_experience: "No sales experience",
  stale: "Stale",
  long_gap: "Long gap",
};

export const rejectReasonLabel = (value: string | null): string | null =>
  value ? REJECT_REASON_LABELS[value] ?? value : null;

export const SCORE_PRESETS = [
  { value: "all", label: "All scores" },
  { value: "80+", label: "80+" },
  { value: "50-79", label: "50–79" },
  { value: "<50", label: "Under 50" },
] as const;

export type ScorePreset = (typeof SCORE_PRESETS)[number]["value"];

// Null scores (REVIEW_MANUALLY, some rejects) only surface under "All".
export const matchesScorePreset = (score: number | null, preset: ScorePreset): boolean => {
  if (preset === "all") return true;
  if (score === null) return false;
  if (preset === "80+") return score >= 80;
  if (preset === "50-79") return score >= 50 && score <= 79;
  return score < 50;
};

// Per-bucket accent treatment (approved 2026-08-07). Hues come from the
// app's existing vocabulary — emerald=positive, amber=watch, muted red=
// critical, neutral for data problems — always as low-alpha tints, never
// solid fills. Could Not Read stays neutral: it's not a verdict.
export const bucketStyles: Record<
  string,
  { countPill: string; activeTab: string; rowRail: string }
> = {
  SHORTLIST: {
    countPill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    activeTab: "data-[state=active]:bg-emerald-500/10",
    rowRail: "border-l-emerald-500/40",
  },
  MAYBE: {
    countPill: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    activeTab: "data-[state=active]:bg-amber-500/10",
    rowRail: "border-l-amber-500/40",
  },
  REJECT: {
    countPill: "bg-red-500/10 text-red-600/80 dark:text-red-400/80",
    activeTab: "data-[state=active]:bg-red-500/[0.07]",
    rowRail: "border-l-red-500/30",
  },
  REVIEW_MANUALLY: {
    countPill: "bg-muted text-muted-foreground",
    activeTab: "",
    rowRail: "border-l-transparent",
  },
};

export const gatePillClasses: Record<string, string> = {
  pass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  fail: "bg-destructive/15 text-destructive",
  near_miss: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  unknown: "bg-muted text-muted-foreground",
};

export const gateLabel = (value: string): string =>
  value === "near_miss" ? "Near miss" : value.charAt(0).toUpperCase() + value.slice(1);
