import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewNarrativePanel } from "@/components/ops-command/performance-review/ReviewNarrativePanel";
import type { ReviewBriefRow, PerformanceReviewRow } from "@/hooks/useSetterReview";
import type { AECompiledMetrics, AEMetricValue } from "@/hooks/useAEReview";

/**
 * PRESENTATION BOUNDARY — the complete rendered AE review for one AE+period.
 * Pure function of (review, brief); no data fetching (same contract as
 * SetterReviewContent).
 */

const METRIC_LABELS: Record<string, string> = {
  deals_closed: "Deals closed",
  cash_collected: "Cash collected",
  cold_calls: "Cold calls",
  talk_minutes: "Talk time (min)",
  reengaged_meetings: "Re-engaged meetings",
};

const PERIOD_LABELS: Record<string, string> = { day: "daily", week: "weekly", month: "monthly" };

/**
 * compiled_metrics is a frozen snapshot — reviews stored before a metric was
 * added to `order` never carry its key. Render those exactly like a null
 * actual (em-dash + pending note) instead of throwing on `undefined.actual`.
 */
const MISSING_METRIC: AEMetricValue = {
  actual: null,
  prior: null,
  delta_pct: null,
  target: null,
  target_period: null,
  pending_note: "Not tracked in this review — it was compiled before this metric existed.",
};

function formatValue(metric: string, v: number | null): string {
  if (v === null) return "—";
  if (metric === "cash_collected") return `£${Number(v).toLocaleString("en-GB")}`;
  return Number(v).toLocaleString("en-GB");
}

function MetricCard({ metric, value, reveal }: { metric: string; value: AEMetricValue; reveal: number }) {
  return (
    <Card data-reveal={String(reveal)}>
      <CardContent className="pt-5 space-y-1.5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {METRIC_LABELS[metric] || metric}
        </div>
        <div className="text-2xl font-bold tabular-nums">{formatValue(metric, value.actual)}</div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          {value.target !== null ? (
            <div>
              Target: {formatValue(metric, value.target)}
              {value.target_period ? ` ${PERIOD_LABELS[value.target_period] || value.target_period}` : ""}
            </div>
          ) : (
            <div>No target set</div>
          )}
          {value.delta_pct !== null && (
            <div>
              {value.delta_pct >= 0 ? "+" : ""}
              {value.delta_pct.toFixed(1)}% vs prior month
            </div>
          )}
          {value.pending_note && (
            <div className="italic text-amber-600 dark:text-amber-500">{value.pending_note}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AEReviewContent({
  review,
  brief,
}: {
  review: PerformanceReviewRow;
  brief: ReviewBriefRow | null | undefined;
}) {
  const compiled = review.compiled_metrics as unknown as AECompiledMetrics;
  const order = ["deals_closed", "cash_collected", "cold_calls", "talk_minutes", "reengaged_meetings"];

  return (
    <div className="space-y-6">
      <div data-reveal="2" className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-xl font-bold tracking-tight">
            {compiled.subject.full_name} — {compiled.window.label}
          </div>
          <div className="text-xs text-muted-foreground">
            {compiled.window.days_worked} days worked (attendance)
            {compiled.window.prior ? ` · compared with ${compiled.window.prior.label}` : ""}
            {" · all money GBP"}
          </div>
        </div>
        <Badge variant="outline" className="text-muted-foreground">AE</Badge>
        {!compiled.subject.close_linked && (
          <Badge variant="outline" className="text-amber-600 border-amber-500/40">
            No Close ID linked
          </Badge>
        )}
      </div>

      {/* Deterministic truth first, AI interpretation clearly separated below */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {order.map((m, i) => (
          <MetricCard key={m} metric={m} value={compiled.metrics[m] ?? MISSING_METRIC} reveal={3 + i} />
        ))}
      </div>
      <ReviewNarrativePanel brief={brief} />
    </div>
  );
}
