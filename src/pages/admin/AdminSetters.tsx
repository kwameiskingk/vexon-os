import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { MasterDetail, MasterRow, Pill } from "@/components/ui-v2";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import { useDepartment } from "@/contexts/DepartmentContext";
import SetterProfileDrawer from "@/components/sdr-manager/SetterProfileDrawer";
import SetterRoster from "@/components/sdr-manager/SetterRoster";
import { getTitleLabel } from "@/lib/setterTitles";
import { TARGET_DEFAULTS, fetchSetterTargetsMap } from "@/hooks/useSetterTargets";
import { filterToSetterRoleIds } from "@/lib/setterRoleFilter";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";

const AdminSetters = () => {
  const { selectedDepartment } = useDepartment();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSetterId, setSelectedSetterId] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  // Leavers and deactivated benches are hidden by default (the owner, 25 Aug) —
  // the roster is a LIVE view. Everything is retained and one tick away.
  const [showInactive, setShowInactive] = useState(false);

  const isFulfilment = selectedDepartment !== "sales";
  const departmentFilter = isFulfilment ? "fulfilment" : "acquisition";
  const departmentLabel = isFulfilment ? "Fulfilment" : "Sales";

  // Current month range
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  // Current week range for roster (fulfilment only)
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 4);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  const { data: setters, isLoading, refetch } = useQuery({
    queryKey: ["admin-setters-management", departmentFilter, monthStart, showInactive],
    queryFn: async () => {
      // Test/demo benches never belong on a management roster.
      let query = supabase
        .from("setters_profiles")
        .select("*")
        .eq("department", departmentFilter)
        .not("is_test_account", "is", true);
      if (!showInactive) query = query.eq("active", true);
      const { data, error } = await query.order("full_name");

      if (error) throw error;

      // Role-gate to genuine setter-role users (same pattern as CSMSetters):
      // CSMs, ops and SDR managers share a department for scheduling but are
      // not setters — this is why Daniel was appearing as an SDR card.
      const setterRoleIds = await filterToSetterRoleIds(
        (data || []).map((s) => s.user_id),
      );
      // Former employees drop off the live roster; their history is retained
      // and reachable via "Show inactive".
      const offboarded = showInactive ? new Set<string>() : await fetchOffboardedUserIds();
      const roster = (data || []).filter(
        (s) =>
          s.user_id &&
          setterRoleIds.has(s.user_id) &&
          !offboarded.has(s.user_id),
      );

      // Stats fan out per setter, so filter FIRST — this cut the fulfilment
      // roster from 21 rows (~60 queries) to the handful actually shown.
      // Stats used to fan out FOUR round-trips per setter (~20 requests for
      // the fulfilment roster), which is why this page took so long to paint.
      // Now it is three batched queries regardless of how many setters there
      // are, counted client-side. Counting semantics are unchanged: a meeting
      // counts for a setter if EITHER setter_id or logged_by_setter_id matches
      // (and only once per setter, even when both fields are them).
      const userIds = roster.map((s) => s.user_id).filter(Boolean) as string[];
      const profileIds = roster.map((s) => s.id);

      const [meetingsRes, assignmentsRes, rosterRes] = await Promise.all([
        userIds.length
          ? supabase
              .from("meetings")
              .select("id, setter_id, logged_by_setter_id, attendance_status")
              .or(
                `setter_id.in.(${userIds.join(",")}),logged_by_setter_id.in.(${userIds.join(",")})`,
              )
              .gte("meeting_date", monthStart)
              .lte("meeting_date", monthEnd)
          : Promise.resolve({ data: [] as any[] }),
        isFulfilment && profileIds.length
          ? supabase
              .from("setter_client_assignments")
              .select("setter_id")
              .in("setter_id", profileIds)
              .eq("status", "active")
          : Promise.resolve({ data: [] as any[] }),
        isFulfilment && profileIds.length
          ? supabase
              .from("roster_entries")
              .select("setter_profile_id, client_profile_id")
              .in("setter_profile_id", profileIds)
              .gte("roster_date", weekStartStr)
              .lte("roster_date", weekEndStr)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const idSet = new Set(userIds);
      const totalByUser = new Map<string, number>();
      const satByUser = new Map<string, number>();
      for (const m of (meetingsRes.data || []) as any[]) {
        const owners = new Set<string>();
        if (m.setter_id && idSet.has(m.setter_id)) owners.add(m.setter_id);
        if (m.logged_by_setter_id && idSet.has(m.logged_by_setter_id)) {
          owners.add(m.logged_by_setter_id);
        }
        for (const uid of owners) {
          totalByUser.set(uid, (totalByUser.get(uid) || 0) + 1);
          if (m.attendance_status === "sat") {
            satByUser.set(uid, (satByUser.get(uid) || 0) + 1);
          }
        }
      }

      const assignmentsByProfile = new Map<string, number>();
      for (const a of (assignmentsRes.data || []) as any[]) {
        assignmentsByProfile.set(a.setter_id, (assignmentsByProfile.get(a.setter_id) || 0) + 1);
      }

      const rosteredByProfile = new Map<string, Set<string>>();
      for (const r of (rosterRes.data || []) as any[]) {
        if (!rosteredByProfile.has(r.setter_profile_id)) {
          rosteredByProfile.set(r.setter_profile_id, new Set());
        }
        rosteredByProfile.get(r.setter_profile_id)!.add(r.client_profile_id);
      }

      const settersWithStats = roster.map((setter) => ({
        ...setter,
        total_meetings: totalByUser.get(setter.user_id as string) || 0,
        sat_meetings: satByUser.get(setter.user_id as string) || 0,
        active_assignments: isFulfilment
          ? Math.max(
              assignmentsByProfile.get(setter.id) || 0,
              rosteredByProfile.get(setter.id)?.size || 0,
            )
          : 0,
      }));

      return settersWithStats;
    },
  });

  // Per-setter targets from setter_targets (one batch call once the list loads)
  const setterIds = (setters || []).map((s) => s.id);
  const { data: targetsMap } = useQuery({
    queryKey: ["admin-setters-targets", setterIds.join(",")],
    queryFn: () => fetchSetterTargetsMap(setterIds),
    enabled: setterIds.length > 0,
  });

  const filteredSetters =
    setters?.filter((s) =>
      (s.full_name || s.email || "").toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  const activeCount = setters?.filter((s) => s.active).length || 0;
  const totalCount = setters?.length || 0;

  const pageTitle = `${departmentLabel} Setters`;
  // Default view is live-only, so "n active of n" would read oddly — say what
  // is actually on screen instead.
  const subtitle = showInactive
    ? `${activeCount} active of ${totalCount} ${departmentFilter} setters (including inactive)`
    : `${totalCount} active ${departmentFilter} ${totalCount === 1 ? "setter" : "setters"}`;

  const select = (id: string) => {
    setSelectedSetterId((cur) => (cur === id ? null : id));
    setDetailDrawerOpen(true);
  };

  const list = (
    <div>
      <div className="flex flex-col gap-2 pb-3">
        <div className="relative">
          <Search className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dim)]" />
          <Input
            placeholder="Search setters…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 rounded-none border-0 border-b border-[var(--line2)] bg-transparent pl-6 text-[12.5px] focus-visible:ring-0"
          />
        </div>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-[11.5px] text-[var(--dim)]">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[var(--accent)]"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive &amp; former setters
        </label>
      </div>
      {isLoading ? (
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredSetters.length === 0 ? (
        <p className="pt-4 text-[12px] text-[var(--dim)]">
          {searchTerm ? "No setters match that search." : `No ${departmentFilter} setters to show.`}
        </p>
      ) : (
        filteredSetters.map((setter) => {
          const targets = targetsMap?.get(setter.id) ?? TARGET_DEFAULTS.fulfilment;
          return (
            <MasterRow
              key={setter.id}
              selected={selectedSetterId === setter.id}
              onClick={() => select(setter.id)}
              primary={<span className="flex items-center gap-2">{setter.full_name || setter.email}{!setter.active && <Pill>Inactive</Pill>}</span>}
              secondary={`${getTitleLabel(setter.title)} · ${targets.daily_dials_target} dials · ${targets.daily_meetings_target} mtgs a day`}
              aside={<span title={isFulfilment ? "Booked this month · clients" : "Booked this month · sat"}>{setter.total_meetings} · {isFulfilment ? setter.active_assignments : setter.sat_meetings}</span>}
            />
          );
        })
      )}
    </div>
  );

  const detail = selectedSetterId ? (
    <SetterProfileDrawer
      inline
      setterId={selectedSetterId}
      department={departmentFilter}
      open={detailDrawerOpen}
      onClose={() => {
        setDetailDrawerOpen(false);
        setSelectedSetterId(null);
        refetch();
      }}
      onUpdate={() => refetch()}
    />
  ) : (
    <div className="pt-10 text-center text-[12px] text-[var(--dim)]">Pick a setter to see their appointments, training and actions.</div>
  );

  const management = <MasterDetail list={list} detail={detail} />;

  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
        <PageHeader title={pageTitle} subtitle={subtitle} />

        {isFulfilment ? (
          <Tabs defaultValue="management" className="space-y-5">
            <TabsList>
              <TabsTrigger value="management">Setter Management</TabsTrigger>
              <TabsTrigger value="roster">Setter Assignment</TabsTrigger>
            </TabsList>
            <TabsContent value="management">{management}</TabsContent>
            <TabsContent value="roster">
              <SetterRoster />
            </TabsContent>
          </Tabs>
        ) : (
          management
        )}
      </PageContainer>
    </DashboardLayout>
  );
};

export default AdminSetters;
