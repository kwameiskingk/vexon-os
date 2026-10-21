// Shared vocabulary for the interviews capture (Batch 3, BUILD 5).
// Logging an interview dual-writes the matching stage-date column on
// candidates so the pipeline board and CEO metrics (final interviews
// booked, interview→offer %, offer acceptance %) keep reading the columns
// they always have — the interviews table is the richer capture record.
export const INTERVIEW_TYPES = [
  { value: "ceo_trial_call", label: "CEO Trial Call", dateColumn: "ceo_trial_call_date" },
  { value: "sdr_manager", label: "SDR Manager Interview (final)", dateColumn: "sdr_interview_date" },
  { value: "other", label: "Other", dateColumn: null },
] as const;

export type InterviewType = (typeof INTERVIEW_TYPES)[number]["value"];

export const INTERVIEW_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  INTERVIEW_TYPES.map((t) => [t.value, t.label]),
);

export const INTERVIEW_OUTCOMES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number]["value"];

export interface InterviewRow {
  id: string;
  candidate_id: string;
  interview_type: string;
  interview_date: string;
  interview_time: string | null;
  outcome: string;
  notes: string | null;
}
