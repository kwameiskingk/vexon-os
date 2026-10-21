// Read-only rendering vocabulary for the phone screen.
//
// The questions are AUTHORED in CandidateModal (the capture surface). This
// module exists so read-only surfaces — the CEO's candidate detail, Ops
// Command, TA tracking — display the same questions with the same wording
// without importing the capture form.
//
// Elena's script (24 Aug, extended 1 Sep): fifteen scoreable questions,
// Q1–Q15 on candidate_phone_screens; Q16 (Notes) has no column and reuses
// cv_screenings.ops_notes, so it is rendered by the caller, not listed here.

export interface PhoneScreenQuestion {
  /** candidate_phone_screens column name. */
  key: string;
  label: string;
  kind: "boolean" | "pass_fail" | "text" | "number" | "cold_mix" | "children_care";
  /**
   * Free-text twin of a numeric column (1 Sep): the TA types ranges like
   * "50-100" verbatim; when the raw answer exists it is what gets displayed,
   * the numeric column stays derived for qualification criteria only.
   */
  rawKey?: string;
}

export const PHONE_SCREEN_QUESTIONS: PhoneScreenQuestion[] = [
  { key: "age", label: "1 · Age", kind: "number" },
  {
    key: "b2b_cold_calling_last_6mo",
    label: "2 · B2B cold calling, last 6 months",
    kind: "boolean",
  },
  { key: "current_job_title", label: "3 · Current job title", kind: "text" },
  { key: "what_they_sell", label: "4 · What they sell", kind: "text" },
  { key: "countries_sold_into", label: "5 · Sold to UK clients before", kind: "text" },
  { key: "uk_sold_what", label: "6 · Selling what, to those UK clients", kind: "text" },
  {
    key: "avg_dials_per_day",
    label: "7 · Dials per day",
    kind: "number",
    rawKey: "avg_dials_per_day_raw",
  },
  { key: "cold_mix_band", label: "8 · Lead mix", kind: "cold_mix" },
  {
    key: "avg_appointments_per_month",
    label: "9 · Appointments per month",
    kind: "number",
    rawKey: "avg_appointments_per_month_raw",
  },
  { key: "years_b2b_cold_calling", label: "10 · Years experience", kind: "number" },
  { key: "accent_pass", label: "11 · Accent read-back", kind: "pass_fail" },
  { key: "has_equipment", label: "12 · Equipment", kind: "boolean" },
  { key: "notice_period", label: "13 · Notice period", kind: "text" },
  {
    key: "has_children",
    label: "14 · Children & care during working hours",
    kind: "children_care",
  },
  {
    key: "health_adjustments",
    label: "15 · Health — adjustments needed",
    kind: "boolean",
  },
];

const COLD_MIX_LABELS: Record<string, string> = {
  all_cold: "All cold — 100%",
  mostly_cold: "Mostly cold — 80–99%",
  even_mix: "Even mix — ~50/50",
  mostly_warm: "Mostly warm — under 50% cold",
};

export function formatAnswer(
  question: PhoneScreenQuestion,
  row: Record<string, unknown>,
): string {
  if (question.kind === "children_care") {
    const kids = row.has_children;
    const care = row.childcare_support;
    if (kids === false) return "No children";
    if (kids === true) {
      if (care === true) return "Yes — care/help in place";
      if (care === false) return "Yes — no care during hours";
      return "Yes — care not asked";
    }
    return "—";
  }

  if (question.kind === "cold_mix") {
    const band = row.cold_mix_band as string | null | undefined;
    if (band && COLD_MIX_LABELS[band]) return COLD_MIX_LABELS[band];
    // Rows screened before the band existed carry only the numeric split.
    const cold = row.pct_cold_leads;
    const warm = row.pct_warm_leads;
    if (cold == null && warm == null) return "—";
    return `${cold ?? "—"}% cold · ${warm ?? "—"}% warm`;
  }

  // The raw text answer ("50-100", "100+") wins over the derived number.
  if (question.rawKey) {
    const rawText = row[question.rawKey];
    if (typeof rawText === "string" && rawText.trim() !== "") return rawText;
  }

  const raw = row[question.key];
  if (raw === null || raw === undefined || raw === "") return "—";
  if (question.kind === "boolean") return raw === true ? "Yes" : "No";
  if (question.kind === "pass_fail") return raw === true ? "Pass" : "Fail";
  return String(raw);
}
