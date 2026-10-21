import type { ReviewRoleTheme } from "./types";

/**
 * Setter theme (v2) — the reference role theme.
 *
 * The setter's world rendered abstractly: the signal line is an irregular
 * call-audio rhythm (bursts of conversation, beats of silence), drawn in
 * once and then still. Deep teal accent, three low-alpha washes that frame
 * the page. No literal iconography — the restraint IS the theme.
 */
export const setterReviewTheme: ReviewRoleTheme = {
  role: "setter",
  accent: "173 62% 34%",
  orbA: "rgba(15, 118, 110, 0.09)",
  orbB: "rgba(13, 148, 136, 0.06)",
  orbC: "rgba(17, 94, 89, 0.05)",
  // Call-audio cadence: conversation bursts separated by near-silence.
  signal: [
    0.12, 0.42, 0.28, 0.66, 0.35, 0.82, 0.3, 0.14, 0.5, 0.72,
    0.4, 0.9, 0.32, 0.16, 0.58, 0.44, 0.76, 0.26, 0.62, 0.2,
    0.48, 0.34, 0.7, 0.15,
  ],
  label: "Setter Performance",
  tagline: "The month on the phones — measured, then read together.",
};
