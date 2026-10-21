import type { ReviewRoleTheme } from "./types";

/**
 * Account Executive theme — deals & money, per the registry's agreed
 * direction: an ascending, step-like market line (plateaus of pipeline work
 * punctuated by closed-deal jumps), warm gold accent, amber washes.
 */
export const accountExecutiveReviewTheme: ReviewRoleTheme = {
  role: "account_executive",
  accent: "38 82% 44%",
  orbA: "rgba(217, 158, 43, 0.09)",
  orbB: "rgba(234, 179, 8, 0.06)",
  orbC: "rgba(180, 120, 26, 0.05)",
  // Ascending market steps: flat pipeline stretches, then a close jumps the line.
  signal: [
    0.1, 0.12, 0.11, 0.24, 0.26, 0.25, 0.27, 0.42, 0.4, 0.43,
    0.44, 0.6, 0.58, 0.61, 0.63, 0.62, 0.78, 0.76, 0.8, 0.92,
  ],
  label: "AE Performance",
  tagline: "The month in deals — measured, then read together.",
};
