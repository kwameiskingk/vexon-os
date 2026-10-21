/**
 * Role-themeable performance-review presentation system (v2).
 *
 * The MOTION ENGINE (AnimatedReviewShell + the .review-stage CSS block in
 * index.css) is role-agnostic: the staged reveal, settle timing,
 * reduced-motion behaviour and performance rules are fixed. Everything a
 * role contributes — accent, ambient orb colours, its abstract signal line,
 * identity copy — lives in a ReviewRoleTheme config. Adding a role's review
 * look = one theme file + one registry entry. Never fork the engine per
 * role.
 *
 * v2 design language: no literal icons. Each role expresses its world as an
 * ABSTRACT signal — a thin drawn line whose rhythm suggests the work
 * (a call-audio waveform for setters; ascending market line for AE; a calm
 * health pulse for CSM; a gentle growth curve for HR; layered team lines
 * for the SDR manager) — plus quiet concentric signal arcs and three
 * ambient colour washes. Premium, deliberate, screenshare-safe.
 */

export type ReviewThemeRole = "setter" | "account_executive" | "csm" | "hr" | "sdr_manager";

export interface ReviewRoleTheme {
  role: ReviewThemeRole;
  /** Accent hsl triplet (e.g. "173 62% 34%") — chrome, signal, arcs. */
  accent: string;
  /** Three ambient orb colours (rgba strings, LOW alpha — they frame, never compete). */
  orbA: string;
  orbB: string;
  orbC: string;
  /**
   * Normalised 0..1 amplitude series for the role's signal line — drawn in
   * once during the reveal, then perfectly still. 16–28 points reads best.
   */
  signal: number[];
  /** Small-caps kicker above the review (e.g. "Setter Performance"). */
  label: string;
  /** One quiet line under the kicker. */
  tagline: string;
}
