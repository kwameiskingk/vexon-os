// Shared payroll logic for the admin-driven invoicing system.
// Currency is per-employee; numbers are used as-is (no FX conversion).

export type PayrollCurrency = "USD" | "GBP";

export interface CustomBonus {
  label: string;
  amount: number;
  note?: string;
}

export interface Deduction {
  label: string;
  amount: number;
  reason?: string;
}

export interface PayrollComputeInput {
  sat_meetings_count: number;
  per_meeting_bonus: number;
  base_salary: number;
  custom_bonuses?: CustomBonus[];
  deductions?: Deduction[];
}

export interface PayrollComputeResult {
  commission: number;
  tiered_bonus_amount: number;
  tiered_bonus_tier: number | null;
  custom_bonuses_total: number;
  deductions_total: number;
  grand_total: number;
}

// Tiered sat-meeting bonuses (highest tier reached wins — NOT cumulative).
// Amounts are applied as a flat number in the employee's currency.
export const TIERED_BONUSES: Array<{ threshold: number; amount: number }> = [
  { threshold: 50, amount: 500 },
  { threshold: 30, amount: 250 },
  { threshold: 25, amount: 175 },
  { threshold: 20, amount: 100 },
  { threshold: 15, amount: 50 },
];

export function getTieredBonus(sats: number): { amount: number; tier: number | null } {
  for (const tier of TIERED_BONUSES) {
    if (sats >= tier.threshold) return { amount: tier.amount, tier: tier.threshold };
  }
  return { amount: 0, tier: null };
}

export function computePayroll(input: PayrollComputeInput): PayrollComputeResult {
  const commission = (input.sat_meetings_count || 0) * (input.per_meeting_bonus || 0);
  const tiered = getTieredBonus(input.sat_meetings_count || 0);
  const custom_bonuses_total = (input.custom_bonuses || []).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const deductions_total = (input.deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const grand_total =
    (input.base_salary || 0) +
    commission +
    tiered.amount +
    custom_bonuses_total -
    deductions_total;
  return {
    commission,
    tiered_bonus_amount: tiered.amount,
    tiered_bonus_tier: tiered.tier,
    custom_bonuses_total,
    deductions_total,
    grand_total,
  };
}

const CURRENCY_LOCALES: Record<PayrollCurrency, string> = {
  USD: "en-US",
  GBP: "en-GB",
};

export function formatMoney(amount: number, currency: PayrollCurrency | string | null | undefined): string {
  const cur = (currency || "USD") as PayrollCurrency;
  const locale = CURRENCY_LOCALES[cur] || "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(amount || 0);
  } catch {
    return `${amount?.toFixed(2) ?? "0.00"} ${cur}`;
  }
}

// Period helpers — invoice cycle window is 1st of month → today (or cycle-close date).
export function getInvoiceCycleStart(refDate: Date = new Date()): Date {
  return new Date(refDate.getFullYear(), refDate.getMonth(), 1);
}
