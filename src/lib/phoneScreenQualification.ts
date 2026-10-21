// Phone-screen qualification framework — the evaluator.
//
// Pure functions only: no supabase, no React. Criteria come from the
// `qualification_criteria` table (migration M5) so the bar can be moved
// without a deploy; this module just applies them to the nine scoreable
// answers on `candidate_phone_screens`.
//
// Nothing in this module gates a save. The TA can mark a candidate Booked or
// Not Suitable regardless of the verdict; the single consequence of a red
// verdict (17 Aug ruling) is enforced in CandidateModal, where booking while
// not_qualified asks for a short typed reason before it commits.
//
// Shape follows the acq_qual_scores precedent: booleans decide, the aggregate
// is derived and never trusted from outside, and a hard gate is recorded
// separately from the weighted score.

export type GateType = "hard_gate" | "weighted" | "advisory";

export type CriterionOperator =
  | "is_true"
  | "is_false"
  | "gte"
  | "lte"
  | "between"
  | "eq"
  | "not_empty";

export interface QualificationCriterion {
  id: string;
  framework: string;
  /** Matches a candidate_phone_screens column name exactly. */
  question_key: string;
  label: string;
  enabled: boolean;
  gate_type: GateType;
  operator: CriterionOperator | null;
  threshold_numeric: number | null;
  threshold_numeric_max: number | null;
  expected_boolean: boolean | null;
  expected_text: string | null;
  weight: number;
  rationale: string | null;
  sort_order: number;
}

/** The answers this evaluator understands — keyed by column name. */
export type PhoneScreenAnswers = Record<string, string | number | boolean | null | undefined>;

export type CriterionOutcome = "pass" | "fail" | "unanswered" | "not_configured";

export interface CriterionResult {
  criterion: QualificationCriterion;
  outcome: CriterionOutcome;
  /** The answer as given, for display next to the result. */
  value: string | number | boolean | null;
}

export type VerdictState =
  /** No enabled, configured criteria — the framework has not been set up. */
  | "not_configured"
  /** Configured, but not every scored question has been answered yet. */
  | "in_progress"
  | "qualified"
  | "not_qualified";

export interface QualificationVerdict {
  state: VerdictState;
  results: CriterionResult[];
  /** Count of enabled+configured criteria. */
  total: number;
  /** How many of those have an answer. */
  answered: number;
  passed: number;
  failed: number;
  /** Weighted score of answered criteria, 0–1. Null when nothing is weighted. */
  score: number | null;
  /** True when a hard gate has been failed — this alone forces not_qualified. */
  hardGateFailed: boolean;
  /** Labels of the failed hard gates, for the "why" line. */
  hardGateFailures: string[];
}

const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const asNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * A criterion counts toward the verdict only when it is enabled AND has an
 * operator. Seeded rows are enabled=false with operator=null, so a
 * freshly-seeded framework scores nothing and reads "not configured".
 */
export const isConfigured = (c: QualificationCriterion): boolean =>
  c.enabled && c.operator !== null;

export function evaluateCriterion(
  criterion: QualificationCriterion,
  answers: PhoneScreenAnswers,
): CriterionResult {
  const raw = answers[criterion.question_key];
  const value = (raw ?? null) as string | number | boolean | null;

  if (!isConfigured(criterion)) {
    return { criterion, outcome: "not_configured", value };
  }
  if (isBlank(raw)) {
    return { criterion, outcome: "unanswered", value };
  }

  let pass = false;
  switch (criterion.operator) {
    case "is_true":
      pass = raw === true;
      break;
    case "is_false":
      pass = raw === false;
      break;
    case "not_empty":
      pass = !isBlank(raw);
      break;
    case "eq":
      if (criterion.expected_boolean !== null) {
        pass = raw === criterion.expected_boolean;
      } else if (criterion.expected_text !== null) {
        pass = String(raw).trim().toLowerCase() === criterion.expected_text.trim().toLowerCase();
      } else if (criterion.threshold_numeric !== null) {
        pass = asNumber(raw) === criterion.threshold_numeric;
      }
      break;
    case "gte": {
      const n = asNumber(raw);
      pass = n !== null && criterion.threshold_numeric !== null && n >= criterion.threshold_numeric;
      break;
    }
    case "lte": {
      const n = asNumber(raw);
      pass = n !== null && criterion.threshold_numeric !== null && n <= criterion.threshold_numeric;
      break;
    }
    case "between": {
      const n = asNumber(raw);
      pass =
        n !== null &&
        criterion.threshold_numeric !== null &&
        criterion.threshold_numeric_max !== null &&
        n >= criterion.threshold_numeric &&
        n <= criterion.threshold_numeric_max;
      break;
    }
    default:
      pass = false;
  }

  return { criterion, outcome: pass ? "pass" : "fail", value };
}

export function evaluateQualification(
  criteria: QualificationCriterion[],
  answers: PhoneScreenAnswers,
): QualificationVerdict {
  const ordered = [...criteria].sort((a, b) => a.sort_order - b.sort_order);
  const results = ordered.map((c) => evaluateCriterion(c, answers));

  const scored = results.filter((r) => r.outcome !== "not_configured");
  const answered = scored.filter((r) => r.outcome !== "unanswered");
  const passed = answered.filter((r) => r.outcome === "pass");
  const failed = answered.filter((r) => r.outcome === "fail");

  const hardGateFailures = failed
    .filter((r) => r.criterion.gate_type === "hard_gate")
    .map((r) => r.criterion.label);

  // Weighted score over the answered, weighted criteria only. Advisory
  // criteria are shown to the caller but never move the number — the
  // acq_qual_scores "info questions" rule.
  const weighted = answered.filter((r) => r.criterion.gate_type === "weighted");
  const weightTotal = weighted.reduce((sum, r) => sum + r.criterion.weight, 0);
  const weightHit = weighted
    .filter((r) => r.outcome === "pass")
    .reduce((sum, r) => sum + r.criterion.weight, 0);
  const score = weightTotal > 0 ? weightHit / weightTotal : null;

  let state: VerdictState;
  if (scored.length === 0) {
    state = "not_configured";
  } else if (hardGateFailures.length > 0) {
    // A failed hard gate is decisive the moment it happens — no need to wait
    // for the rest of the call.
    state = "not_qualified";
  } else if (answered.length < scored.length) {
    state = "in_progress";
  } else if (score !== null) {
    state = score >= 0.5 ? "qualified" : "not_qualified";
  } else {
    // Nothing weighted was answered, so the verdict rests on what did fail.
    // Previously this branch defaulted to "qualified" even with visible
    // failures ("Qualified · 2 failing" — the owner, 21 Aug); advisory-only
    // frameworks now go red when anything fails.
    state = failed.length === 0 ? "qualified" : "not_qualified";
  }

  return {
    state,
    results,
    total: scored.length,
    answered: answered.length,
    passed: passed.length,
    failed: failed.length,
    score,
    hardGateFailed: hardGateFailures.length > 0,
    hardGateFailures,
  };
}

export const VERDICT_COPY: Record<VerdictState, { label: string; blurb: string }> = {
  not_configured: {
    label: "Not configured",
    blurb: "No qualification criteria have been set yet — nothing is being scored.",
  },
  in_progress: {
    label: "In progress",
    blurb: "Some scored questions are still unanswered.",
  },
  qualified: {
    label: "Qualified",
    blurb: "Meets the criteria as configured.",
  },
  not_qualified: {
    label: "Not qualified",
    blurb: "Does not meet the criteria as configured.",
  },
};

// Green / red / neutral, per the brief's live indicator.
export const verdictClasses: Record<VerdictState, string> = {
  not_configured: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
  qualified: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  not_qualified: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
};
