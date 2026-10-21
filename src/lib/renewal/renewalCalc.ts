/**
 * Renewal ROI calculation model — a pure, DOM-free transcription of the
 * signed-off artefact (docs/renewals/renewal-roi-presenter.html, render()).
 *
 * This is Daniel and Marcus's model, implemented EXACTLY as the artefact's
 * JavaScript computes it (2026-08-12 ruling): column C keeps the 4× "one role
 * per quarter" multiplier with no ramp, no relabelling and no added caveats.
 * Do not "correct" it here.
 *
 *   showUpRate = sat / booked
 *   A (completed campaign, actuals — never affected by the projection toggle):
 *     feesA = vacancies × fee;  roiA = feesA / investment3mo;  netA = feesA − investment3mo
 *   B (next 12 months at current rate):
 *     mult = 4 × scenarioFactor;  bookedB = booked × mult;  satB = sat × mult
 *     vacB = vacancies × mult;  feesB = vacB × fee;  investB = monthly × 12  (NOT scaled)
 *   C (next 12 months, accounts worked — one role per quarter per account):
 *     vacC = vacB × 4;  feesC = vacC × fee;  investment identical to B
 *
 *   scenarioFactor: Low 0.8 · Expected 1.0 · High 1.2 — applies to B and C only.
 */

export type ScenarioFactor = 0.8 | 1 | 1.2;

export const SCENARIOS: { key: "low" | "expected" | "high"; label: string; factor: ScenarioFactor }[] = [
  { key: "low", label: "Low", factor: 0.8 },
  { key: "expected", label: "Expected", factor: 1 },
  { key: "high", label: "High", factor: 1.2 },
];

export interface RenewalCalcInputs {
  booked: number;
  sat: number;
  vacancies: number;
  fee: number;
  /** Campaign investment — total paid for the 3 months. */
  investment: number;
  /** Ongoing monthly investment — drives the 12-month cost. */
  monthly: number;
}

export interface ScenarioResult {
  booked: number;
  sat: number;
  /** Fraction 0–1, or null when booked is 0 (renders as an em-dash). */
  showUpRate: number | null;
  vacancies: number;
  fees: number;
  investment: number;
  /** fees / investment, or null when investment ≤ 0 (renders as an em-dash). */
  roi: number | null;
  net: number;
}

export interface RenewalCalcOutput {
  a: ScenarioResult;
  b: ScenarioResult;
  c: ScenarioResult;
  scenarioFactor: ScenarioFactor;
}

/** The artefact's num() coercion: non-numeric or negative input becomes 0. */
export const coerce = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const scenario = (
  booked: number,
  sat: number,
  vacancies: number,
  fees: number,
  investment: number,
  showUpRate: number | null,
): ScenarioResult => ({
  booked,
  sat,
  showUpRate,
  vacancies,
  fees,
  investment,
  roi: investment > 0 ? fees / investment : null,
  net: fees - investment,
});

export function computeRenewal(inputs: RenewalCalcInputs, factor: ScenarioFactor): RenewalCalcOutput {
  const booked = coerce(inputs.booked);
  const sat = coerce(inputs.sat);
  const vac = coerce(inputs.vacancies);
  const fee = coerce(inputs.fee);
  const inv3 = coerce(inputs.investment);
  const monthly = coerce(inputs.monthly);

  // One show-up rate across all three columns, exactly as the artefact
  // renders it (sat ÷ booked — never scaled, never directly editable).
  const showUpRate = booked > 0 ? sat / booked : null;

  const feesA = vac * fee;

  const mult = 4 * factor;
  const bookedB = booked * mult;
  const satB = sat * mult;
  const vacB = vac * mult;
  const feesB = vacB * fee;
  const invB = monthly * 12; // NOT scaled by scenarioFactor

  const vacC = vacB * 4; // one role per quarter per account
  const feesC = vacC * fee;

  return {
    a: scenario(booked, sat, vac, feesA, inv3, showUpRate),
    b: scenario(bookedB, satB, vacB, feesB, invB, showUpRate),
    c: scenario(bookedB, satB, vacC, feesC, invB, showUpRate),
    scenarioFactor: factor,
  };
}

/* ---------- Formatters — byte-for-byte behaviour of the artefact ---------- */

const EM_DASH = "—";

/** "£72,000" — en-GB, thousands separators, rounded to whole pounds. */
export const money = (n: number): string => "£" + Math.round(n).toLocaleString("en-GB");

/** "9.6×", or an em-dash when investment ≤ 0 (never Infinity). */
export const roiText = (fees: number, inv: number): string =>
  inv <= 0 ? EM_DASH : (fees / inv).toFixed(1) + "×";

/** "£64,500 ahead · +860%" / "£1,500 behind · −20%" — never malformed. */
export const netText = (fees: number, inv: number): string => {
  const net = fees - inv;
  const pct = inv > 0 ? Math.round((net / inv) * 100) : 0;
  return (
    (net >= 0 ? money(net) + " ahead" : money(Math.abs(net)) + " behind") +
    " · " +
    (net >= 0 ? "+" : "−") +
    Math.abs(pct) +
    "%"
  );
};

/** "83%", or an em-dash when booked is 0 (never NaN). */
export const showRateText = (booked: number, sat: number): string =>
  booked > 0 ? Math.round((sat / booked) * 100) + "%" : EM_DASH;

/** Whole-number display for meeting/vacancy counts, en-GB. */
export const count = (n: number): string => Math.round(n).toLocaleString("en-GB");

/** The methodology note, verbatim from the artefact (values interpolated). */
export const methodologyNote = (fee: number, factor: ScenarioFactor, scenarioLabel: string): string =>
  "How these numbers are built. The completed campaign shows actual booked and sat meetings and the vacancies they produced. " +
  `The 12-month figures run the same monthly rate forward for a further year at ${Math.round(factor * 100)}% of current performance (${scenarioLabel.toLowerCase()} case). ` +
  `Placement fees are shown at full potential — ${money(fee)} per vacancy, every role filled — so treat them as the ceiling rather than a forecast. ` +
  "The third column keeps activity identical and assumes each account you win returns to you with one role a quarter.";
