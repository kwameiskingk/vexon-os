import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewNarrativePanel } from "@/components/ops-command/performance-review/ReviewNarrativePanel";
import type { ReviewBriefRow, PerformanceReviewRow } from "@/hooks/useSetterReview";
import type {
  ManagerMetricValue,
  SdrManagerCompiledMetrics,
} from "@/hooks/useSdrManagerReview";

/**
 * PRESENTATION BOUNDARY — the complete rendered SDR-manager review.
 * Two strictly separated sections (personal delivery / team performance),
 * mirroring the compile groups and the narrative prompt's tagging rule.
 * Pure function of (review, brief); no data fetching.
 */

const METRIC_LABELS: Record<string, string> = {
  coaching_sessions: "Coaching sessions run",
  team_booked: "Team meetings booked",
  team_sat: "Team meetings sat",
  team_sat_rate_pct: "Team SAT rate",
  team_avg_dials_per_setter_day: "Avg dials / setter / day",
  team_avg_talk_minutes_per_setter_day: "Avg talk min / setter / day",
  team_avg_booked_per_setter_week: "Avg booked / setter / week",
};

const PERIOD_LABELS: Record<string, string> = { day: "daily", week: "weekly", month: "monthly" };

/**
 * compiled_metrics is a frozen snapshot — reviews stored before a metric was
 * added to the tile lists never carry its key. Render those exactly like a
 * null actual (em-dash + note) instead of throwing on `undefined.actual`.
 */
const MISSING_METRIC: ManagerMetricValue = {
  actual: null,
  prior: null,
  delta_pct: null,
  target: null,
  target_period: null,
  note: "Not tracked in this review — it was compiled before this metric existed.",
};

function formatValue(metric: string, v: number | null): string {
  if (v === null) return "—";
  if (metric === "team_sat_rate_pct") return `${Number(v).toLocaleString("en-GB")}%`;
  return Number(v).toLocaleString("en-GB");
}

function MetricCard({ metric, value, reveal }: { metric: string; value: ManagerMetricValue; reveal: number }) {
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
          {value.note && (
            <div className="italic text-amber-600 dark:text-amber-500">{value.note}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeading({ title, sub, reveal }: { title: string; sub: string; reveal: number }) {
  return (
    <div data-reveal={String(reveal)}>
      <div className="text-sm font-semibold uppercase tracking-wide">{title}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

export function SdrManagerReviewContent({
  review,
  brief,
}: {
  review: PerformanceReviewRow;
  brief: ReviewBriefRow | null | undefined;
}) {
  const compiled = review.compiled_metrics as unknown as SdrManagerCompiledMetrics;
  const teamOrder = [
    "team_booked",
    "team_sat",
    "team_sat_rate_pct",
    "team_avg_dials_per_setter_day",
    "team_avg_talk_minutes_per_setter_day",
    "team_avg_booked_per_setter_week",
  ];

  return (
    <div className="space-y-6">
      <div data-reveal="2" className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-xl font-bold tracking-tight">
            {compiled.subject.full_name} — {compiled.window.label}
          </div>
          <div className="text-xs text-muted-foreground">
            Team of {compiled.team.team_size}
            {compiled.window.prior ? ` · compared with ${compiled.window.prior.label}` : ""}
          </div>
        </div>
        {compiled.subject.departments.map((d) => (
          <Badge key={d} variant="outline" className="capitalize text-muted-foreground">
            {d}
          </Badge>
        ))}
      </div>

      {/* PERSONAL — the manager's own delivery */}
      <SectionHeading title="Personal delivery" sub="What the manager did themselves." reveal={3} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard metric="coaching_sessions" value={compiled.personal.coaching_sessions ?? MISSING_METRIC} reveal={4} />
      </div>

      {/* TEAM — the assigned setters' combined performance */}
      <SectionHeading title="Team performance" sub={compiled.team.roster_note} reveal={5} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teamOrder.map((m, i) => (
          <MetricCard key={m} metric={m} value={compiled.team.metrics[m] ?? MISSING_METRIC} reveal={6 + i} />
        ))}
      </div>

      <ReviewNarrativePanel brief={brief} />
    </div>
  );
}
