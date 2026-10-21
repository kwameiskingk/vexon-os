// Single source of truth for the hiring pipeline vocabulary.
//
// The canonical stage lives in `candidates.stage_key` (migration M4). The
// legacy `candidates.pipeline_stage` integer and the stage-date columns are
// DERIVED from it by a DB trigger, so nothing in the app should ever write
// pipeline_stage directly — write stage_key and let the trigger keep the
// board and the CEO tiles (N15/N16/N17) coherent.
//
// See AUDIT_TA_PORTAL.md §6.3 for why the model looks like this.

export type StageKey =
  | "screening"
  | "booked"
  | "lct_passed"
  | "lct_failed"
  | "final_interview"
  | "trial_day"
  | "offer"
  | "onboarding"
  | "hired"
  | "not_suitable"
  | "bypass"
  | "left";

export interface StageMeta {
  key: StageKey;
  label: string;
  /** Short blurb used as column/section subtext. */
  hint: string;
  /** Tone rail, using the app's existing vocabulary. */
  tone: "neutral" | "progress" | "good" | "warn" | "bad";
  /** Column in the main left-to-right flow; false = a terminal/side lane. */
  inFlow: boolean;
  /** The candidates column holding this stage's date, when there is one. */
  dateField?: "lct_booked_date" | "ceo_trial_call_date" | "sdr_interview_date" | "trial_day_date" | "offer_letter_date" | "accepted_date";
  /** The candidates column holding this stage's time, when there is one. */
  timeField?: "lct_booked_time" | "final_interview_time";
}

// Order matters: this is the left-to-right order everywhere the pipeline is
// rendered, and the ordering used to decide "has reached at least".
export const PIPELINE_STAGES: StageMeta[] = [
  {
    key: "screening",
    label: "Screening",
    hint: "Phone screen not booked yet",
    tone: "neutral",
    inFlow: true,
  },
  // 22 Sep (Elena + the owner): the Live Call Trial is gone. Enquire screens the
  // applicant, then the first real stage is a Trial Day on live client
  // campaigns, and only after that do they meet Marcus for a final interview.
  {
    key: "trial_day",
    label: "Trial Day",
    hint: "On the phones for real clients",
    tone: "progress",
    inFlow: true,
    dateField: "trial_day_date",
  },
  {
    key: "final_interview",
    label: "Final Interview",
    hint: "Final interview with Marcus",
    tone: "progress",
    inFlow: true,
    dateField: "sdr_interview_date",
    timeField: "final_interview_time",
  },
  {
    key: "offer",
    label: "Offer",
    hint: "Offer sent",
    tone: "progress",
    inFlow: true,
    dateField: "offer_letter_date",
  },
  {
    key: "onboarding",
    label: "Onboarding",
    hint: "Accepted, onboarding in progress",
    tone: "progress",
    inFlow: true,
  },
  // 22 Sep (the owner): Hired is not a column any more. Elena wants the board to
  // show who is moving, and the hired list underneath, near Closed.
  {
    key: "hired",
    label: "Hired",
    hint: "Onboarding complete",
    tone: "good",
    inFlow: false,
    dateField: "accepted_date",
  },
  // Retired 22 Sep with the Live Call Trial. The keys stay so the historic
  // rows still read, and because candidates.stage_key has a CHECK constraint.
  {
    key: "booked",
    label: "LCT Booked",
    hint: "Retired — the Live Call Trial is no longer run",
    tone: "neutral",
    inFlow: false,
    dateField: "lct_booked_date",
    timeField: "lct_booked_time",
  },
  {
    key: "lct_passed",
    label: "LCT Passed",
    hint: "Retired — the Live Call Trial is no longer run",
    tone: "neutral",
    inFlow: false,
    dateField: "ceo_trial_call_date",
  },
  {
    key: "lct_failed",
    label: "Not Taken Forward",
    hint: "Sat the trial, not progressing",
    tone: "bad",
    inFlow: false,
    dateField: "ceo_trial_call_date",
  },
  {
    key: "not_suitable",
    label: "Not Suitable",
    hint: "Ruled out at screening",
    tone: "bad",
    inFlow: false,
  },
  {
    key: "bypass",
    label: "Bypass",
    hint: "Skipped the normal route",
    tone: "warn",
    inFlow: false,
  },
  // 11 Sep (Elena): hired or onboarding, then gone — resigned, let go, or
  // never started. The reason travels in exit_reason.
  {
    key: "left",
    label: "Left",
    hint: "Resigned, let go, or never started",
    tone: "bad",
    inFlow: false,
  },
];

/** Why someone left (the first part of exit_reason on a 'left' move). */
export const LEFT_REASONS = ["Resigned", "Let go", "Did not start"] as const;

const STAGE_BY_KEY = new Map(PIPELINE_STAGES.map((s) => [s.key, s]));

export const stageMeta = (key: string | null | undefined): StageMeta | null =>
  key ? STAGE_BY_KEY.get(key as StageKey) ?? null : null;

export const stageLabel = (key: string | null | undefined): string =>
  stageMeta(key)?.label ?? "Screening";

/** The forward path a candidate walks. Side lanes are reachable from anywhere. */
export const FLOW_STAGES = PIPELINE_STAGES.filter((s) => s.inFlow);

const FLOW_INDEX = new Map(FLOW_STAGES.map((s, i) => [s.key, i]));

/** -1 for side lanes (not_suitable / bypass / lct_failed). */
export const flowIndex = (key: string | null | undefined): number =>
  FLOW_INDEX.get((key ?? "screening") as StageKey) ?? -1;

/** Hired left the flow on 22 Sep but is still the end of the road, so it has
 * reached every flow stage. Without this, a hired candidate reads as never
 * having been onboarded. */
const BEYOND_FLOW: StageKey[] = ["hired"];

export const hasReached = (key: string | null | undefined, target: StageKey): boolean => {
  if (BEYOND_FLOW.includes((key ?? "") as StageKey)) return true;
  const a = flowIndex(key);
  const b = flowIndex(target);
  return a >= 0 && b >= 0 && a >= b;
};

/**
 * What the operator can move this candidate to next. Deliberately permissive
 * about side lanes — the brief requires the TA to be able to mark Not
 * Suitable at any point, regardless of any qualification verdict.
 */
export function nextStages(current: string | null | undefined): StageKey[] {
  const key = (current ?? "screening") as StageKey;
  switch (key) {
    case "screening":
      return ["trial_day", "not_suitable", "bypass"];
    case "trial_day":
      return ["final_interview", "lct_failed", "not_suitable"];
    case "final_interview":
      return ["offer", "lct_failed", "not_suitable"];
    case "offer":
      return ["onboarding", "not_suitable"];
    case "onboarding":
      return ["hired", "left", "not_suitable"];
    case "hired":
      return ["left"];
    case "left":
      return ["onboarding", "hired"];
    // Retired lanes: the only way out is back onto the new route.
    case "booked":
    case "lct_passed":
      return ["trial_day", "screening", "not_suitable"];
    case "lct_failed":
      return ["trial_day", "not_suitable"];
    case "not_suitable":
    case "bypass":
      return ["screening", "trial_day"];
    default:
      return ["trial_day", "not_suitable"];
  }
}

// Tone rail classes, matching the candidate-modal idiom (low-alpha tints,
// never solid fills).
export const stageToneClasses: Record<StageMeta["tone"], { pill: string; rail: string; dot: string }> = {
  neutral: {
    pill: "bg-muted text-muted-foreground",
    rail: "border-l-border",
    dot: "bg-muted-foreground/50",
  },
  progress: {
    pill: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    rail: "border-l-sky-500/40",
    dot: "bg-sky-500",
  },
  good: {
    pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    rail: "border-l-emerald-500/40",
    dot: "bg-emerald-500",
  },
  warn: {
    pill: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    rail: "border-l-amber-500/40",
    dot: "bg-amber-500",
  },
  bad: {
    pill: "bg-red-500/10 text-red-600/80 dark:text-red-400/80",
    rail: "border-l-red-500/30",
    dot: "bg-red-500",
  },
};

/**
 * The role a new starter can be onboarded into. CEO and dev are deliberately
 * not selectable (brief, Step 5). Values match the NOT VALID CHECK on
 * employee_onboarding.target_role in migration M6.
 */
export const ONBOARDING_TARGET_ROLES = [
  { value: "setter_fulfilment", label: "Setter — Fulfilment" },
  { value: "setter_acquisition", label: "Setter — Acquisition" },
  { value: "account_executive", label: "Account Executive" },
  { value: "operations", label: "Operations" },
] as const;

export const onboardingTargetRoleLabel = (value: string | null | undefined): string =>
  ONBOARDING_TARGET_ROLES.find((r) => r.value === value)?.label ?? value ?? "—";
