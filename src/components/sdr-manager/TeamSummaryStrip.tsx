// Team summary strip for the SDR-manager landing page (2026-08-06, team-tiles
// session). Replaces the old hardcoded KPI strip with real team-vs-target
// figures for the CURRENT WEEK (Mon–today):
// - Delivery cluster (all managers): booked / sat / dials / talk from the
//   shared fetchWindowNumbers (same implementation as the review engine)
//   vs resolveTargetsForRole(role='sdr_manager') team_* targets. Unseeded
//   targets render the neutral no-target state — never faked.
// - Deals cluster (acquisition managers only): active pipeline by stage
//   (shared lib/aePipeline derivation) + deals closed this week. Reads ride
//   the PR #109 SELECT-only RLS (confirmed resolving for Felix).
// Display model follows the RAG conventions: actual vs FULL period target
// (day-grain targets × elapsed weekdays, PR #62 pattern); pacing lives in
// the state colour only, never a fractional number.
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { StatStrip } from "@/components/ui-v2";
import { fetchManagerTeam, fetchWindowNumbers } from "@/lib/metrics/managerTeamWindow";
import { resolveTargetsForRole, type GenericResolvedTarget } from "@/lib/targets/resolveTargets";
import { fetchAePipelineSnapshot, fetchClosedDealsInWindow } from "@/lib/aePipeline";
import { metricRagState } from "@/lib/targets/ragState";
import { toBoardState, type BoardState } from "@/components/rag/boardPrimitives";

const TEAM_METRICS = ["team_booked", "team_sat", "team_dials", "team_talk_minutes"] as const;

const fmtTalk = (minutes: number) => {
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

const money = (v: number) =>
  v >= 1000 ? `£${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : `£${v.toLocaleString()}`;

/** Weekdays elapsed Mon→today inclusive, clamped to 1..5 (PR #62 pattern). */
const elapsedWeekdays = (weekStartISO: string, todayISO: string): number => {
  let n = 0;
  const d = new Date(`${weekStartISO}T12:00:00`);
  const end = new Date(`${todayISO}T12:00:00`);
  while (d <= end) {
    const day = d.getDay();
    if (day >= 1 && day <= 5) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return Math.min(Math.max(n, 1), 5);
};

/** Full-window target for the week strip: week targets as-is, day targets ×
 *  elapsed weekdays; month-grain targets don't map onto a week window and
 *  deliberately resolve to no-target rather than a made-up scaling. */
const scaleTarget = (rt: GenericResolvedTarget | undefined, weekdays: number): number | null => {
  if (!rt || rt.kind !== "target") return null;
  if (rt.period === "week") return rt.value;
  if (rt.period === "day") return rt.value * weekdays;
  return null;
};

interface Seg {
  label: string;
  value: string;
  target: number | null;
  targetLabel: string | null;
  rawValue: number;
  state: BoardState | null;
  sub?: string;
}

export function TeamSummaryStrip({
  managerUserId,
  department,
}: {
  managerUserId: string;
  department: "fulfilment" | "acquisition";
}) {
  const { user } = useAuth();
  const subjectId = managerUserId || user?.id || "";
  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekdays = elapsedWeekdays(weekStart, today);

  const { data, isLoading } = useQuery({
    queryKey: ["team-summary-strip", subjectId, department, weekStart, today],
    queryFn: async () => {
      // Department-scoped by construction (2026-08-11): roster and every sum
      // are filtered to the department prop, so a dual-department manager's
      // strip never blends acquisition and fulfilment numbers against one
      // department's team_* targets.
      const team = await fetchManagerTeam(subjectId, department);
      const [numbers, targetsBySubject, pipeline, closed] = await Promise.all([
        fetchWindowNumbers(subjectId, team, weekStart, today, department),
        resolveTargetsForRole([subjectId], "sdr_manager", department, today, [...TEAM_METRICS]),
        department === "acquisition" ? fetchAePipelineSnapshot() : Promise.resolve(null),
        department === "acquisition" ? fetchClosedDealsInWindow(weekStart, today) : Promise.resolve(null),
      ]);
      return { numbers, targets: targetsBySubject.get(subjectId) ?? {}, pipeline, closed };
    },
    enabled: !!subjectId,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="mb-6"><Skeleton className="h-[72px] w-full" /></div>
    );
  }

  const { numbers, targets, pipeline, closed } = data;
  const talkMinutes = numbers.totalTalkSeconds / 60;

  const deliverySeg = (label: string, metric: (typeof TEAM_METRICS)[number], rawValue: number, display: string): Seg => {
    const target = scaleTarget(targets[metric], weekdays);
    return {
      label,
      value: display,
      rawValue,
      target,
      targetLabel:
        target == null ? null : metric === "team_talk_minutes" ? fmtTalk(target) : `${Math.round(target)}`,
      state: target != null ? toBoardState(metricRagState(rawValue, target)) : null,
    };
  };

  const segs: Seg[] = [
    deliverySeg("Booked · Wk", "team_booked", numbers.booked, `${numbers.booked}`),
    deliverySeg("Sat · Wk", "team_sat", numbers.sat, `${numbers.sat}`),
    deliverySeg("Dials · Wk", "team_dials", numbers.totalDials, `${numbers.totalDials}`),
    deliverySeg("Talk · Wk", "team_talk_minutes", talkMinutes, fmtTalk(talkMinutes)),
  ];

  const tone = (st: BoardState | null) => st === "crit" ? "text-[var(--bad)]" : st === "watch" ? "text-[var(--warn)]" : st === "steady" ? "text-[var(--ok)]" : "";
  const stats = segs.map((s) => ({
    label: s.label,
    value: s.value,
    caption: s.target != null && s.targetLabel
      ? <span className={tone(s.state)}>target {s.targetLabel}</span>
      : "No target set",
  }));
  if (pipeline) {
    stats.push(
      { label: "Active deals", value: `${pipeline.discoveryCount + pipeline.followUpCount}`, caption: `${pipeline.discoveryCount} discovery · ${pipeline.followUpCount} follow-up` },
      { label: "Closed · wk", value: `${closed?.count ?? 0}`, caption: `${money(closed?.value ?? 0)} collected` },
    );
  }

  return (
    <div className="mb-6">
      <StatStrip stats={stats} />
      <p className="mt-2 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
        This week vs target · Mon {format(new Date(`${weekStart}T12:00:00`), "d MMM")} – today
      </p>
    </div>
  );
}
