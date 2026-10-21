// Shared CEO design tokens — accents per tab + matching tinted backgrounds.
// Meridian round 2: keyed off the department palette in
// src/lib/departmentTheme.ts (ink variants: AA-safe as small text on white).
import { DEPARTMENT_THEMES } from "@/lib/departmentTheme";

export const CEO_ACCENTS = {
  dashboard: DEPARTMENT_THEMES.ceo.ink,
  sales: DEPARTMENT_THEMES.sales.ink,
  operations: DEPARTMENT_THEMES.operations.ink,
  hr: DEPARTMENT_THEMES.hr.ink,
  growth: DEPARTMENT_THEMES.gtm.ink,
} as const;

export const CEO_TINTS = {
  dashboard: "#efeff1",
  sales: "#E6EEFD",
  operations: "#E2F7F2",
  hr: "#FAF3DC",
  growth: "#F0E4F9",
} as const;

// Department -> colour map (project card stripe / chip on the Projects tab;
// key set = the ceo_initiatives / projects department vocabulary).
export const INITIATIVE_DEPT_COLOURS: Record<string, string> = {
  dev: DEPARTMENT_THEMES.dev.ink,
  ops: DEPARTMENT_THEMES.operations.ink,
  operations: DEPARTMENT_THEMES.operations.ink,
  hr: DEPARTMENT_THEMES.hr.ink,
  fulfilment: DEPARTMENT_THEMES.operations.ink,
  sales: DEPARTMENT_THEMES.sales.ink,
  other: DEPARTMENT_THEMES.referrals.ink,
};

export const INITIATIVE_DEPT_LABELS: Record<string, string> = {
  dev: "Dev",
  ops: "Operations",
  operations: "Operations",
  hr: "HR",
  fulfilment: "Fulfilment",
  sales: "Sales",
  other: "Other",
};

export const fmtGBP = (n: number | null | undefined) =>
  typeof n === "number" && !Number.isNaN(n)
    ? `£${Math.round(n).toLocaleString()}`
    : "—";

export const fmtPct = (numerator: number, denominator: number, digits = 1) => {
  if (!denominator || denominator <= 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(digits)}%`;
};

export const fmtNumber = (n: number | null | undefined) =>
  typeof n === "number" && !Number.isNaN(n) ? n.toLocaleString() : "—";

export const fmtHM = (mins: number | null | undefined) => {
  if (!mins || mins <= 0) return "0h";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};
