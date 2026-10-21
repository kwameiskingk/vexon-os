import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchManagedSetterProfileIds } from "@/lib/managedRoster";
import { useAuth } from "@/contexts/AuthContext";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Search, ChevronDown, TrendingUp, Users, CheckCircle2, AlertCircle, Clock, X, Calendar as CalendarIcon,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, subDays, differenceInDays, eachDayOfInterval, isWeekend } from "date-fns";

type Period = "today" | "7d" | "14d" | "30d" | "custom";
const PERIOD_LABEL: Record<Period, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  custom: "Custom",
};
const periodDays = (p: Period) => (p === "today" ? 1 : p === "7d" ? 7 : p === "14d" ? 14 : p === "30d" ? 30 : 1);

// UK working hour slots that require an hourly update (10:00 .. 17:00 inclusive)
const HOUR_SLOTS = [10, 11, 12, 13, 14, 15, 16, 17];

const pctColor = (pct: number) =>
  pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-destructive";
const pctBg = (pct: number) =>
  pct >= 80 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-destructive";

interface Props {
  scope: "operations" | "sdr_manager";
}

export function HourlyUpdatesComplianceView({ scope }: Props) {
  const { user } = useAuth();
  // Person-level surface: the manager-scope roster unions over every held
  // department.
  const { departments: managerDepartments } = useSdrManagerScope();
  const [period, setPeriod] = useState<Period>("today");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const effectiveRange = useMemo(() => {
    if (period === "custom" && customRange.from && customRange.to) {
      const days = Math.max(1, differenceInDays(customRange.to, customRange.from) + 1);
      return { start: customRange.from, end: customRange.to, days };
    }
    const today = new Date();
    const days = periodDays(period);
    return { start: subDays(today, days - 1), end: today, days };
  }, [period, customRange]);

  // Setters who are REQUIRED to submit hourly updates (PIP or manually enabled)
  const { data: setters = [], isLoading: settersLoading } = useQuery({
    queryKey: ["hourly-compliance-setters", scope, user?.id, managerDepartments.join(",")],
    queryFn: async () => {
      let query = supabase
        .from("setters_profiles")
        .select("id, user_id, full_name, email, department, status, hourly_form_enabled")
        .eq("active", true)
        .eq("is_test_account", false)
        .or("status.eq.pip,hourly_form_enabled.eq.true");

      if (scope === "sdr_manager") {
        if (!user?.id) return [];
        const managedIds = await fetchManagedSetterProfileIds(user.id);
        if (!managedIds.length) return [];
        query = query.in("id", managedIds).in("department", managerDepartments);
      }

      const { data } = await query.order("full_name");
      return data || [];
    },
    enabled: scope === "operations" || !!user?.id,
  });

  const userIds = setters.map((s: any) => s.user_id).filter(Boolean);

  const { data: updates = [], isLoading: updatesLoading } = useQuery({
    queryKey: ["hourly-compliance-updates", userIds.join(","), effectiveRange.start.toISOString(), effectiveRange.end.toISOString()],
    queryFn: async () => {
      if (!userIds.length) return [];
      const start = format(effectiveRange.start, "yyyy-MM-dd");
      const end = format(effectiveRange.end, "yyyy-MM-dd");
      const { data } = await supabase
        .from("hourly_updates")
        .select("user_id, date, hour_slot, dials_count, talk_time, connects_count, support_needed, submitted_at_uk")
        .in("user_id", userIds)
        .gte("date", start)
        .lte("date", end);
      return data || [];
    },
    enabled: userIds.length > 0,
  });

  // Working days in range (Mon–Fri)
  const requiredDays = useMemo(() => {
    return eachDayOfInterval({ start: effectiveRange.start, end: effectiveRange.end })
      .filter((d) => !isWeekend(d))
      .map((d) => format(d, "yyyy-MM-dd"));
  }, [effectiveRange]);

  type DaySlots = { date: string; slots: { hour: number; update: any | null }[] };
  type Row = {
    user_id: string;
    full_name: string;
    email: string;
    department: string | null;
    done: number;
    total: number;
    pct: number;
    byDay: DaySlots[];
  };

  const rows: Row[] = useMemo(() => {
    return setters.map((s: any) => {
      const userUpdates = (updates || []).filter((u: any) => u.user_id === s.user_id);
      const byDay: DaySlots[] = requiredDays.map((d) => ({
        date: d,
        slots: HOUR_SLOTS.map((h) => ({
          hour: h,
          update: userUpdates.find((u: any) => u.date === d && u.hour_slot === h) || null,
        })),
      }));
      const done = byDay.reduce((sum, d) => sum + d.slots.filter((sl) => sl.update).length, 0);
      const total = byDay.length * HOUR_SLOTS.length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return {
        user_id: s.user_id,
        full_name: s.full_name || s.email || "Unknown",
        email: s.email || "",
        department: s.department || null,
        done,
        total,
        pct,
        byDay,
      };
    });
  }, [setters, updates, requiredDays]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.department && set.add(r.department));
    return Array.from(set);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (departmentFilter && r.department !== departmentFilter) return false;
      if (selectedUserIds.size > 0 && !selectedUserIds.has(r.user_id)) return false;
      if (q && !(r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, search, departmentFilter, selectedUserIds]);

  const totalDue = filteredRows.reduce((s, r) => s + r.total, 0);
  const totalDone = filteredRows.reduce((s, r) => s + r.done, 0);
  const overallPct = totalDue ? Math.round((totalDone / totalDue) * 100) : 0;

  const isLoading = settersLoading || updatesLoading;

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Hourly Update Compliance
          </h2>
          <p className="text-xs text-muted-foreground">
            One submission expected per hour, 10:00–17:00 UK on working days, from setters on PIP or with the hourly form manually enabled.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-border/50 p-1">
            {(["today", "7d", "14d", "30d"] as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABEL[p]}
              </Button>
            ))}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={period === "custom" ? "default" : "outline"} size="sm" className="h-9">
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {period === "custom" && customRange.from && customRange.to
                  ? `${format(customRange.from, "MMM d")} – ${format(customRange.to, "MMM d")}`
                  : "Custom dates"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={customRange.from ? { from: customRange.from, to: customRange.to } : undefined}
                onSelect={(range: any) => {
                  setCustomRange({ from: range?.from, to: range?.to });
                  if (range?.from && range?.to) setPeriod("custom");
                }}
                numberOfMonths={2}
                disabled={(date) => date > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />)}
          </div>
          <div className="h-64 rounded-xl bg-muted/40 animate-pulse" />
        </div>
      ) : setters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-12 text-center text-sm text-muted-foreground">
          <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
          No setters are currently required to submit hourly updates.
          <div className="text-[11px] mt-1">Enable per-setter via the Employee Hub, or set status to PIP.</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Overall completion"
              value={`${overallPct}%`}
              accent={pctColor(overallPct)}
              progress={overallPct}
            />
            <SummaryCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Updates submitted"
              value={`${totalDone}`}
              hint={`of ${totalDue} expected`}
            />
            <SummaryCard
              icon={<Users className="h-4 w-4" />}
              label="People tracked"
              value={`${filteredRows.length}`}
              hint={departments.length > 0 ? `across ${departments.length} dept${departments.length !== 1 ? "s" : ""}` : undefined}
            />
          </div>

          {scope === "operations" && departments.length > 1 && (
            <div className="rounded-xl border border-border/50 bg-card/40 p-4">
              <div className="text-xs font-medium text-muted-foreground mb-3">By department · click to filter</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setDepartmentFilter(null)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                    departmentFilter === null
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border/50 hover:border-border"
                  )}
                >
                  All
                </button>
                {departments.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDepartmentFilter(departmentFilter === d ? null : d)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize",
                      departmentFilter === d
                        ? "bg-primary/10 border-primary text-foreground"
                        : "border-border/50 hover:border-border"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="pl-8 h-9"
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  {selectedUserIds.size > 0 ? `${selectedUserIds.size} user${selectedUserIds.size > 1 ? "s" : ""}` : "Filter users"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="end">
                <div className="p-2 border-b border-border/50 flex items-center justify-between">
                  <span className="text-xs font-medium">Select users</span>
                  {selectedUserIds.size > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedUserIds(new Set())}>
                      Clear
                    </Button>
                  )}
                </div>
                <div className="max-h-[280px] overflow-y-auto p-1">
                  {rows.map((r) => (
                    <button
                      key={r.user_id}
                      onClick={() => toggleUser(r.user_id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-muted/50 transition-colors",
                        selectedUserIds.has(r.user_id) && "bg-primary/10"
                      )}
                    >
                      <div
                        className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                          selectedUserIds.has(r.user_id) ? "bg-primary border-primary" : "border-border"
                        )}
                      >
                        {selectedUserIds.has(r.user_id) && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className="truncate">{r.full_name}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {(departmentFilter || search || selectedUserIds.size > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDepartmentFilter(null); setSearch(""); setSelectedUserIds(new Set()); }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear filters
              </Button>
            )}
          </div>

          {filteredRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 p-12 text-center text-sm text-muted-foreground">
              <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
              No matching users for this period.
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 divide-y divide-border/30 overflow-hidden">
              {filteredRows.map((r) => <UserRow key={r.user_id} row={r} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const SummaryCard = ({
  icon, label, value, hint, accent, progress,
}: {
  icon: React.ReactNode; label: string; value: string; hint?: string; accent?: string; progress?: number;
}) => (
  <div className="rounded-xl border border-border/50 bg-card/40 p-4">
    <div className="flex items-center gap-2 text-muted-foreground text-[11px] uppercase tracking-wider mb-2">
      {icon}
      <span>{label}</span>
    </div>
    <div className={cn("text-3xl font-bold tabular-nums", accent)}>{value}</div>
    {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    {typeof progress === "number" && (
      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full transition-all duration-700", pctBg(progress))} style={{ width: `${progress}%` }} />
      </div>
    )}
  </div>
);

const UserRow = ({
  row,
}: {
  row: {
    user_id: string;
    full_name: string;
    email: string;
    department: string | null;
    done: number;
    total: number;
    pct: number;
    byDay: { date: string; slots: { hour: number; update: any | null }[] }[];
  };
}) => {
  const [open, setOpen] = useState(false);
  const missed = row.total - row.done;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-3 p-3 px-4 hover:bg-muted/20 transition-colors text-left">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
            {(row.full_name || row.email).slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{row.full_name}</div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">{row.email}</span>
              {row.department && (
                <Badge variant="outline" className="h-4 text-[9px] px-1.5 capitalize">{row.department}</Badge>
              )}
            </div>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums w-16 text-right">{row.done}/{row.total}</div>
          <div className="hidden md:block w-32 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full transition-all duration-500", pctBg(row.pct))} style={{ width: `${row.pct}%` }} />
          </div>
          <div className={cn("w-12 text-right tabular-nums text-sm font-bold", pctColor(row.pct))}>{row.pct}%</div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 pt-2 bg-muted/10 border-t border-border/30 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Submitted</div>
              <div className="text-lg font-bold text-success">{row.done}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Missed</div>
              <div className={cn("text-lg font-bold", missed > 0 ? "text-destructive" : "text-muted-foreground")}>{missed}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Compliance</div>
              <div className={cn("text-lg font-bold", pctColor(row.pct))}>{row.pct}%</div>
            </div>
          </div>

          <div className="space-y-2">
            {row.byDay.slice().reverse().map((bd) => {
              const submittedCount = bd.slots.filter((s) => s.update).length;
              const dayPct = Math.round((submittedCount / bd.slots.length) * 100);
              return (
                <div key={bd.date} className="rounded-lg border border-border/40 p-3 bg-card/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium">{format(new Date(bd.date), "EEE, MMM d")}</span>
                    <span className={cn("text-[11px] font-semibold tabular-nums", pctColor(dayPct))}>
                      {submittedCount}/{bd.slots.length} · {dayPct}%
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bd.slots.map((sl) => {
                      const u = sl.update;
                      const label = `${sl.hour.toString().padStart(2, "0")}:00`;
                      return (
                        <span
                          key={sl.hour}
                          title={
                            u
                              ? `${label} · ${u.dials_count ?? 0} dials · ${u.talk_time ?? 0} talk · ${u.connects_count ?? 0} connects${u.support_needed ? " · needs support" : ""}`
                              : `${label} · missed`
                          }
                          className={cn(
                            "px-2 py-1 rounded-md text-[10px] tabular-nums border",
                            u
                              ? "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400"
                              : "bg-destructive/10 border-destructive/30 text-destructive"
                          )}
                        >
                          {label}
                          {u && (
                            <span className="ml-1 text-muted-foreground">· {u.dials_count ?? 0}d</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
