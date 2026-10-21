import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string | ReactNode;
  subtitle?: string;
  /** Rendered on their own line under the subtitle, never beside the title. */
  actions?: ReactNode;
  className?: string;
  /** Kept for compatibility. Gradient text is retired; the title is solid ink. */
  gradient?: boolean;
  /** Small mono eyebrow above the title. */
  eyebrow?: string;
  /** Opt in to the single 2px gradient rule under the title (one per page). */
  rule?: boolean;
}

export const PageHeader = ({
  title,
  subtitle,
  actions,
  className,
  eyebrow,
  rule = false,
}: PageHeaderProps) => {
  return (
    <div className={cn("rr-ph", className)}>
      {eyebrow && <span className="rr-eyebrow mb-2">{eyebrow}</span>}
      <h1 className={cn("rr-title", rule && "rr-title-rule")}>{title}</h1>
      {subtitle && <p className="rr-ph-sub">{subtitle}</p>}
      {actions && <div className="rr-ph-actions">{actions}</div>}
    </div>
  );
};
