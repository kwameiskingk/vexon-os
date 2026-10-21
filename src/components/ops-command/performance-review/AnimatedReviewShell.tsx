import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { ReviewRoleTheme } from "@/lib/reviewThemes";

/**
 * Role-agnostic presentation layer for the performance review (v2).
 *
 * PURE WRAPPER: removing it (rendering children bare) yields the identical
 * plain review — it contributes background, the staged reveal and themed
 * chrome only, and never touches a number. The content components carry
 * inert [data-reveal] order markers; the .review-stage CSS scope in
 * index.css is the only thing that activates them.
 *
 * v2 choreography — a deliberate ~2.1s event that resolves to stillness:
 *   1. FRAME (0–900ms): ambient washes settle in; the role's abstract
 *      signal line draws across once; quiet signal arcs appear.
 *   2. IDENTITY (~350ms): kicker + the person's headline arrive with a
 *      soft blur-resolve.
 *   3. CASCADE (~700ms→): metric cards rise in strict 70ms stagger.
 *      The day-highlight pair lands as its own beat (~1.25s) with a
 *      2% overshoot; the commentary card closes the sequence.
 *   Settled by ~2.1s. At rest, only a sub-perceptual 40s wash breathe
 *   remains — nothing moves under the numbers.
 *
 * Craft rules: transform/opacity (plus one small blur-resolve on the
 * headline) only; no layout properties animate; zero layout shift; content
 * interactive mid-reveal; prefers-reduced-motion collapses everything to a
 * calm static page.
 */
export function AnimatedReviewShell({
  theme,
  replayKey,
  children,
}: {
  theme: ReviewRoleTheme | null;
  /** Change to replay the reveal (e.g. the review id). */
  replayKey?: string;
  children: ReactNode;
}) {
  const signalPath = useMemo(() => {
    if (!theme) return "";
    const pts = theme.signal;
    const n = pts.length;
    if (n < 2) return "";
    return pts
      .map((a, i) => {
        const x = (i / (n - 1)) * 100;
        // Alternate polarity around the midline → abstract audio cadence.
        const y = 12 + (i % 2 === 0 ? -1 : 1) * a * 9;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [theme]);

  if (!theme) return <>{children}</>;

  const vars = {
    "--review-accent": theme.accent,
    "--review-orb-a": theme.orbA,
    "--review-orb-b": theme.orbB,
    "--review-orb-c": theme.orbC,
  } as CSSProperties;

  return (
    <div key={replayKey} className="review-stage relative" style={vars}>
      {/* Ambient themed frame — behind everything, never interactive */}
      <div aria-hidden className="review-bg pointer-events-none absolute inset-0 -m-4 overflow-hidden rounded-2xl">
        <div className="review-orb review-orb-a" />
        <div className="review-orb review-orb-b" />
        <div className="review-orb review-orb-c" />
        {/* Concentric signal arcs — quiet broadcast suggestion, top right */}
        <svg
          className="review-arcs absolute -top-10 -right-10 h-56 w-56"
          viewBox="0 0 200 200"
          fill="none"
        >
          {[52, 82, 112].map((r, i) => (
            <circle
              key={r}
              cx="200"
              cy="0"
              r={r}
              pathLength={1}
              className="review-arc"
              style={{ animationDelay: `${420 + i * 160}ms` }}
            />
          ))}
        </svg>
      </div>

      <div className="relative">
        {/* Identity strip: kicker + signal line + tagline (shell-owned) */}
        <div data-reveal="1" className="review-identity mb-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="review-kicker">{theme.label}</span>
            <span className="hidden sm:block text-[11px] text-muted-foreground/70">
              {theme.tagline}
            </span>
          </div>
          <svg
            aria-hidden
            className="review-signal-svg mt-2 h-9 w-full"
            viewBox="0 0 100 24"
            preserveAspectRatio="none"
            fill="none"
          >
            <path d={signalPath} pathLength={1} className="review-signal" />
          </svg>
        </div>
        {children}
      </div>
    </div>
  );
}
