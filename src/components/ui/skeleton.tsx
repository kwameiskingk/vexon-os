import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn(
        "rounded-md",
        "relative overflow-hidden",
        "bg-[hsl(var(--muted)/0.5)]",
        "before:absolute before:inset-0",
        "before:bg-gradient-to-r before:from-transparent before:via-[hsl(var(--foreground)/0.04)] before:to-transparent",
        "before:animate-shimmer",
        "transition-opacity duration-300",
        className
      )} 
      {...props} 
    />
  );
}

export { Skeleton };
