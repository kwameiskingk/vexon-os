import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, isSameDay, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CheckCheck, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import {
  fetchAllEmployeesRoster,
  fetchManagedAttendanceRoster,
  type AttendanceEmployee,
} from "./attendanceRoster";

/**
 * Single-day attendance board — the new DEFAULT for both attendance
 * surfaces (Ops Command and the SDR-manager Team Feedback tab). One row per
 * person, one click per mark, both surfaces read/write the SAME
 * employee_attendance table so a mark made in one appears in the other.
 *
 * Authority rule (enforced by RLS, surfaced here): an ops-tier mark shows a
 * lock to sdr_manager viewers — only ops can change it. Clearing = deleting
 * the row (unmarked = no row), matching the review's days-worked source.
 */

type AttendanceStatus = "present" | "late" | "half_day" | "absent";

interface AttendanceRow {
  id: string;
  employee_id: string;
  date: string;
  status: AttendanceStatus;
  marked_by_role?: string | null;
}

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string; active: string }> = [
  { value: "present", label: "Present", active: "bg-emerald-500 text-white border-emerald-500" },
  { value: "late", label: "Late", active: "bg-amber-500 text-white border-amber-500" },
  { value: "half_day", label: "Half Day", active: "bg-yellow-400 text-black border-yellow-400" },
  { value: "absent", label: "Absent", active: "bg-red-500 text-white border-red-500" },
];

export function AttendanceDayBoard({
  scope,
  allowedRoles,
}: {
  /** "all" = Ops/HR population; department(s) = the sdr_manager gate — an
   *  array unions a dual-department manager's rosters. */
  scope: "all" | "fulfilment" | "acquisition" | Array<"fulfilment" | "acquisition">;
  allowedRoles?: string[];
}) {
  const [day, setDay] = useState<Date>(() => new Date());
  const { userRoles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dayISO = format(day, "yyyy-MM-dd");
  const today = new Date();

  // Viewers whose only qualifying role is sdr_manager cannot change ops marks.
  const isOpsTierViewer = (userRoles || []).some((r) =>
    ["admin", "dev", "ops", "hr", "ops_assistant", "finance", "csm", "account_executive"].includes(r),
  );

  const rosterQuery = useQuery({
    queryKey: [
      "attendance-day-roster",
      Array.isArray(scope) ? scope.join(",") : scope,
      allowedRoles?.join(",") ?? "",
    ],
    queryFn: (): Promise<AttendanceEmployee[]> =>
      scope === "all" ? fetchAllEmployeesRoster(allowedRoles) : fetchManagedAttendanceRoster(scope),
  });

  const marksQuery = useQuery({
    queryKey: ["attendance-day-marks", dayISO],
    queryFn: async (): Promise<AttendanceRow[]> => {
      const { data, error } = await supabase
        .from("employee_attendance")
        .select("*")
        .eq("date", dayISO);
      if (error) throw error;
      return (data || []) as AttendanceRow[];
    },
  });

  const marksByEmployee = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const m of marksQuery.data || []) map.set(m.employee_id, m);
    return map;
  }, [marksQuery.data]);

  const setMark = useMutation({
    mutationFn: async ({ employeeId, status }: { employeeId: string; status: AttendanceStatus | null }) => {
      if (status === null) {
        const { error } = await supabase
          .from("employee_attendance")
          .delete()
          .eq("employee_id", employeeId)
          .eq("date", dayISO);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("employee_attendance")
          .upsert({ employee_id: employeeId, date: dayISO, status }, { onConflict: "employee_id,date" });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance-day-marks", dayISO] }),
    onError: (e: Error) => {
      const blocked = /row-level security/i.test(e.message);
      toast({
        title: blocked ? "This mark is locked" : "Could not save mark",
        description: blocked
          ? "It was set by ops — only ops can change it."
          : e.message,
        variant: "destructive",
      });
    },
  });

  const markAllPresent = useMutation({
    mutationFn: async () => {
      const unmarked = (rosterQuery.data || []).filter((e) => !marksByEmployee.has(e.id));
      if (unmarked.length === 0) return;
      const { error } = await supabase.from("employee_attendance").upsert(
        unmarked.map((e) => ({ employee_id: e.id, date: dayISO, status: "present" as const })),
        { onConflict: "employee_id,date" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance-day-marks", dayISO] }),
    onError: (e: Error) => toast({ title: "Could not mark all", description: e.message, variant: "destructive" }),
  });

  const roster = rosterQuery.data || [];
  const markedCount = roster.filter((e) => marksByEmployee.has(e.id)).length;
  const isLoading = rosterQuery.isLoading || marksQuery.isLoading;

  return (
    <div className="space-y-4">
      {/* Day controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setDay((d) => subDays(d, 1))} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-4 py-2 rounded-lg border bg-card text-sm font-medium min-w-[220px] text-center">
            {format(day, "EEEE, d MMMM yyyy")}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDay((d) => addDays(d, 1))}
            disabled={isSameDay(day, today) || day > today}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isSameDay(day, today) && (
            <Button size="sm" variant="ghost" onClick={() => setDay(new Date())}>
              Today
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {markedCount}/{roster.length} marked
          </span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => markAllPresent.mutate()}
            disabled={markAllPresent.isPending || markedCount === roster.length}
          >
            <CheckCheck className="h-4 w-4" /> Mark rest present
          </Button>
        </div>
      </div>

      {/* One row per person */}
      <Card className="border-border/60">
        <CardContent className="p-0 divide-y divide-border/60">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : roster.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No team members to mark.</div>
          ) : (
            roster.map((e) => {
              const mark = marksByEmployee.get(e.id);
              const lockedForViewer = !isOpsTierViewer && mark?.marked_by_role === "ops";
              return (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-[180px]">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        mark ? STATUS_OPTIONS.find((o) => o.value === mark.status)?.active.split(" ")[0] : "bg-muted-foreground/30",
                      )}
                    />
                    <span className="text-sm font-medium">{e.name}</span>
                    {lockedForViewer && (
                      <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground" title="Set by ops — only ops can change it">
                        <Lock className="h-3 w-3" /> ops
                      </Badge>
                    )}
                  </div>
                  <div className="inline-flex rounded-lg border bg-muted/30 p-0.5">
                    {STATUS_OPTIONS.map((opt) => {
                      const isActive = mark?.status === opt.value;
                      return (
                        <button
                          key={opt.value}
                          disabled={lockedForViewer || setMark.isPending}
                          onClick={() =>
                            // Clicking the active status clears the mark (unmarked = no row).
                            setMark.mutate({ employeeId: e.id, status: isActive ? null : opt.value })
                          }
                          className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                            isActive ? opt.active : "text-muted-foreground hover:text-foreground",
                            lockedForViewer && "opacity-60 cursor-not-allowed",
                          )}
                          title={isActive ? "Click again to clear" : opt.label}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground">
        Unmarked = grey (no row). Half-days count 0.5 and late counts a full day in performance-review
        days worked. Marks made here and on the other attendance surface share one record.
      </p>
    </div>
  );
}
