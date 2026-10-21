import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonV2Variant = "primary" | "secondary" | "ghost";

/** Primary = gradient fill with dark ink. Secondary = quiet outline. */
export const ButtonV2 = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonV2Variant; size?: "sm" | "md" }>(
  ({ variant = "secondary", size = "md", className, children, ...rest }, ref) => (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      className={cn(
        "inline-flex items-center gap-[6px] rounded-md font-body font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50",
        size === "md" ? "px-[11px] py-[6px] text-[12px]" : "px-2 py-[3px] text-[11.5px]",
        variant === "primary" && "border border-transparent text-[#0f0f11] [background:var(--grad)] font-bold hover:brightness-105",
        variant === "secondary" && "border border-[var(--line2)] bg-transparent text-[var(--ink)] hover:bg-[var(--surf2)]",
        variant === "ghost" && "border border-transparent bg-transparent text-[var(--ink2)] hover:bg-[var(--surf2)]",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  ),
);
ButtonV2.displayName = "ButtonV2";
