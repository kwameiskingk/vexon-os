// Confetti helpers for the onboarding decks (client + SDR + sandboxes).
// Extracted verbatim from the client deck (3 Sep) so every deck celebrates
// the same way: a small, elegant burst per card and three bigger bursts when
// the whole deck is done.

import confetti from "canvas-confetti";

export const BRAND = ["#dedede", "#9e9e9e", "#6b7a90", "#dedede", "#ffffff"];

/** Small, elegant burst per card (the owner: "small burst but elegant"). */
export function celebrateCard() {
  confetti({
    particleCount: 42,
    spread: 58,
    startVelocity: 26,
    gravity: 1.05,
    scalar: 0.85,
    ticks: 160,
    origin: { y: 0.62 },
    colors: BRAND,
    disableForReducedMotion: true,
  });
}

export function celebrateFinish() {
  const opts = { spread: 110, startVelocity: 34, ticks: 220, colors: BRAND, disableForReducedMotion: true };
  confetti({ ...opts, particleCount: 140, origin: { y: 0.65 } });
  setTimeout(() => confetti({ ...opts, particleCount: 90, origin: { x: 0.2, y: 0.5 } }), 250);
  setTimeout(() => confetti({ ...opts, particleCount: 90, origin: { x: 0.8, y: 0.5 } }), 400);
}

/** Time-of-day greeting shared by the decks. */
export const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};
