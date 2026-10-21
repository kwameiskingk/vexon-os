import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import { ReviewMetricsPanel } from "./ReviewMetricsPanel";
import { ReviewNarrativePanel } from "./ReviewNarrativePanel";
import type { PerformanceReviewRow, ReviewBriefRow } from "@/hooks/useSetterReview";

/**
 * PRESENTATION BOUNDARY — the complete rendered review for one setter+period.
 *
 * This component is a pure function of (review, brief) with no data fetching
 * and no route/query coupling. A future presentation layer (the animated /
 * "Wrapped" experience) should WRAP this component — or consume the same two
 * props — rather than re-deriving any data. Keep it that way.
 */
export function SetterReviewContent({
  review,
  brief,
  onEditMetrics,
}: {
  review: PerformanceReviewRow;
  brief: ReviewBriefRow | null | undefined;
  /**
   * Opens the manual-adjustment panel (meetings booked / sat / warm leads).
   * Presentation-only: the caller owns the data and passes this in, so this
   * component stays a pure function of its props.
   */
  onEditMetrics?: () => void;
}) {
  const compiled = review.compiled_metrics;

  return (
    <div className="space-y-6">
      <div data-reveal="2" className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-xl font-bold tracking-tight">
            {compiled.setter.full_name} — {compiled.window.label}
          </div>
          <div className="text-xs text-muted-foreground">
            {compiled.window.days_worked} days worked (attendance)
            {compiled.window.prior ? ` · compared with ${compiled.window.prior.label}` : ""}
          </div>
        </div>
        {compiled.setter.department && (
          <Badge variant="outline" className="capitalize text-muted-foreground">
            {compiled.setter.department}
          </Badge>
        )}
        {onEditMetrics && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={onEditMetrics}
            title="Adjust meetings booked, meetings sat and warm leads"
          >
            <Settings2 className="h-4 w-4" />
            Adjust figures
          </Button>
        )}
      </div>

      {/* Deterministic truth first, AI interpretation clearly separated below */}
      <ReviewMetricsPanel compiled={compiled} />
      <ReviewNarrativePanel brief={brief} />
    </div>
  );
}
