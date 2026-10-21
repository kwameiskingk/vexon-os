import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// The Pill (14 Oct 2026): mono 10px uppercase, radius 4. Default is an
// outlined pill; status variants are low-saturation tints with no border.
// Variant names are unchanged so every existing <Badge variant="…"> works.
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] border px-[7px] py-[2px] font-mono text-[10px] font-medium uppercase leading-[1.4] tracking-[0.05em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
  {
    variants: {
      variant: {
        default:
          "border-msp-line2 bg-transparent text-msp-ink2",
        secondary:
          "border-msp-line2 bg-transparent text-msp-ink2 hover:bg-msp-surf2",
        destructive:
          "border-transparent bg-msp-bad-bg text-msp-bad",
        success:
          "border-transparent bg-msp-ok-bg text-msp-ok",
        outline:
          "border-msp-line2 bg-transparent text-foreground",
        // Standardised semantic status badges
        healthy:
          "border-transparent bg-msp-ok-bg text-msp-ok",
        pending:
          "border-transparent bg-msp-warn-bg text-msp-warn",
        at_risk:
          "border-transparent bg-msp-bad-bg text-msp-bad",
        info:
          "border-transparent bg-msp-info-bg text-msp-info",
        /** Gradient pill with dark ink: "New", launches, highlights. */
        brand:
          "border-transparent bg-grad text-[#0f0f11] font-semibold",
        /** Tonal pill with the accent as text. */
        "brand-soft":
          "border-transparent bg-msp-info-bg text-msp-info",
        /** Tonal pill, plain ink (the department colour no longer tints it). */
        dept:
          "border-transparent bg-msp-surf3 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
