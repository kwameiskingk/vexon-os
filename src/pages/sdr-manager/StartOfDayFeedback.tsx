import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchManagedSetterProfileIds } from "@/lib/managedRoster";
import { useAuth } from "@/contexts/AuthContext";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sunrise, Smile, Meh, Frown, SmilePlus, Angry, ChevronRight } from "lucide-react";
import { format, subDays } from "date-fns";
import { useUserTimezone, formatDualTimestamp } from "@/utils/timezoneUtils";
import { cn } from "@/lib/utils";
import {
  TeamFeedbackFilters,
  FeedbackPeriod,
  getEffectiveRangeStrings,
} from "@/components/feedback/TeamFeedbackFilters";

const moodIcons: Record<string, { icon: any; color: string; label: string }> = {
  very_happy: { icon: SmilePlus, color: "text-green-500", label: "Very Happy" },
  happy: { icon: Smile, color: "text-green-400", label: "Happy" },
  neutral: { icon: Meh, color: "text-yellow-500", label: "Neutral" },
  unhappy: { icon: Frown, color: "text-orange-500", label: "Unhappy" },
  very_unhappy: { icon: Angry, color: "text-red-500", label: "Very Unhappy" },
};

interface Props {
  /** When embedded inside another page (e.g. Attendance tabs), skip the DashboardLayout wrapper */
  embedded?: boolean;
  scope?: "sdr_manager" | "operations";
}

const StartOfDayFeedback = ({ embedded, scope = "sdr_manager" }: Props) => {
  const { user } = useAuth();
  // Person-level surface: the roster unions over every held department.
  const { departments: managerDepartments } = useSdrManagerScope();
  const userTz = useUserTimezone();
  const [selected, setSelected] = useState<any | null>(null);
  const [period, setPeriod] = useState<FeedbackPeriod>("today");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const { data: setters = [] } = useQuery({
    queryKey: ["sod-feedback-setters", scope, user?.id, managerDepartments.join(",")],
    queryFn: async () => {
      if (scope === "operations") {
        const { data } = await supabase
          .from("setters_profiles")
          .select("id, user_id, full_name, email, department")
          .eq("active", true)
        .eq("is_test_account", false)
          .neq("department", "sales") // AE telemetry rows, not SoD roster members
          .order("full_name");

        return (data || []).filter((s) => s.user_id);
      }

      if (!user?.id) return [];
      const managedIds = await fetchManagedSetterProfileIds(user.id);
      if (!managedIds.length) return [];
      const { data } = await supabase
        .from("setters_profiles")
        .select("id, user_id, full_name, email, department")
        .in("id", managedIds)
        .eq("active", true)
        .eq("is_test_account", false)
        .in("department", managerDepartments);
      return (data || []).filter((s) => s.user_id);
    },
    enabled: scope === "operations" || !!user?.id,
  });

  // Roles per user (for role filter in operations scope)
  const { data: rolesMap } = useQuery({
    queryKey: ["sod-feedback-roles", setters.map((s: any) => s.user_id).join(",")],
    queryFn: async () => {
      const ids = setters.map((s: any) => s.user_id).filter(Boolean);
      if (!ids.length) return new Map<string, string>();
      const { data } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
      const m = new Map<string, string>();
      (data || []).forEach((r: any) => {
        if (!m.has(r.user_id)) m.set(r.user_id, r.role);
      });
      return m;
    },
    enabled: setters.length > 0 && scope === "operations",
  });

  const userIds = setters.map((s: any) => s.user_id);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["start-of-day-submissions", userIds.join(","), period, customRange.from?.toISOString(), customRange.to?.toISOString()],
    queryFn: async () => {
      if (!userIds.length) return [];
      const { start, end } = getEffectiveRangeStrings(period, customRange);
      const { data } = await supabase
        .from("start_of_day_submissions")
        .select("*")
        .in("user_id", userIds)
        .gte("date", start)
        .lte("date", end)
        .order("submitted_at", { ascending: false });
      return data || [];
    },
    enabled: userIds.length > 0,
  });

  const getName = (uid: string) =>
    setters.find((s: any) => s.user_id === uid)?.full_name ||
    setters.find((s: any) => s.user_id === uid)?.email ||
    "Unknown";

  const userOptions = useMemo(
    () =>
      setters.map((s: any) => ({
        id: s.user_id,
        name: s.full_name || s.email || "Unknown",
        department: s.department || null,
        role: rolesMap?.get(s.user_id) || null,
      })),
    [setters, rolesMap]
  );

  const departments = useMemo(() => {
    const set = new Set<string>();
    userOptions.forEach((u) => u.department && set.add(u.department));
    return Array.from(set);
  }, [userOptions]);

  const roles = useMemo(() => {
    const set = new Set<string>();
    userOptions.forEach((u) => u.role && set.add(u.role));
    return Array.from(set);
  }, [userOptions]);

  const filteredSubmissions = useMemo(() => {
    const q = search.toLowerCase();
    return submissions.filter((s: any) => {
      if (selectedUserIds.size > 0 && !selectedUserIds.has(s.user_id)) return false;
      const opt = userOptions.find((u) => u.id === s.user_id);
      if (departmentFilter && opt?.department !== departmentFilter) return false;
      if (roleFilter && opt?.role !== roleFilter) return false;
      if (q && !(opt?.name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [submissions, search, selectedUserIds, departmentFilter, roleFilter, userOptions]);

  const toggleUser = (id: string) =>
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const content = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sunrise className="h-4 w-4 text-primary" />
          Start of Day Feedback
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <TeamFeedbackFilters
          showDepartment={scope === "operations"}
          showRole={scope === "operations"}
          period={period}
          onPeriodChange={setPeriod}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          search={search}
          onSearchChange={setSearch}
          users={userOptions}
          selectedUserIds={selectedUserIds}
          onUserToggle={toggleUser}
          onUserClear={() => setSelectedUserIds(new Set())}
          departments={departments}
          departmentFilter={departmentFilter}
          onDepartmentChange={setDepartmentFilter}
          roles={roles}
          roleFilter={roleFilter}
          onRoleChange={setRoleFilter}
        />

        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : filteredSubmissions.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-6">
            No Start of Day submissions for the selected filters.
          </p>
        ) : (
          <div className="space-y-2">
            {filteredSubmissions.map((s: any) => {
              const mood = moodIcons[s.mood] || moodIcons.neutral;
              const MoodIcon = mood.icon;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className="rounded-lg border border-border p-3 bg-card hover:bg-accent/50 cursor-pointer transition-colors flex items-center gap-3"
                >
                  <MoodIcon className={cn("h-5 w-5 shrink-0", mood.color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{getName(s.user_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.missed
                        ? "—"
                        : `${s.date} · ${formatDualTimestamp(s.submitted_at_uk || s.submitted_at, userTz)}`}
                    </p>
                  </div>
                  {s.missed && (
                    <Badge variant="destructive" className="text-xs">
                      Missed
                    </Badge>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {getName(selected.user_id)}
                  {selected.missed && <Badge variant="destructive">Missed</Badge>}
                </DialogTitle>
              </DialogHeader>
              {!selected.missed && (
                <p className="text-xs text-muted-foreground">
                  {formatDualTimestamp(selected.submitted_at_uk || selected.submitted_at, userTz)}
                </p>
              )}
              {selected.mood && (
                <div className="flex items-center gap-2">
                  {(() => {
                    const m = moodIcons[selected.mood];
                    if (!m) return null;
                    const Icon = m.icon;
                    return (
                      <>
                        <Icon className={cn("h-5 w-5", m.color)} />
                        <span className="text-sm">{m.label}</span>
                      </>
                    );
                  })()}
                </div>
              )}
              {[
                ["Planned activities", selected.planned_activities],
                ["Top priorities", selected.top_priorities],
                ["What success looks like", selected.success_definition],
                ["Blockers", selected.blockers],
                ["Anything else", selected.anything_else],
              ].map(([label, val]) =>
                val ? (
                  <div key={label as string}>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
                    <p className="text-sm whitespace-pre-wrap">{val}</p>
                  </div>
                ) : null
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );

  if (embedded) return content;

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader title="Start of Day Feedback" subtitle="SoD submissions from your setters" />
        {content}
      </PageContainer>
    </DashboardLayout>
  );
};

export default StartOfDayFeedback;
