import type { ReviewRoleTheme } from "./types";

/**
 * SDR Manager theme — management, per the registry's agreed direction: a
 * steadier line riding above a softer team baseline, rendered as one signal
 * whose rhythm alternates the manager's steadier cadence with the team's
 * choppier undertow. Slate-teal accent.
 */
export const sdrManagerReviewTheme: ReviewRoleTheme = {
  role: "sdr_manager",
  accent: "196 40% 36%",
  orbA: "rgba(51, 94, 111, 0.09)",
  orbB: "rgba(71, 118, 130, 0.06)",
  orbC: "rgba(40, 74, 90, 0.05)",
  // Steadier managerial cadence over a choppier team undertow.
  signal: [
    0.5, 0.54, 0.48, 0.56, 0.3, 0.62, 0.52, 0.24, 0.58, 0.5,
    0.36, 0.6, 0.54, 0.28, 0.56, 0.5, 0.4, 0.64, 0.52, 0.58,
  ],
  label: "SDR Manager Performance",
  tagline: "Personal delivery and team results — measured, then read together.",
};
