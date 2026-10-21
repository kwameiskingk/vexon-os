import { cn } from "@/lib/utils";

/** Initials or image. `ring` adds the gradient ring (people who are signed in or selected). */
export function Avatar({ name, src, size = 28, ring = false, className }: { name: string; src?: string | null; size?: number; ring?: boolean; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--surf3)] font-head font-medium text-[var(--ink2)]",
        ring && "shadow-[0_0_0_2px_var(--bg),0_0_0_3.5px_#9e9e9e]",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-label={name}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}
