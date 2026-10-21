import { cn } from "@/lib/utils";
import { LucideIcon, Inbox } from "lucide-react";
import { ReactNode } from "react";
import { Button } from "./button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
  className?: string;
}

export const EmptyState = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  children,
  className,
}: EmptyStateProps) => {
  return (
    <div 
      className={cn(
        "flex flex-col items-center justify-center py-10 px-6",
        "text-center animate-fade-in",
        "border-[1.5px] border-dashed border-border/60 rounded-xl mx-auto max-w-md",
        className
      )}
    >
      <div className="relative mb-5">
        <div className="rr-empty-icon">
          <Icon className="h-7 w-7" strokeWidth={1.75} />
        </div>
      </div>
      
      <h3 className="text-base font-heading font-semibold text-foreground/80 mb-1.5">
        {title}
      </h3>
      
      {description && (
        <p className="text-sm text-muted-foreground/60 max-w-[280px] mb-5">
          {description}
        </p>
      )}
      
      {action && (
        <Button onClick={action.onClick} size="sm" className="rounded-lg">
          {action.label}
        </Button>
      )}
      
      {children}
    </div>
  );
};
