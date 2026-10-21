// Appointment-scoring rubric — mirrors the Client Health sheet's Rubric tab
// (see CLIENT_HEALTH_SHEET_REFERENCE.md, Tab 3). Keyed to SCORE_DIMENSIONS
// keys from src/lib/meetingScores.ts. The per-level wording follows the
// reference doc's definitions; paste the sheet's exact phrasing over these
// strings if finer wording is wanted — the structure won't change.

import type { ScoreValue } from "@/lib/meetingScores";

export interface RubricCriterion {
  key: "fit" | "engagement" | "authority" | "next_step";
  description: string;
  levels: Record<ScoreValue, string>;
}

export const APPOINTMENT_RUBRIC: RubricCriterion[] = [
  {
    key: "fit",
    description: "How well the prospect matches the client's ideal customer profile.",
    levels: {
      1: "Poor — no fit: wrong industry, size or geography for the client.",
      2: "Weak — partial overlap, but a clear mismatch on a core ICP criterion.",
      3: "Moderate — plausible fit with some gaps against the ICP.",
      4: "Strong — matches the ICP on all major criteria.",
      5: "Excellent — textbook ICP prospect for this client.",
    },
  },
  {
    key: "engagement",
    description: "How actively the prospect participated in the meeting.",
    levels: {
      1: "Poor — silent or visibly distracted throughout.",
      2: "Weak — minimal responses, no real interest shown.",
      3: "Moderate — engaged when prompted, some genuine interaction.",
      4: "Strong — participated actively and responded with substance.",
      5: "Excellent — leaned in, asked questions, drove parts of the conversation.",
    },
  },
  {
    key: "authority",
    description: "Whether the attendee was a decision-maker.",
    levels: {
      1: "Poor — no decision-making power at all.",
      2: "Weak — junior contact, far from the buying decision.",
      3: "Moderate — influencer with a line to the decision-maker.",
      4: "Strong — decision-maker for this purchase or a direct gatekeeper.",
      5: "Excellent — economic buyer present in the meeting.",
    },
  },
  {
    key: "next_step",
    description: "Whether a concrete next step was set.",
    levels: {
      1: "Poor — no next step of any kind.",
      2: "Weak — vague 'stay in touch' with nothing scheduled.",
      3: "Moderate — soft next step discussed but not locked in.",
      4: "Strong — concrete next step agreed with a date.",
      5: "Excellent — advanced commitment (e.g. terms, shortlist, or contract step).",
    },
  },
];

/** "Quality meeting" threshold — Overall Quality (avg of the four) ≥ 4. */
export const QUALITY_MEETING_THRESHOLD = 4;
