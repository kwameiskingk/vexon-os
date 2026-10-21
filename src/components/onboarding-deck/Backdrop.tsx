// The premium backdrop behind every onboarding deck: three blurred brand
// blobs, a faint grid with a radial mask, and SVG noise. No props.

export function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <div className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-violet-400/30 blur-[120px]" />
      <div className="absolute top-1/3 -right-40 h-[560px] w-[560px] rounded-full bg-fuchsia-400/25 blur-[130px]" />
      <div className="absolute -bottom-48 left-1/3 h-[480px] w-[480px] rounded-full bg-indigo-300/25 blur-[120px]" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(154,86,208,.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(154,86,208,.07) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.045] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
