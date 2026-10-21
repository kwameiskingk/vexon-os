import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-[12px]",
        "bg-input border border-border",
        "backdrop-blur-[10px]",
        "px-3.5 py-3 text-base text-foreground",
        "ring-offset-background",
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
});
Textarea.displayName = "Textarea";

export { Textarea };
