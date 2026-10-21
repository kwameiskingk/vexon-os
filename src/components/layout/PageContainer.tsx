import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  /** A reading-width column (760px) for forms and settings. */
  narrow?: boolean;
  /** Wide lists: lets the canvas use the whole pane on very wide screens. */
  wide?: boolean;
}

// The shell (DashboardLayout) fills the pane with 28px side padding (the owner,
// 15 Oct). PageContainer only narrows or widens that canvas.
export const PageContainer = ({ children, className, narrow = false, wide = false }: PageContainerProps) => {
  return (
    <div
      data-page-width={wide ? "wide" : undefined}
      className={cn(
        "w-full",
        narrow ? "max-w-[760px]" : "max-w-none",
        className
      )}
    >
      {children}
    </div>
  );
};
