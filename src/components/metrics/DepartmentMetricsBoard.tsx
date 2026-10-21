// The setter metrics board shared by CSM Command → Metrics (fulfilment) and
// Ops Command → Metrics (acquisition + fulfilment, since 11 Sep: Elena is
// taking over the daily entry for both departments and wanted the same
// surface Daniel has, not the one-setter-at-a-time carousel).
//
// Two modes, exactly as the CSM tab worked before it was generalised:
//   view  — the previous business day at a glance: a team-totals row and a
//           card per setter, in Marcus's metric order (8 Sep). One section
//           per department when the board covers more than one.
//   input — the gear: conversations, warm leads and new meetings booked per
//           setter for a chosen day, written to manual_daily_metrics with
//           the department of the setter being entered. A department switch
//           appears when the board covers more than one.
//
// Sources are the same everywhere in the app: setter_close_metrics for
// dials / talk time / connects (Close sync), manual_daily_metrics for the
// typed figures, meetings and warm_leads for the app-logged fallbacks on
// days without an entry (the aggregateSetterActivity merge the Morning
// Meeting uses). Team connect rate is Σconnects ÷ Σdials, never an average
// of averages.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays } from "date-fns";
import {
  CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, MessageCircle, Flame, Users, CheckCircle,
  AlertTriangle, AlertCircle, Zap, Settings, Phone, Clock, ArrowLeft, CalendarCheck, Percent,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { saveMetric } from "@/components/ops-assistant/metricHelpers";
import { DuplicateMetricModal } from "@/components/ops-assistant/DuplicateMetricModal";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ManualMetric = Database["public"]["Tables"]["manual_daily_metrics"]["Row"];
export type MetricsDepartment = "acquisition" | "fulfilment";

export const DEPARTMENT_LABELS: Record<MetricsDepartment, string> = {
  acquisition: "Acquisition",
  fulfilment: "Fulfilment",
};

export interface DepartmentMetricsBoardProps {
  /** Which departments the board covers, in display order. */
  departments: MetricsDepartment[];
  /** Page header in view mode. */
  title: string;
  subtitle: string;
  /** Page header in input mode (the gear). */
  inputTitle?: string;
  /** Rendered above the board in view mode (e.g. the simulations card on Ops Command). */
  above?: React.ReactNode;
}

interface SetterProfile {
  id: string;
  user_id: string | null;
  full_name: string | null;
  email: string | null;
  department: string | null;
  close_user_id?: string | null;
}

// Weekend-aware "previous day": on a Monday the last working day is Friday.
const previousBusinessDay = (from: Date): Date => {
  let d = subDays(from, 1);
  while (d.getDay() === 0 || d.getDay() === 6) d = subDays(d, 1);
  return d;
};
const nextBusinessDay = (from: Date): Date => {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
};

const fmtTalk = (seconds: number | null | undefined): string => {
  if (seconds == null) return "—";
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
};
const fmtPct = (v: number | null | undefined): string => (v == null ? "—" : `${v.toFixed(1)}%`);
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

/** Active, non-test setters of the given departments who actually hold the setter role. */
function useDepartmentSetters(departments: MetricsDepartment[]) {
  return useQuery({
    queryKey: ["department-metrics-setters", departments.join(",")],
    queryFn: async (): Promise<SetterProfile[]> => {
      const { data: profiles } = await supabase
        .from("setters_profiles")
        .select("id, user_id, full_name, email, department, close_user_id")
        .eq("active", true)
        .eq("is_test_account", false)
        .in("department", departments);
      const list = (profiles || []) as SetterProfile[];
      const userIds = list.map((s) => s.user_id).filter(Boolean) as string[];
      if (userIds.length === 0) return list;
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", userIds);
      // Only people whose role is 'setter' — CSM, ops, dev, sdr_manager and
      // AE accounts also carry a profile row in a department.
      const setterUserIds = new Set((roles || []).filter((r) => r.role === "setter").map((r) => r.user_id));
      return list
        .filter((s) => s.user_id && setterUserIds.has(s.user_id))
        .sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""));
    },
  });
}

export function DepartmentMetricsBoard({ departments, title, subtitle, inputTitle, above }: DepartmentMetricsBoardProps) {
  const [mode, setMode] = useState<"view" | "input">("view");
  const { data: setters = [], isLoading: settersLoading } = useDepartmentSetters(departments);

  if (mode === "view") {
    return (
      <MetricsDayView
        departments={departments}
        setters={setters}
        settersLoading={settersLoading}
        title={title}
        subtitle={subtitle}
        above={above}
        onOpenInput={() => setMode("input")}
      />
    );
  }
  return (
    <MetricsInput
      departments={departments}
      setters={setters}
      settersLoading={settersLoading}
      title={inputTitle ?? `${departments.map((d) => DEPARTMENT_LABELS[d]).join(" & ")} metrics`}
      onDone={() => setMode("view")}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* View mode                                                               */
/* ────────────────────────────────────────────────────────────────────── */

// Order is Marcus's (8 Sep 2026): dials, talk time, meetings booked,
// connect rate, convos, warm leads.
const VIEW_METRICS = [
  { key: "dials", label: "Dials", icon: Phone, accent: "text-violet-600 dark:text-violet-300", chip: "bg-violet-500/10 ring-violet-500/25 dark:bg-violet-500/15 dark:ring-violet-400/30" },
  { key: "talk", label: "Talk time", icon: Clock, accent: "text-sky-600 dark:text-sky-300", chip: "bg-sky-500/10 ring-sky-500/25 dark:bg-sky-500/15 dark:ring-sky-400/30" },
  { key: "meetings", label: "Meetings booked", icon: CalendarCheck, accent: "text-fuchsia-600 dark:text-fuchsia-300", chip: "bg-fuchsia-500/10 ring-fuchsia-500/25 dark:bg-fuchsia-500/15 dark:ring-fuchsia-400/30" },
  { key: "connect", label: "Connect rate", icon: Percent, accent: "text-teal-600 dark:text-teal-300", chip: "bg-teal-500/10 ring-teal-500/25 dark:bg-teal-500/15 dark:ring-teal-400/30" },
  { key: "convos", label: "Convos", icon: MessageCircle, accent: "text-emerald-600 dark:text-emerald-300", chip: "bg-emerald-500/10 ring-emerald-500/25 dark:bg-emerald-500/15 dark:ring-emerald-400/30" },
  { key: "warm", label: "Warm leads", icon: Flame, accent: "text-amber-600 dark:text-amber-300", chip: "bg-amber-500/10 ring-amber-500/25 dark:bg-amber-500/15 dark:ring-amber-400/30" },
] as const;
type MetricKey = (typeof VIEW_METRICS)[number]["key"];

interface SetterDayRow {
  setter: SetterProfile;
  dials: number | null;
  talkSeconds: number | null;
  connects: number | null;
  connectRate: number | null;
  meetings: number | null;
  convos: number | null;
  warm: number | null;
}

function MetricsDayView({
  departments, setters, settersLoading, title, subtitle, above, onOpenInput,
}: {
  departments: MetricsDepartment[];
  setters: SetterProfile[];
  settersLoading: boolean;
  title: string;
  subtitle: string;
  above?: React.ReactNode;
  onOpenInput: () => void;
}) {
  const [viewDate, setViewDate] = useState<Date>(() => previousBusinessDay(new Date()));
  const viewDateStr = format(viewDate, "yyyy-MM-dd");
  const latestDay = previousBusinessDay(new Date());
  const atLatest = viewDateStr >= format(latestDay, "yyyy-MM-dd");

  const setterUserIds = setters.map((s) => s.user_id).filter(Boolean) as string[];
  const setterProfileIds = setters.map((s) => s.id);
  const closeUserIds = setters.map((s) => s.close_user_id).filter(Boolean) as string[];

  const { data: manualRows = [], isLoading: manualLoading } = useQuery({
    queryKey: ["dept-metrics-view-manual", viewDateStr, departments.join(","), setterUserIds.join(",")],
    enabled: setterUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("manual_daily_metrics")
        .select("target_user_id, department, conversations, warm_leads, meetings_booked_input")
        .eq("target_role", "setter")
        .in("department", departments)
        .eq("date", viewDateStr)
        .in("target_user_id", setterUserIds);
      return data || [];
    },
  });

  const { data: closeRows = [], isLoading: closeLoading } = useQuery({
    queryKey: ["dept-metrics-view-close", viewDateStr, closeUserIds.join(",")],
    enabled: closeUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("setter_close_metrics")
        .select("close_user_id, dials, talk_time_seconds, connects, connect_rate")
        .eq("date", viewDateStr)
        .in("close_user_id", closeUserIds);
      return data || [];
    },
  });

  // App-logged meetings booked on the day — the SSOT predicate (created_at
  // window, strict is_rebook=false, owner = setter_profile_id OR
  // logged_by_setter_id): the fallback for days with no typed figure.
  const { data: appMeetingRows = [], isLoading: meetingsLoading } = useQuery({
    queryKey: ["dept-metrics-view-meetings", viewDateStr, setterProfileIds.join(",")],
    enabled: setterProfileIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("meetings")
        .select("setter_profile_id, logged_by_setter_id")
        .eq("is_rebook", false)
        .gte("created_at", `${viewDateStr}T00:00:00`)
        .lte("created_at", `${viewDateStr}T23:59:59`)
        .or(`setter_profile_id.in.(${setterProfileIds.join(",")}),logged_by_setter_id.in.(${setterUserIds.join(",")})`);
      return data || [];
    },
  });

  // App-logged warm leads on the day (acquisition setters log these
  // themselves): the fallback for days with no typed figure.
  const { data: appWarmRows = [], isLoading: warmLoading } = useQuery({
    queryKey: ["dept-metrics-view-warm", viewDateStr, setterUserIds.join(",")],
    enabled: setterUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("warm_leads")
        .select("created_by_user_id, assigned_setter_id")
        .gte("created_at", `${viewDateStr}T00:00:00`)
        .lte("created_at", `${viewDateStr}T23:59:59`)
        .or(`created_by_user_id.in.(${setterUserIds.join(",")}),assigned_setter_id.in.(${setterUserIds.join(",")})`);
      return data || [];
    },
  });

  const loading = settersLoading || manualLoading || closeLoading || meetingsLoading || warmLoading;

  const rows: SetterDayRow[] = useMemo(
    () =>
      setters.map((s) => {
        const manual = manualRows.find((m) => m.target_user_id === s.user_id);
        const close = s.close_user_id ? closeRows.find((c) => c.close_user_id === s.close_user_id) : undefined;
        const appMeetings = appMeetingRows.filter(
          (m) => m.setter_profile_id === s.id || (s.user_id && m.logged_by_setter_id === s.user_id),
        ).length;
        const appWarm = appWarmRows.filter(
          (w) => s.user_id && (w.created_by_user_id === s.user_id || w.assigned_setter_id === s.user_id),
        ).length;
        return {
          setter: s,
          dials: close?.dials ?? null,
          talkSeconds: close?.talk_time_seconds ?? null,
          connects: close?.connects ?? null,
          connectRate: close?.connect_rate != null ? Number(close.connect_rate) : null,
          // Typed figure wins the day; app-logged rows fill days without one.
          meetings: manual?.meetings_booked_input ?? (appMeetings > 0 || close ? appMeetings : null),
          convos: manual?.conversations ?? null,
          warm: manual?.warm_leads ?? (appWarm > 0 ? appWarm : null),
        };
      }),
    [setters, manualRows, closeRows, appMeetingRows, appWarmRows],
  );

  const dayLabel = atLatest ? "Previous day" : format(viewDate, "EEEE");
  const multi = departments.length > 1;

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <div className="flex items-start justify-between gap-3">
          <PageHeader title={title} subtitle={subtitle} />
          <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={onOpenInput} aria-label="Enter metrics" title="Enter metrics">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Enter metrics</span>
          </Button>
        </div>

        {above && <div className="mb-6">{above}</div>}

        {/* Day navigation */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" size="icon" onClick={() => setViewDate((d) => previousBusinessDay(d))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[220px] text-center">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">{dayLabel}</p>
            <p className="text-sm font-medium">{format(viewDate, "EEEE, MMM d, yyyy")}</p>
          </div>
          <Button variant="outline" size="icon" disabled={atLatest} onClick={() => setViewDate((d) => nextBusinessDay(d))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-10">
          {departments.map((dept) => {
            const deptRows = rows.filter((r) => r.setter.department === dept);
            return (
              <DepartmentSection
                key={dept}
                department={dept}
                showHeading={multi}
                rows={deptRows}
                loading={loading}
                viewDate={viewDate}
              />
            );
          })}
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}

function DepartmentSection({ department, showHeading, rows, loading, viewDate }: {
  department: MetricsDepartment;
  showHeading: boolean;
  rows: SetterDayRow[];
  loading: boolean;
  viewDate: Date;
}) {
  const sum = (vals: (number | null)[]) =>
    vals.some((v) => v != null) ? vals.reduce((a: number, v) => a + (v || 0), 0) : null;
  const totals = {
    dials: sum(rows.map((r) => r.dials)),
    talkSeconds: sum(rows.map((r) => r.talkSeconds)),
    connects: sum(rows.map((r) => r.connects)),
    meetings: sum(rows.map((r) => r.meetings)),
    convos: sum(rows.map((r) => r.convos)),
    warm: sum(rows.map((r) => r.warm)),
  };
  const teamConnectRate =
    totals.dials != null && totals.dials > 0 && totals.connects != null ? (totals.connects / totals.dials) * 100 : null;
  const totalDisplay: Record<MetricKey, string> = {
    dials: totals.dials?.toLocaleString() ?? "—",
    talk: fmtTalk(totals.talkSeconds),
    meetings: totals.meetings?.toLocaleString() ?? "—",
    connect: fmtPct(teamConnectRate),
    convos: totals.convos?.toLocaleString() ?? "—",
    warm: totals.warm?.toLocaleString() ?? "—",
  };

  return (
    <section>
      {showHeading && (
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-heading font-semibold tracking-tight">{DEPARTMENT_LABELS[department]}</h2>
          <span className="text-xs text-muted-foreground">
            {loading ? "" : `${rows.length} setter${rows.length === 1 ? "" : "s"}`}
          </span>
        </div>
      )}

      {/* Team totals — the marquee row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {VIEW_METRICS.map((m) => (
          <div key={m.key} className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm dark:border-white/10 dark:bg-[#0f0f11]">
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-violet-400/15 blur-3xl dark:bg-violet-600/20" />
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-violet-500/80 via-fuchsia-400/40 to-transparent" />
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md ring-1", m.chip)}>
                  <m.icon className={cn("h-3.5 w-3.5", m.accent)} />
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground dark:text-white/50">{m.label}</span>
              </div>
              {loading ? (
                <Skeleton className="h-8 w-20 dark:bg-white/10" />
              ) : (
                <p className="text-[28px] leading-none font-bold tabular-nums text-foreground dark:text-white">{totalDisplay[m.key]}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Per-setter deck */}
      {loading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No {DEPARTMENT_LABELS[department].toLowerCase()} setters found.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map(({ setter, dials, talkSeconds, meetings, connectRate, convos, warm }) => {
            const name = setter.full_name || setter.email || "Unknown";
            const values: Record<MetricKey, string> = {
              dials: dials?.toLocaleString() ?? "—",
              talk: fmtTalk(talkSeconds),
              meetings: meetings?.toLocaleString() ?? "—",
              connect: fmtPct(connectRate),
              convos: convos?.toLocaleString() ?? "—",
              warm: warm?.toLocaleString() ?? "—",
            };
            const empty = dials == null && talkSeconds == null && meetings == null && connectRate == null && convos == null && warm == null;
            return (
              <div key={setter.id} className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm p-5 dark:border-white/10 dark:bg-[#0f0f11]">
                <div className="pointer-events-none absolute -bottom-14 -left-10 h-36 w-36 rounded-full bg-fuchsia-400/10 blur-3xl dark:bg-fuchsia-600/10" />
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-violet-500/80 via-fuchsia-400/40 to-transparent" />
                <div className="flex items-center gap-3 mb-4">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[12px] font-bold text-white ring-2 ring-violet-200 dark:ring-white/10">
                    {initials(name)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground dark:text-white truncate">{name}</p>
                    <p className="text-[10.5px] text-muted-foreground dark:text-white/40">
                      {empty ? "No metrics yet for this day" : format(viewDate, "EEE d MMM")}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {VIEW_METRICS.map((m) => (
                    <div key={m.key} className="rounded-xl bg-muted/50 ring-1 ring-border/60 px-2 py-2.5 text-center dark:bg-white/[0.04] dark:ring-white/[0.06]">
                      <m.icon className={cn("h-3.5 w-3.5 mx-auto mb-1.5", m.accent)} />
                      <p className="text-[17px] leading-none font-bold tabular-nums text-foreground dark:text-white">{values[m.key]}</p>
                      <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-muted-foreground dark:text-white/40">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Input mode (the gear)                                                   */
/* ────────────────────────────────────────────────────────────────────── */

function MetricsInput({ departments, setters, settersLoading, title, onDone }: {
  departments: MetricsDepartment[];
  setters: SetterProfile[];
  settersLoading: boolean;
  title: string;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [department, setDepartment] = useState<MetricsDepartment>(departments[0]);
  const [selectedDate, setSelectedDate] = useState<Date>(subDays(new Date(), 1));
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const [duplicateModal, setDuplicateModal] = useState<{ open: boolean; userName: string; date: string; onConfirm: () => void }>({
    open: false, userName: "", date: "", onConfirm: () => {},
  });

  const { data: existingMetrics = [], isLoading: metricsLoading } = useQuery({
    queryKey: ["dept-metrics-input", dateStr],
    queryFn: async () => {
      const { data } = await supabase.from("manual_daily_metrics").select("*").eq("date", dateStr);
      return (data || []) as ManualMetric[];
    },
  });

  const deptSetters = setters.filter((s) => s.department === department);
  const deptUserIds = new Set(deptSetters.map((s) => s.user_id).filter(Boolean));
  const deptMetrics = existingMetrics.filter((m) => deptUserIds.has(m.target_user_id) && m.target_role === "setter");

  const navigateDay = (dir: number) => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir);
      return d;
    });
  };
  const refreshMetrics = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dept-metrics-input", dateStr] });
    queryClient.invalidateQueries({ queryKey: ["dept-metrics-view-manual"] });
  }, [queryClient, dateStr]);

  const isLoading = settersLoading || metricsLoading;
  const submittedCount = deptMetrics.length;
  const totalConvos = deptMetrics.reduce((s, m) => s + (m.conversations || 0), 0);
  const totalWarm = deptMetrics.reduce((s, m) => s + (m.warm_leads || 0), 0);
  const totalMeetings = deptMetrics.reduce((s, m) => s + (m.meetings_booked_input || 0), 0);

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <div className="flex items-start justify-between gap-3">
          <PageHeader
            title={title}
            subtitle="Enter conversations, warm leads & meetings — dials and talk time sync automatically from Close every 5 min"
          />
          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={onDone}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Done
          </Button>
        </div>

        {departments.length > 1 && (
          <div className="inline-flex rounded-lg border bg-muted/40 p-1 mb-5" role="tablist" aria-label="Department">
            {departments.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={department === d}
                onClick={() => setDepartment(d)}
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                  department === d ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {DEPARTMENT_LABELS[d]}
              </button>
            ))}
          </div>
        )}

        {/* Date Navigation */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" size="icon" onClick={() => navigateDay(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[200px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, "EEEE, MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} disabled={(d) => d > new Date()} initialFocus />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={() => navigateDay(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-4">
          <Zap className="h-3 w-3 text-primary" />
          Dials & talk time auto-sync from Close — no manual entry needed.
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <SummaryCard icon={Users} label="Submitted" value={isLoading ? null : `${submittedCount}/${deptSetters.length}`} />
          <SummaryCard icon={MessageCircle} label="Total Convos" value={isLoading ? null : totalConvos.toLocaleString()} />
          <SummaryCard icon={Flame} label="Total Warm Leads" value={isLoading ? null : totalWarm.toLocaleString()} />
          <SummaryCard icon={TrendingUp} label="Meetings Booked" value={isLoading ? null : totalMeetings.toString()} />
        </div>

        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          ) : deptSetters.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No {DEPARTMENT_LABELS[department].toLowerCase()} setters found.</p>
          ) : (
            deptSetters.map((setter) => (
              <SetterInputCard
                key={setter.id}
                setter={setter}
                department={department}
                date={dateStr}
                existingMetrics={existingMetrics}
                currentUserId={user?.id || ""}
                onSaved={refreshMetrics}
                onDuplicate={setDuplicateModal}
              />
            ))
          )}
        </div>

        <DuplicateMetricModal
          open={duplicateModal.open}
          userName={duplicateModal.userName}
          date={duplicateModal.date}
          onConfirm={() => {
            duplicateModal.onConfirm();
            setDuplicateModal((p) => ({ ...p, open: false }));
          }}
          onCancel={() => setDuplicateModal((p) => ({ ...p, open: false }))}
        />
      </PageContainer>
    </DashboardLayout>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4 text-primary" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        {value === null ? <Skeleton className="h-6 w-16" /> : <p className="text-lg font-bold">{value}</p>}
      </CardContent>
    </Card>
  );
}

interface SetterFields {
  conversations: string;
  warm_leads: string;
  meetings_booked_input: string;
}

function SetterInputCard({ setter, department, date, existingMetrics, currentUserId, onSaved, onDuplicate }: {
  setter: SetterProfile;
  department: MetricsDepartment;
  date: string;
  existingMetrics: ManualMetric[];
  currentUserId: string;
  onSaved: () => void;
  onDuplicate: (state: { open: boolean; userName: string; date: string; onConfirm: () => void }) => void;
}) {
  const existing = existingMetrics.find((m) => m.target_user_id === setter.user_id && m.target_role === "setter");
  const isComplete = !!existing;

  const [fields, setFields] = useState<SetterFields>({ conversations: "", warm_leads: "", meetings_booked_input: "" });
  const [discrepancyAck, setDiscrepancyAck] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setFields({
        conversations: existing.conversations?.toString() || "",
        warm_leads: existing.warm_leads?.toString() || "",
        meetings_booked_input: existing.meetings_booked_input?.toString() || "",
      });
    } else {
      setFields({ conversations: "", warm_leads: "", meetings_booked_input: "" });
    }
  }, [existing]);

  // App-logged meetings for the cross-check, on the SSOT predicate.
  const { data: appMeetings = 0 } = useQuery({
    queryKey: ["dept-metrics-app-meetings", setter.id, setter.user_id, date],
    queryFn: async () => {
      const { count } = await supabase
        .from("meetings")
        .select("id", { count: "exact", head: true })
        .or(`setter_profile_id.eq.${setter.id},logged_by_setter_id.eq.${setter.user_id}`)
        .gte("created_at", `${date}T00:00:00`)
        .lte("created_at", `${date}T23:59:59`)
        .eq("is_rebook", false);
      return count || 0;
    },
    enabled: !!setter.user_id,
  });

  const inputMeetings = parseInt(fields.meetings_booked_input) || 0;
  const mismatchType = inputMeetings > appMeetings ? "input_higher" : inputMeetings < appMeetings ? "app_higher" : "none";
  const hasRedMismatch = mismatchType === "app_higher" && fields.meetings_booked_input !== "";

  const handleSave = async () => {
    if (hasRedMismatch && !discrepancyAck) {
      toast.error("Please acknowledge the discrepancy before submitting");
      return;
    }
    setSaving(true);
    await saveMetric({
      date,
      targetUserId: setter.user_id!,
      targetRole: "setter",
      department,
      enteredBy: currentUserId,
      fields: {
        conversations: parseInt(fields.conversations) || null,
        warm_leads: parseInt(fields.warm_leads) || null,
        meetings_booked_input: inputMeetings || null,
        meetings_booked_app: appMeetings,
        mismatch_flag: mismatchType as ManualMetric["mismatch_flag"],
        mismatch_notified: false,
      },
      existingMetrics,
      userName: setter.full_name || setter.email || "Unknown",
      onDuplicate,
      onSaved,
    });
    setSaving(false);
  };

  return (
    <Card className={isComplete ? "border-green-500/30" : ""}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">{setter.full_name || setter.email}</span>
            {isComplete && (
              <Badge variant="secondary" className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" /> Complete
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <Label className="text-xs text-muted-foreground">Conversations</Label>
            <Input type="number" min="0" value={fields.conversations} onChange={(e) => setFields({ ...fields, conversations: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Warm Leads</Label>
            <Input type="number" min="0" value={fields.warm_leads} onChange={(e) => setFields({ ...fields, warm_leads: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label className="text-xs text-muted-foreground">New Meetings Booked</Label>
            <Input
              type="number"
              min="0"
              value={fields.meetings_booked_input}
              onChange={(e) => { setFields({ ...fields, meetings_booked_input: e.target.value }); setDiscrepancyAck(false); }}
              className={mismatchType === "input_higher" ? "border-amber-500" : mismatchType === "app_higher" ? "border-red-500" : fields.meetings_booked_input && mismatchType === "none" ? "border-green-500" : ""}
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground mb-2">
          App-logged: <strong>{appMeetings}</strong> meetings
          {fields.meetings_booked_input !== "" && mismatchType === "none" && <CheckCircle className="inline h-3.5 w-3.5 text-green-500 ml-1.5" />}
        </div>

        {mismatchType === "input_higher" && fields.meetings_booked_input !== "" && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs">Input is higher than app-logged meetings. The setter may have outstanding logs.</p>
          </div>
        )}

        {mismatchType === "app_higher" && fields.meetings_booked_input !== "" && (
          <div className="space-y-2 mb-3">
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs">App shows more meetings than input. Please cross-reference before submitting.</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id={`ack-${setter.id}`} checked={discrepancyAck} onCheckedChange={(c) => setDiscrepancyAck(!!c)} />
              <label htmlFor={`ack-${setter.id}`} className="text-xs text-muted-foreground cursor-pointer">
                I have reviewed this discrepancy and am submitting anyway
              </label>
            </div>
          </div>
        )}

        <Button className="w-full" onClick={handleSave} disabled={saving || (hasRedMismatch && !discrepancyAck)}>
          {saving ? "Saving..." : isComplete ? "Update" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
