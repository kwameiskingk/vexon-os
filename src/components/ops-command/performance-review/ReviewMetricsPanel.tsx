import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Divide,
  Flame,
  MessageSquare,
  Phone,
  PhoneCall,
  Sofa,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import type { DayHighlight } from "@/lib/metrics/setterMetrics";
import type { CompiledMetricValue, CompiledMetrics } from "@/hooks/useSetterReview";

/**
 * Deterministic numbers panel. Renders ONLY figures already compiled into
 * the review row — it never computes a metric itself. Modules render only
 * when present in compiled_metrics (no empty tiles). Show rate is shown
 * uncapped (>100% is legitimate: sat can include prior-period bookings).
 * Delta badges only exist on single-month reviews.
 */

const fmtMinutes = (v: number): string => {
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const fmtValue = (key: string, v: number | null): string => {
  if (v == null) return "—";
  if (key.includes("talk_time")) return fmtMinutes(v);
  if (key.endsWith("_pct")) return `${v.toFixed(1)}%`;
  return Math.round(v) === v ? v.toLocaleString() : v.toFixed(1);
};

const fmtHighlightDate = (h: DayHighlight): string => {
  const d = new Date(`${h.date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return h.half_day ? `${d} (half day)` : d;
};

const highlightFigures = (h: DayHighlight): string =>
  `${h.meetings_booked} ${h.meetings_booked === 1 ? "meeting" : "meetings"} booked · ${h.dials.toLocaleString()} dials · ${h.conversations.toLocaleString()} convos`;

interface TileMeta {
  key: string;
  label: string;
  icon: typeof Phone;
}

const TOTALS_META: TileMeta[] = [
  { key: "dials", label: "Total Dials", icon: Phone },
  { key: "talk_time_minutes", label: "Total Talk Time", icon: Clock },
  { key: "conversations", label: "Total Convos", icon: MessageSquare },
  { key: "connects_3_plus_min", label: "Connects 3+ Min", icon: PhoneCall },
  { key: "meetings_booked", label: "Meetings Booked", icon: Calendar },
  { key: "meetings_sat", label: "Meetings Sat", icon: Sofa },
  { key: "warm_leads", label: "Warm Leads", icon: Flame },
];

const DAILY_META: TileMeta[] = [
  { key: "dials", label: "Daily Dials", icon: Phone },
  { key: "talk_time_minutes", label: "Daily Talk Time", icon: Clock },
  { key: "conversations", label: "Daily Convos", icon: MessageSquare },
];

function DeltaBadge({ delta, show }: { delta: number | null; show: boolean }) {
  if (!show) return null;
  if (delta == null) {
    return <Badge variant="outline" className="text-muted-foreground">no prior</Badge>;
  }
  const up = delta > 0;
  const down = delta < 0;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium",
        up && "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
        down && "bg-red-500/15 text-red-600 border-red-500/30",
        !up && !down && "bg-muted text-muted-foreground border-border",
      )}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : down ? <TrendingDown className="h-3 w-3" /> : null}
      {up ? "+" : ""}
      {delta.toFixed(1)}%
    </Badge>
  );
}

function TargetBar({ metric }: { metric: CompiledMetricValue }) {
  if (metric.target == null || metric.target <= 0 || metric.value == null) return null;
  const pct = (metric.value / metric.target) * 100;
  const state = pct >= 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        {/* Bar width capped for layout only — the printed % is uncapped */}
        <div className={cn("h-full rounded-full transition-all", state)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="text-[11px] text-muted-foreground">
        {Math.round(pct)}% of target {metric.target_basis ? `(${metric.target_basis})` : ""}
      </div>
    </div>
  );
}

function MetricTile({
  meta,
  metric,
  priorLabel,
  showDeltas,
  adjusted = false,
}: {
  meta: TileMeta;
  metric: CompiledMetricValue;
  priorLabel?: string;
  showDeltas: boolean;
  /** A manual review adjustment shaped this figure (see window.adjusted). */
  adjusted?: boolean;
}) {
  const Icon = meta.icon;
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            {meta.label}
          </span>
          <span className="flex items-center gap-1.5">
            {adjusted && (
              <Badge
                variant="outline"
                className="h-5 px-1.5 text-[10px] font-medium bg-amber-500/15 text-amber-700 border-amber-500/30"
              >
                Adjusted
              </Badge>
            )}
            <Icon className="h-4 w-4 text-muted-foreground/70" />
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums tracking-tight">
            {fmtValue(meta.key, metric.value)}
          </span>
          {metric.target != null && (
            <span className="text-xs text-muted-foreground">/ {fmtValue(meta.key, metric.target)}</span>
          )}
        </div>
        {showDeltas && (
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <DeltaBadge delta={metric.delta_pct} show />
            {priorLabel && (
              <span className="text-muted-foreground">
                {priorLabel}: {fmtValue(meta.key, metric.prior)}
              </span>
            )}
          </div>
        )}
        <TargetBar metric={metric} />
      </CardContent>
    </Card>
  );
}

export function ReviewMetricsPanel({ compiled }: { compiled: CompiledMetrics }) {
  const { totals, rates, daily, suppositions, highlights, modules, coaching, pip, window } = compiled;
  const showDeltas = window.kind === "month";
  const priorLabel = window.prior?.label;
  const adjustedKeys = new Set<string>(window.adjusted?.metrics ?? []);
  const showRateAdjusted = adjustedKeys.has("meetings_booked") || adjustedKeys.has("meetings_sat");
  const adjustedNote = window.adjusted
    ? `${window.adjusted.metrics
        .map((m) => TOTALS_META.find((t) => t.key === m)?.label.toLowerCase() ?? m)
        .join(", ")} adjusted${window.adjusted.by ? ` by ${window.adjusted.by}` : ""} on ${new Date(
        window.adjusted.at,
      ).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}${
        window.adjusted.reason ? ` · ${window.adjusted.reason}` : ""
      }`
    : null;

  return (
    <div className="space-y-6">
      {/* Days worked — the divisor for every daily average */}
      <Card data-reveal="3" className="border-border/60 bg-muted/20">
        <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="font-semibold tabular-nums">{window.days_worked}</span>
            <span className="text-muted-foreground">days worked (from attendance; half-days count 0.5)</span>
          </span>
          {showDeltas && window.prior && (
            <span className="text-muted-foreground">
              {window.prior.label}: {window.prior.days_worked} days
            </span>
          )}
          {window.days_worked === 0 && (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-700 border-amber-500/30">
              No attendance marked for this window — daily averages show "—"
            </Badge>
          )}
          {adjustedNote && (
            <span className="text-xs text-amber-700 first-letter:uppercase">{adjustedNote}</span>
          )}
        </CardContent>
      </Card>

      {/* Window totals */}
      <div data-reveal="4" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {TOTALS_META.filter(({ key }) => totals[key]).map((meta) => (
          <MetricTile
            key={meta.key}
            meta={meta}
            metric={totals[meta.key]}
            priorLabel={priorLabel}
            showDeltas={showDeltas}
            adjusted={adjustedKeys.has(meta.key)}
          />
        ))}
        {rates?.show_rate_pct != null && (
          <MetricTile
            meta={{ key: "show_rate_pct", label: "Show Rate", icon: CheckCircle2 }}
            metric={rates.show_rate_pct}
            priorLabel={priorLabel}
            showDeltas={showDeltas}
            adjusted={showRateAdjusted}
          />
        )}
        {rates?.connect_rate_pct != null && (
          <MetricTile
            meta={{ key: "connect_rate_pct", label: "Connect Rate", icon: PhoneCall }}
            metric={rates.connect_rate_pct}
            priorLabel={priorLabel}
            showDeltas={showDeltas}
          />
        )}
      </div>

      {/* Daily averages (÷ days worked) */}
      <div data-reveal="5">
        <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Target className="h-4 w-4 text-primary" /> Daily averages
          <span className="text-xs font-normal text-muted-foreground">
            — window total ÷ {window.days_worked || "—"} days worked
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DAILY_META.filter(({ key }) => daily[key]).map((meta) => (
            <MetricTile
              key={meta.key}
              meta={meta}
              metric={daily[meta.key]}
              priorLabel={priorLabel}
              showDeltas={showDeltas}
            />
          ))}
        </div>
      </div>

      {/* Suppositions — coaching ratios. Each stat's value, label, and
          operand breakdown are derived from the SAME key so the pairs can
          never transpose; the printed "a ÷ b" makes any mismatch obvious. */}
      <Card data-reveal="6" className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Divide className="h-4 w-4 text-primary" /> Suppositions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-3">
          {(
            [
              {
                key: "meetings_booked_per_sat",
                label: "Meetings booked per sat",
                numerator: `${fmtValue("n", totals.meetings_booked?.value ?? null)} booked`,
                denominator: `${fmtValue("n", totals.meetings_sat?.value ?? null)} sat`,
              },
              {
                key: "dials_per_booking",
                label: "Dials per booking",
                numerator: `${fmtValue("n", totals.dials?.value ?? null)} dials`,
                denominator: `${fmtValue("n", totals.meetings_booked?.value ?? null)} booked`,
              },
            ] as const
          ).map((s) => {
            const v = suppositions?.[s.key]?.value ?? null;
            return (
              <div key={s.key}>
                <div className="text-2xl font-bold tabular-nums">
                  {v == null ? "—" : v.toFixed(1)}
                </div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-[11px] text-muted-foreground/70 tabular-nums">
                  {s.numerator} ÷ {s.denominator}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Day highlights — deterministic, worked days only. The least-active
          framing is pattern-spotting for a coaching conversation, never a
          verdict; this screen is screenshared to the setter live. */}
      {(highlights?.strongest_day || highlights?.least_active_day) && (
        <div data-reveal="7" data-reveal-beat className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {highlights.strongest_day && (
            <Card className="border-emerald-500/25 bg-emerald-500/[0.04]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-emerald-600" /> Strongest day
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-lg font-bold">
                  {fmtHighlightDate(highlights.strongest_day)}
                </div>
                <div className="text-sm text-muted-foreground tabular-nums">
                  {highlightFigures(highlights.strongest_day)}
                </div>
                <div className="text-xs text-muted-foreground/80">
                  Best output of the period — worth noting what went right that day.
                </div>
              </CardContent>
            </Card>
          )}
          {highlights.least_active_day && (
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Compass className="h-4 w-4 text-primary" /> Least active day
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-lg font-bold">
                  {fmtHighlightDate(highlights.least_active_day)}
                </div>
                <div className="text-sm text-muted-foreground tabular-nums">
                  {highlightFigures(highlights.least_active_day)}
                </div>
                <div className="text-xs text-muted-foreground/80">
                  {highlights.least_active_day.weekday_pattern
                    ? `${highlights.least_active_day.weekday_pattern} — could be worth looking at how those days are structured.`
                    : "A pattern-spotting prompt for the conversation, not a verdict."}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Coaching / PIP context strip */}
      <Card data-reveal="8" className="border-border/60">
        <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{coaching.sessions_in_period}</span>
            <span className="text-muted-foreground">coaching sessions this period</span>
          </span>
          {coaching.last_session_date && (
            <span className="text-muted-foreground">Last session: {coaching.last_session_date}</span>
          )}
          {coaching.current_focus && (
            <span className="text-muted-foreground">Focus: {coaching.current_focus}</span>
          )}
          {pip.active ? (
            <Badge variant="outline" className="bg-red-500/15 text-red-600 border-red-500/30">
              On PIP{pip.start_date ? ` since ${pip.start_date}` : ""}
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      {/* Fulfilment-only modules — rendered only when the data exists */}
      {modules.per_client && modules.per_client.length > 0 && (
        <Card data-reveal="9" className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Per-Client Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium pb-2 border-b border-border/50">
                <div className="col-span-4">Client</div>
                <div className="col-span-2 text-right">Booked</div>
                <div className="col-span-2 text-right">Sat</div>
                <div className="col-span-2 text-right">Assignment</div>
                <div className="col-span-2 text-right">Status</div>
              </div>
              {modules.per_client.map((c) => (
                <div key={c.client} className="grid grid-cols-12 gap-2 py-1.5 text-sm items-center">
                  <div className="col-span-4 truncate font-medium">{c.client}</div>
                  <div className="col-span-2 text-right tabular-nums">{c.booked_in_period}</div>
                  <div className="col-span-2 text-right tabular-nums">{c.sat_in_period}</div>
                  <div className="col-span-2 text-right tabular-nums text-muted-foreground">
                    {c.meetings_completed ?? 0}/{c.meeting_target ?? "—"}
                  </div>
                  <div className="col-span-2 text-right">
                    <Badge variant="outline" className="capitalize text-muted-foreground">
                      {c.assignment_status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {modules.call_qa && (
        <Card data-reveal="9" className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-primary" /> Call QA Scores
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {modules.call_qa.avg_weighted_total ?? "—"}
                <span className="text-sm font-normal text-muted-foreground">/100 avg</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {modules.call_qa.calls_scored} calls scored
                {modules.call_qa.prior.calls_scored > 0 &&
                  ` · prior: ${modules.call_qa.prior.avg_weighted_total ?? "—"}/100 over ${modules.call_qa.prior.calls_scored}`}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Mandatory gates: {modules.call_qa.gates_passed} passed · {modules.call_qa.gates_failed} failed
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {Object.entries(modules.call_qa.rating_counts).map(([rating, n]) => (
                <Badge key={rating} variant="outline" className="capitalize text-muted-foreground">
                  {rating}: {n}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {modules.appointment_scores && (
        <Card data-reveal="9" className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" /> Appointment Scores (CSM-entered)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {modules.appointment_scores.avg_overall_quality ?? "—"}
                <span className="text-sm font-normal text-muted-foreground">/5 avg quality</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {modules.appointment_scores.meetings_scored} meetings scored ·{" "}
                {modules.appointment_scores.quality_meetings} rated quality (4+)
              </div>
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground tabular-nums">
              <span>Fit {modules.appointment_scores.avg_fit ?? "—"}</span>
              <span>Engagement {modules.appointment_scores.avg_engagement ?? "—"}</span>
              <span>Authority {modules.appointment_scores.avg_authority ?? "—"}</span>
              <span>Next step {modules.appointment_scores.avg_next_step ?? "—"}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
