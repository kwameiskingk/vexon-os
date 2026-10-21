import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanManageGoals } from "@/hooks/useCapability";
import { fetchSetterTargetsMap } from "@/hooks/useSetterTargets";
import { fetchActiveAeUserIds } from "@/lib/aeRoster";
import {
  GOAL_PROGRESS_MIN_DATE,
  attributeToWorkWeek,
  elapsedWorkingDaysInWeek,
  firstOfMonth,
  getWorkWeekRange,
  getWorkingDaysInMonth,
  toISODate,
  workingDaysBetween,
} from "@/lib/workWeek";

type RoleType = "setter" | "ae";
type SetterDepartment = "acquisition" | "fulfilment";
type PaceState = "on" | "amber" | "red";

interface Props {
  roleType: RoleType;
  department?: SetterDepartment;
  userFilter?: string[];
  /**
   * The CEO page's selected period (the same useCEOPeriod window the sibling
   * snapshot tiles receive). When set, the card anchors its month + week on
   * it instead of the current calendar month. Omitted → current month, the
   * pre-existing behaviour.
   */
  periodWindow?: { start: Date; end: Date };
}

interface PersonProgress {
  id: string;
  name: string;
  monthlyTarget: number;
  monthProgress: number;
  weekProgress: number;
  avgDials: number | null;
  avgTalk: number | null;
}

const monthName = (d: Date) =>
  d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const paceColor = (progress: number, expected: number): PaceState => {
  if (expected <= 0) return "on";
  const ratio = progress / expected;
  if (ratio >= 1) return "on";
  if (ratio >= 0.7) return "amber";
  return "red";
};

const paceFillClass = (state: PaceState) => {
  switch (state) {
    case "on":
      return "bg-emerald-500";
    case "amber":
      return "bg-amber-500";
    case "red":
      return "bg-rose-500";
  }
};

const paceHex = (state: PaceState) => {
  switch (state) {
    case "on":
      return "#10b981";
    case "amber":
      return "#f59e0b";
    case "red":
      return "#f43f5e";
  }
};

const normaliseName = (name: string) =>
  name.toLowerCase().replace(/\s+/g, " ").trim();

const nameMatchesFilter = (personName: string, filters: string[]) => {
  if (filters.length === 0) return true;
  const person = normaliseName(personName);
  return filters.some((raw) => {
    let filter = normaliseName(raw);
    if (filter === "will nehra") filter = "william nehra";
    return person === filter || person.includes(filter) || filter.includes(person);
  });
};

// Formatting helpers
const fmtDecimal1 = (n: number) => {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};
const fmtCountShort = (n: number) => {
  const v = Math.round(n);
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(v);
};
const fmtGBPShort = (n: number) => {
  const v = Math.round(n);
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (Math.abs(v) >= 1000) return `£${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `£${v.toLocaleString("en-GB")}`;
};

// ---------- Track bar ----------
function TrackBar({
  progress,
  target,
  state,
  format,
  emptyLabel = "No goal",
}: {
  progress: number;
  target: number;
  state: PaceState;
  format: (n: number) => string;
  emptyLabel?: string;
}) {
  const hasGoal = target > 0;
  const pct = hasGoal ? Math.min(100, (progress / target) * 100) : 0;
  return (
    <div className="relative h-5 w-full rounded-full border border-border/60 bg-muted/30 overflow-hidden">
      {hasGoal && (
        <div
          className={cn("h-full rounded-full transition-all duration-500", paceFillClass(state))}
          style={{ width: `${pct}%` }}
        />
      )}
      <div className="absolute inset-y-0 right-1.5 flex items-center pointer-events-none">
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums px-1.5 py-[1px] rounded-md",
            "bg-background/75 backdrop-blur-sm",
            hasGoal ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {hasGoal ? `${format(progress)} / ${format(target)}` : emptyLabel}
        </span>
      </div>
    </div>
  );
}

// ---------- Cash stack (setters, month) ----------
function CashStack({ pct, state }: { pct: number; state: PaceState }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const litCoins = Math.max(1, Math.ceil((clamped / 100) * 5));
  return (
    <svg viewBox="0 0 48 48" className="h-9 w-9" aria-hidden="true">
      {[
        { x: 10, y: 34, w: 26 },
        { x: 14, y: 28, w: 24 },
        { x: 9, y: 22, w: 27 },
        { x: 15, y: 16, w: 22 },
        { x: 19, y: 10, w: 18 },
      ].map((coin, index) => {
        const active = index < litCoins;
        return (
          <g key={coin.y} style={{ transition: "opacity 600ms ease-out" }} opacity={active ? 1 : 0.45}>
            <ellipse
              cx={coin.x + coin.w / 2}
              cy={coin.y}
              rx={coin.w / 2}
              ry="4.2"
              fill={active ? paceHex(state) : "hsl(var(--muted))"}
              stroke="currentColor"
              strokeWidth="1.1"
              className="text-muted-foreground/70"
            />
            <path
              d={`M${coin.x} ${coin.y}v4.5c0 2.4 ${coin.w} 2.4 ${coin.w} 0V${coin.y}`}
              fill={active ? paceHex(state) : "hsl(var(--muted))"}
              stroke="currentColor"
              strokeWidth="1.1"
              className="text-muted-foreground/70"
              opacity="0.9"
            />
          </g>
        );
      })}
      <path d="M8 41h32" stroke="currentColor" strokeWidth="1.2" className="text-muted-foreground/50" strokeLinecap="round" />
    </svg>
  );
}

// ---------- Cash briefcase (AEs, month) ----------
function CashBriefcase({ pct, state }: { pct: number; state: PaceState }) {
  const id = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const clamped = Math.max(0, Math.min(100, pct));
  const cashHeight = 4 + (clamped / 100) * 16;
  return (
    <svg viewBox="0 0 48 48" className="h-9 w-9" aria-hidden="true">
      <defs>
        <clipPath id={`cash-briefcase-window-${id}`}>
          <rect x="10" y="20" width="28" height="16" rx="2" />
        </clipPath>
      </defs>
      <path d="M18 14v-3.5c0-1.4 1.1-2.5 2.5-2.5h7c1.4 0 2.5 1.1 2.5 2.5V14" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-muted-foreground/70" />
      <rect
        x="7"
        y="14"
        width="34"
        height="25"
        rx="4"
        fill="hsl(var(--muted))"
        stroke="currentColor"
        strokeWidth="1.3"
        className="text-muted-foreground/70"
      />
      <g clipPath={`url(#cash-briefcase-window-${id})`}>
        <rect
          x="10"
          y={36 - cashHeight}
          width="28"
          height={cashHeight}
          fill={paceHex(state)}
          style={{ transition: "height 600ms ease-out, y 600ms ease-out" }}
        />
      </g>
      <path d="M8 23h33" stroke="currentColor" strokeWidth="1.1" className="text-muted-foreground/60" />
      <rect x="21" y="21" width="6" height="5" rx="1" fill="hsl(var(--card))" stroke="currentColor" strokeWidth="1" className="text-muted-foreground/70" />
      <path d="M15 31c4-2.2 8-2.2 12 0s8 2.2 12 0" stroke="hsl(var(--card))" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

// ---------- Phone handset (dials input) ----------
function DialPhone({ pct, state }: { pct: number; state: PaceState }) {
  const id = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const clamped = Math.max(0, Math.min(100, pct));
  const fillY = 42 - (clamped / 100) * 32;
  return (
    <svg viewBox="0 0 48 48" className="h-9 w-9" aria-hidden="true">
      <defs>
        <clipPath id={`dial-phone-${id}`}>
          <path d="M12 11c-2 4-1.5 9.5 2 13.5l9.5 9.5c4 3.6 9.5 4.1 13.5 2l4.5-4.5-6.5-6.5-4.5 3.8c-1.8-.4-3.6-1.4-5.2-3l-3.1-3.1c-1.6-1.6-2.6-3.4-3-5.2l3.8-4.5-6.5-6.5L12 11z" />
        </clipPath>
      </defs>
      <path
        d="M12 11c-2 4-1.5 9.5 2 13.5l9.5 9.5c4 3.6 9.5 4.1 13.5 2l4.5-4.5-6.5-6.5-4.5 3.8c-1.8-.4-3.6-1.4-5.2-3l-3.1-3.1c-1.6-1.6-2.6-3.4-3-5.2l3.8-4.5-6.5-6.5L12 11z"
        fill="hsl(var(--muted))"
        stroke="currentColor"
        strokeWidth="1.25"
        className="text-muted-foreground/70"
      />
      <g clipPath={`url(#dial-phone-${id})`}>
        <rect
          x="0"
          y={fillY}
          width="48"
          height="48"
          fill={paceHex(state)}
          style={{ transition: "y 600ms ease-out" }}
        />
      </g>
    </svg>
  );
}

// ---------- Stopwatch (talk time input) ----------
function Stopwatch({ pct, state }: { pct: number; state: PaceState }) {
  const id = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const clamped = Math.max(0, Math.min(100, pct));
  const rotate = (clamped / 100) * 360;
  const prefersReduced =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return (
    <svg viewBox="0 0 48 48" className="h-9 w-9" aria-hidden="true">
      {/* crown */}
      <rect x="21" y="5" width="6" height="4" rx="1" fill="hsl(var(--muted))" stroke="currentColor" strokeWidth="1" className="text-muted-foreground/70" />
      <line x1="20" y1="12" x2="28" y2="12" stroke="currentColor" strokeWidth="1.25" className="text-muted-foreground/70" />
      {/* face */}
      <circle
        cx="24"
        cy="28"
        r="14"
        fill="hsl(var(--muted))"
        stroke="currentColor"
        strokeWidth="1.25"
        className="text-muted-foreground/70"
      />
      {/* pace-tinted dial fill */}
      <circle
        cx="24"
        cy="28"
        r="13"
        fill={paceHex(state)}
        style={{ opacity: 0.12 + (clamped / 100) * 0.35, transition: "opacity 600ms ease-out" }}
      />
      {/* tick marks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x1 = 24 + Math.cos(a) * 11;
        const y1 = 28 + Math.sin(a) * 11;
        const x2 = 24 + Math.cos(a) * 12.5;
        const y2 = 28 + Math.sin(a) * 12.5;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth={i % 3 === 0 ? 1 : 0.6}
            className="text-muted-foreground"
          />
        );
      })}
      {/* sweeping hand */}
      <g
        style={{
          transformOrigin: "24px 28px",
          transform: prefersReduced ? "none" : `rotate(${rotate}deg)`,
          transition: "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <line
          x1="24"
          y1="28"
          x2="24"
          y2="18"
          stroke={paceHex(state)}
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </g>
      <circle cx="24" cy="28" r="1.5" fill={paceHex(state)} />
    </svg>
  );
}

export function GoalProgress({
  roleType,
  department = "acquisition",
  userFilter = [],
  periodWindow,
}: Props) {
  const [mode, setMode] = useState<"outputs" | "inputs">("outputs");
  const [expanded, setExpanded] = useState(true);
  const { has: canManage } = useCanManageGoals();

  const today = useMemo(() => new Date(), []);
  // Anchor for every month/week derivation below. The picker's open-ended
  // presets resolve end-of-window into the future (e.g. This Month → 31st),
  // so clamp to today — a past period anchors on its own end, a current one
  // behaves exactly as before. Goal lookup and cash window both derive from
  // this one value, so they can never point at different periods.
  const anchor = useMemo(
    () => (periodWindow && periodWindow.end < today ? periodWindow.end : today),
    [periodWindow, today],
  );
  const month = firstOfMonth(anchor);
  const monthISO = toISODate(month);
  const workingDaysInMonth = getWorkingDaysInMonth(anchor);
  const week = getWorkWeekRange(anchor);
  const workingDaysInWeek = workingDaysBetween(week.monday, week.friday);
  const elapsedInWeek = elapsedWorkingDaysInWeek(anchor, week);

  const minISO = toISODate(GOAL_PROGRESS_MIN_DATE);
  const weekStartISO = toISODate(
    week.monday < GOAL_PROGRESS_MIN_DATE ? GOAL_PROGRESS_MIN_DATE : week.monday,
  );
  const monthStartISO = toISODate(
    month < GOAL_PROGRESS_MIN_DATE ? GOAL_PROGRESS_MIN_DATE : month,
  );
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const monthEndISO = toISODate(monthEnd);
  const elapsedInMonth = workingDaysBetween(
    month < GOAL_PROGRESS_MIN_DATE ? GOAL_PROGRESS_MIN_DATE : month,
    anchor > monthEnd ? monthEnd : anchor,
    month,
  );
  const selectedNames = useMemo(
    () => (userFilter ?? []).map((n) => n.trim()).filter(Boolean),
    [userFilter],
  );

  const q = useQuery({
    queryKey: ["goal-progress", roleType, department, monthISO, weekStartISO],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: settingsRow } = await (supabase as any)
        .from("goal_settings")
        .select("min_daily_dials, min_daily_talk_minutes")
        .eq("id", 1)
        .maybeSingle();
      const minDials = settingsRow?.min_daily_dials ?? 100;
      const minTalk = settingsRow?.min_daily_talk_minutes ?? 60;

      const metric = roleType === "setter" ? "booked_meetings" : "cash_collected";
      const { data: goalsRows } = await (supabase as any)
        .from("performance_goals")
        .select("user_id, monthly_target")
        .eq("role_type", roleType)
        .eq("metric", metric)
        .eq("month", monthISO);
      const goalByUser = new Map<string, number>();
      (goalsRows ?? []).forEach((g: any) =>
        goalByUser.set(g.user_id, Number(g.monthly_target)),
      );

      if (roleType === "setter") {
        const [peopleRes, setterRolesRes] = await Promise.all([
          supabase
            .from("setters_profiles")
            .select("id, user_id, full_name, email, department, active, is_test_account, close_user_id")
            .eq("department", department)
            .eq("active", true)
            .eq("is_test_account", false)
            .order("full_name"),
          supabase.from("user_roles").select("user_id").eq("role", "setter"),
        ]);
        const setterUserIds = new Set(
          (setterRolesRes.data ?? []).map((r: any) => r.user_id),
        );
        const rows = ((peopleRes.data ?? []) as any[]).filter((p) =>
          setterUserIds.has(p.user_id),
        );
        if (rows.length === 0) return { people: [] as PersonProgress[], minDials, minTalk };

        const setterIds = rows.map((r) => r.id);
        const closeUserIds = rows
          .map((r) => r.close_user_id)
          .filter((v): v is string => !!v);

        // Fallback monthly target when none has been typed for the month:
        // the setter's standing weekly meetings target × 4. An explicit
        // performance_goals row always wins. This is what gives fulfilment
        // setters real targets here without monthly data entry.
        const targetsMap = await fetchSetterTargetsMap(setterIds);

        const { data: monthMeetings } = await supabase
          .from("meetings")
          .select("setter_profile_id, created_at")
          .in("setter_profile_id", setterIds)
          .gte("created_at", `${monthStartISO}T00:00:00`)
          .lte("created_at", `${monthEndISO}T23:59:59`);

        const inputsStartISO = toISODate(
          week.monday < GOAL_PROGRESS_MIN_DATE ? GOAL_PROGRESS_MIN_DATE : week.monday,
        );
        const inputsEnd = new Date(week.friday);
        inputsEnd.setDate(inputsEnd.getDate() + 2);
        const inputsEndISO = toISODate(inputsEnd);

        const { data: closeMetrics } =
          closeUserIds.length > 0
            ? await (supabase as any)
                .from("setter_close_metrics")
                .select("close_user_id, date, dials, talk_time_seconds")
                .in("close_user_id", closeUserIds)
                .gte("date", inputsStartISO)
                .lte("date", inputsEndISO)
            : { data: [] as any[] };

        const people2 = rows.map<PersonProgress>((r) => {
          const goal =
            goalByUser.get(r.id) ??
            (targetsMap.get(String(r.id))?.weekly_meetings_target ?? 0) * 4;
          const monthBooked = (monthMeetings ?? []).filter(
            (m: any) => m.setter_profile_id === r.id,
          ).length;
          const weekBooked = (monthMeetings ?? []).filter((m: any) => {
            if (m.setter_profile_id !== r.id) return false;
            const attributed = attributeToWorkWeek(new Date(m.created_at));
            return attributed >= week.monday && attributed <= week.friday;
          }).length;

          const weekMetrics = r.close_user_id
            ? (closeMetrics ?? []).filter((row: any) => {
                if (row.close_user_id !== r.close_user_id) return false;
                const d = new Date(row.date + "T00:00:00");
                const attributed = attributeToWorkWeek(d);
                return attributed >= week.monday && attributed <= week.friday;
              })
            : [];
          const hasMetrics = weekMetrics.length > 0;
          const totalDials = weekMetrics.reduce(
            (s: number, x: any) => s + Number(x.dials || 0),
            0,
          );
          const totalTalkMin = weekMetrics.reduce(
            (s: number, x: any) => s + Number(x.talk_time_seconds || 0) / 60,
            0,
          );
          const denom = Math.max(1, elapsedInWeek);
          const avgDials = hasMetrics ? totalDials / denom : null;
          const avgTalk = hasMetrics ? totalTalkMin / denom : null;

          return {
            id: r.id,
            name: (r.full_name || r.email || "—").trim(),
            monthlyTarget: goal,
            monthProgress: monthBooked,
            weekProgress: weekBooked,
            avgDials,
            avgTalk,
          };
        });

        return { people: people2, minDials, minTalk };
      }

      // Shared roster: role-holders + acting AEs (Marcus), minus offboarded
      // (the setter branch above is already gated by setters_profiles.active).
      const aeIds = await fetchActiveAeUserIds();
      if (aeIds.length === 0) return { people: [] as PersonProgress[], minDials, minTalk };

      const { data: aeProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", aeIds);
      const rows = ((aeProfiles ?? []) as any[]).sort((a, b) =>
        (a.full_name || "").localeCompare(b.full_name || ""),
      );
      if (rows.length === 0) return { people: [] as PersonProgress[], minDials, minTalk };

      // AE cash source = ae_deal_payments (ae_user_id + paid_on), the same
      // table/keying the AE review's cash_collected tile uses — NOT
      // client_payments, which has never had a row (ruling 2026-08-03).
      const { data: payments } = await (supabase as any)
        .from("ae_deal_payments")
        .select("ae_user_id, amount, paid_on")
        .not("ae_user_id", "is", null)
        .gte("paid_on", monthStartISO)
        .lte("paid_on", monthEndISO);

      const people2 = rows.map<PersonProgress>((r) => {
        const goal = goalByUser.get(r.id) ?? 0;
        const monthCash = (payments ?? [])
          .filter((p: any) => p.ae_user_id === r.id)
          .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
        const weekCash = (payments ?? [])
          .filter((p: any) => {
            if (p.ae_user_id !== r.id) return false;
            const d = new Date((p.paid_on || minISO) + "T00:00:00");
            const attributed = attributeToWorkWeek(d);
            return attributed >= week.monday && attributed <= week.friday;
          })
          .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

        return {
          id: r.id,
          name: (r.full_name || r.email || "—").trim(),
          monthlyTarget: goal,
          monthProgress: monthCash,
          weekProgress: weekCash,
          avgDials: null,
          avgTalk: null,
        };
      });

      return { people: people2, minDials, minTalk };
    },
  });

  const data = q.data;
  const isCash = roleType === "ae";
  const visiblePeople = useMemo(
    () => (data?.people ?? []).filter((p) => nameMatchesFilter(p.name, selectedNames)),
    [data?.people, selectedNames],
  );

  const weeklyTargetFor = (monthlyTarget: number) => {
    if (!monthlyTarget || workingDaysInMonth === 0) return 0;
    return (monthlyTarget / workingDaysInMonth) * workingDaysInWeek;
  };

  const fmtShort = (v: number) => (isCash ? fmtGBPShort(v) : fmtCountShort(v));
  const fmtWeek = (v: number) => {
    if (isCash) return fmtGBPShort(v);
    return Number.isInteger(v) ? String(v) : fmtDecimal1(v);
  };
  const fmtInt = (v: number) => Math.round(v).toLocaleString("en-GB");

  const subheader = `${monthName(month)} · Week of ${week.monday.toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short" },
  )} – ${week.friday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  const monthSubline = isCash ? "collected this month" : "booked this month";

  const MonthIcon = isCash ? CashBriefcase : CashStack;

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-[18px] font-heading font-semibold tracking-tight text-foreground">
            Goal Progress
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{subheader}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {expanded && (
            <div className="inline-flex rounded-full border border-border/60 bg-muted/30 p-0.5 text-[11px] font-medium">
              {(["outputs", "inputs"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={cn(
                    "px-3 py-1 rounded-full transition-colors capitalize",
                    mode === k
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          )}
          {expanded && canManage && (
            <Button asChild size="icon" variant="ghost" className="h-8 w-8">
              <Link to="/admin/ceo/goals" aria-label="Manage goals">
                <Settings2 className="h-4 w-4" />
              </Link>
            </Button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((cur) => !cur)}
            aria-label={expanded ? "Collapse goal progress" : "Expand goal progress"}
            aria-expanded={expanded}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                expanded ? "rotate-0" : "-rotate-90",
              )}
            />
          </button>
        </div>
      </div>

      {!expanded ? null : (
        <>
          <div className="hidden md:grid grid-cols-[minmax(160px,220px)_1fr_1fr] gap-6 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest pb-2 border-b border-border/50 mb-3">
            <span>Name</span>
            <span>{mode === "outputs" ? "This week" : "Dials / day"}</span>
            <span>{mode === "outputs" ? "Month" : "Talk time / day"}</span>
          </div>

          {q.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : !data || data.people.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No {roleType === "setter" ? "setters" : "AEs"} configured yet.
            </p>
          ) : visiblePeople.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No goal progress for the selected user filter.
            </p>
          ) : mode === "outputs" ? (
            <div className="space-y-5">
              {visiblePeople.map((p) => {
                const wTarget = weeklyTargetFor(p.monthlyTarget);
                const expected = wTarget * (elapsedInWeek / Math.max(1, workingDaysInWeek));
                const weekState = paceColor(p.weekProgress, expected);
                const monthExpected =
                  p.monthlyTarget * (elapsedInMonth / Math.max(1, workingDaysInMonth));
                const monthState = paceColor(p.monthProgress, monthExpected);
                const hasGoal = p.monthlyTarget > 0;
                const monthPct = hasGoal
                  ? Math.min(100, (p.monthProgress / p.monthlyTarget) * 100)
                  : 0;
                return (
                  <div
                    key={p.id}
                    className="grid grid-cols-1 md:grid-cols-[minmax(160px,220px)_1fr_1fr] gap-3 md:gap-6 items-center"
                  >
                    <div className="text-sm font-medium text-foreground truncate">
                      {p.name}
                    </div>
                    <div>
                      <TrackBar
                        progress={p.weekProgress}
                        target={wTarget}
                        state={weekState}
                        format={fmtWeek}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <MonthIcon pct={hasGoal ? monthPct : 15} state={hasGoal ? monthState : "amber"} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground tabular-nums leading-tight">
                          {hasGoal
                            ? `${fmtShort(p.monthProgress)} / ${fmtShort(p.monthlyTarget)}`
                            : "— / —"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {hasGoal ? monthSubline : "No goal set"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-5">
              {visiblePeople.map((p) => {
                const dialsPct =
                  p.avgDials == null ? 15 : Math.min(100, (p.avgDials / data.minDials) * 100);
                const talkPct =
                  p.avgTalk == null ? 15 : Math.min(100, (p.avgTalk / data.minTalk) * 100);
                const dialsState =
                  p.avgDials == null ? "amber" : paceColor(p.avgDials, data.minDials);
                const talkState =
                  p.avgTalk == null ? "amber" : paceColor(p.avgTalk, data.minTalk);
                return (
                  <div
                    key={p.id}
                    className="grid grid-cols-1 md:grid-cols-[minmax(160px,220px)_1fr_1fr] gap-3 md:gap-6 items-center"
                  >
                    <div className="text-sm font-medium text-foreground truncate">
                      {p.name}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <TrackBar
                          progress={p.avgDials ?? 0}
                          target={p.avgDials == null ? 0 : data.minDials}
                          state={dialsState}
                          format={fmtInt}
                          emptyLabel="No data"
                        />
                      </div>
                      <DialPhone pct={dialsPct} state={dialsState} />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <TrackBar
                          progress={p.avgTalk ?? 0}
                          target={p.avgTalk == null ? 0 : data.minTalk}
                          state={talkState}
                          format={fmtInt}
                          emptyLabel="No data"
                        />
                      </div>
                      <Stopwatch pct={talkPct} state={talkState} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> On pace
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Behind (70–99%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> Well behind (&lt;70%)
            </span>
          </div>
        </>
      )}
    </section>
  );
}
