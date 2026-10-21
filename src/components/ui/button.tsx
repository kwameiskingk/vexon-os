import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Buttons (14 Oct 2026): default = the brand gradient with dark ink, 700;
// outline = quiet (transparent, --line2 border); no lift, no glow, no blur.
// Hover and focus transitions only, 120ms. Variant and size names unchanged.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[12.5px] font-semibold ring-offset-background transition-colors duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-grad text-[#0f0f11] font-bold border border-transparent hover:brightness-[1.05]",
        /** Solid accent button (periwinkle dark / indigo light). */
        accent:
          "bg-primary text-primary-foreground border border-transparent hover:brightness-[1.06]",
        destructive:
          "bg-msp-bad-bg text-msp-bad border border-transparent hover:brightness-[1.08]",
        outline:
          "bg-transparent border border-msp-line2 text-foreground hover:bg-msp-surf2",
        secondary:
          "bg-msp-surf2 border border-transparent text-foreground hover:bg-msp-surf3",
        ghost:
          "text-muted-foreground hover:bg-msp-surf2 hover:text-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-[11.5px]",
        lg: "h-10 px-6 text-[13px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
