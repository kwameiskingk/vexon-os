import { setterReviewTheme } from "./setter";
import { accountExecutiveReviewTheme } from "./accountExecutive";
import { sdrManagerReviewTheme } from "./sdrManager";
import type { ReviewRoleTheme, ReviewThemeRole } from "./types";

export type { ReviewRoleTheme, ReviewThemeRole } from "./types";

/**
 * Role → theme registry for the performance-review presentation layer.
 *
 * SLOTS FOR THE FOUR UPCOMING ROLE REVIEWS — each is one theme file (copy
 * setter.ts as the template) + one entry here. The motion engine needs NO
 * changes. Suggested abstract signal directions, agreed at build time:
 *
 *   account_executive: deals & money — an ascending, step-like market
 *     line; warm gold accent, amber washes.
 *   csm: clients & health — a calm, regular pulse line; blue-green accent.
 *   hr: hiring & wellbeing — a gentle compounding growth curve; warm
 *     amber accent.
 *   sdr_manager: management — a steadier line riding above a softer team
 *     baseline; slate-teal accent.
 *
 * A role without a theme renders the review with NO presentation layer
 * (plain, fully functional) — themes are additive, never load-bearing.
 */
export const REVIEW_ROLE_THEMES: Partial<Record<ReviewThemeRole, ReviewRoleTheme>> = {
  setter: setterReviewTheme,
  account_executive: accountExecutiveReviewTheme,
  sdr_manager: sdrManagerReviewTheme,
};

export function resolveReviewTheme(role: string | null | undefined): ReviewRoleTheme | null {
  if (!role) return null;
  return REVIEW_ROLE_THEMES[role as ReviewThemeRole] ?? null;
}
