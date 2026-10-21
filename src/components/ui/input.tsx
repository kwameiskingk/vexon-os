import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-[12px]",
          "bg-input border border-border",
          "backdrop-blur-[10px]",
          "px-3.5 py-3 text-base text-foreground",
          "ring-offset-background",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground/60",
          "focus-visible:outline-none focus-visible:border-primary",
          "focus-visible:shadow-[0_0_0_2px_hsl(var(--primary)/0.25)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-200",
          "md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
