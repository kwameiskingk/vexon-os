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
import SetterProfileDrawer from "@/components/sdr-manager/SetterProfileDrawer";
import SetterRoster from "@/components/sdr-manager/SetterRoster";
import { getTitleLabel } from "@/lib/setterTitles";
import { filterToSetterRoleIds } from "@/lib/setterRoleFilter";
import { TARGET_DEFAULTS, fetchSetterTargetsMap } from "@/hooks/useSetterTargets";

const CSMSetters = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSetterId, setSelectedSetterId] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // Current month range
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  
  // Current week range for roster
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 4); // Friday
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  // Fetch only fulfilment setters
  const { data: setters, isLoading, refetch } = useQuery({
    queryKey: ['csm-fulfilment-setters', monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setters_profiles')
        .select('*')
        .eq('department', 'fulfilment')
        .eq('active', true)
        .not('is_test_account', 'is', true)
        .order('full_name');

      if (error) throw error;

      // Role-gate to true setter-role users (same filterToSetterRoleIds
      // pattern as the leaderboards): profiles for csm/dev/AE/sdr_manager
      // that share the fulfilment department for scheduling are excluded.
      const setterRoleIds = await filterToSetterRoleIds((data || []).map((s) => s.user_id));
      const fulfilmentSetters = (data || []).filter(
        (s) => s.user_id && setterRoleIds.has(s.user_id),
      );

      // Batched: three queries total instead of three PER setter, which is
      // what made this page slow to paint. Counting semantics unchanged — a
      // meeting counts once for a setter if either setter_id or
      // logged_by_setter_id is them.
      const userIds = fulfilmentSetters.map((s) => s.user_id).filter(Boolean) as string[];
      const profileIds = fulfilmentSetters.map((s) => s.id);

      const [assignmentsRes, meetingsRes, rosterRes] = await Promise.all([
        profileIds.length
          ? supabase.from('setter_client_assignments')
              .select('setter_id').in('setter_id', profileIds).eq('status', 'active')
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from('meetings')
              .select('id, setter_id, logged_by_setter_id')
              .or(`setter_id.in.(${userIds.join(',')}),logged_by_setter_id.in.(${userIds.join(',')})`)
              .gte('meeting_date', monthStart)
              .lte('meeting_date', monthEnd)
          : Promise.resolve({ data: [] as any[] }),
        profileIds.length
          ? supabase.from('roster_entries')
              .select('setter_profile_id, client_profile_id')
              .in('setter_profile_id', profileIds)
              .gte('roster_date', weekStartStr)
              .lte('roster_date', weekEndStr)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const idSet = new Set(userIds);
      const meetingsByUser = new Map<string, number>();
      for (const m of (meetingsRes.data || []) as any[]) {
        const owners = new Set<string>();
        if (m.setter_id && idSet.has(m.setter_id)) owners.add(m.setter_id);
        if (m.logged_by_setter_id && idSet.has(m.logged_by_setter_id)) owners.add(m.logged_by_setter_id);
        for (const uid of owners) meetingsByUser.set(uid, (meetingsByUser.get(uid) || 0) + 1);
      }
      const assignmentsByProfile = new Map<string, number>();
      for (const a of (assignmentsRes.data || []) as any[]) {
        assignmentsByProfile.set(a.setter_id, (assignmentsByProfile.get(a.setter_id) || 0) + 1);
      }
      const rosteredByProfile = new Map<string, Set<string>>();
      for (const r of (rosterRes.data || []) as any[]) {
        if (!rosteredByProfile.has(r.setter_profile_id)) rosteredByProfile.set(r.setter_profile_id, new Set());
        rosteredByProfile.get(r.setter_profile_id)!.add(r.client_profile_id);
      }

      const settersWithStats = fulfilmentSetters.map((setter) => ({
        ...setter,
        // Use the higher of long-term assignments or rostered clients.
        active_assignments: Math.max(
          assignmentsByProfile.get(setter.id) || 0,
          rosteredByProfile.get(setter.id)?.size || 0,
        ),
        total_meetings: meetingsByUser.get(setter.user_id as string) || 0,
      }));

      return settersWithStats;
    }
  });

  // Per-setter targets from setter_targets (one batch call once the list loads)
  const setterIds = (setters || []).map(s => s.id);
  const { data: targetsMap } = useQuery({
    queryKey: ['csm-setters-targets', setterIds.join(',')],
    queryFn: () => fetchSetterTargetsMap(setterIds),
    enabled: setterIds.length > 0,
  });

  const filteredSetters = setters?.filter(s =>
    (s.full_name || s.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const activeCount = setters?.filter(s => s.active).length || 0;
  const totalCount = setters?.length || 0;

  const select = (id: string) => {
    setSelectedSetterId((cur) => (cur === id ? null : id));
    setDetailDrawerOpen(true);
  };

  const list = (
    <div>
      <div className="relative pb-3">
        <Search className="absolute left-0 top-[9px] h-3.5 w-3.5 text-[var(--dim)]" />
        <Input
          placeholder="Search setters…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-8 rounded-none border-0 border-b border-[var(--line2)] bg-transparent pl-6 text-[12.5px] focus-visible:ring-0"
        />
      </div>
      {isLoading ? (
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-1.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
          ))}
        </div>
      ) : filteredSetters.length === 0 ? (
        <p className="pt-4 text-[12px] text-[var(--dim)]">{searchTerm ? 'No setters match that search.' : 'No fulfilment setters to show.'}</p>
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
              aside={<span title="Booked this month · clients">{setter.total_meetings} · {setter.active_assignments}</span>}
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
      department="fulfilment"
      open={detailDrawerOpen}
      onClose={() => {
        setDetailDrawerOpen(false);
        setSelectedSetterId(null);
        refetch();
      }}
      onUpdate={() => refetch()}
    />
  ) : (
    <div className="pt-10 text-center text-[12px] text-[var(--dim)]">Pick a setter to see their appointments, clients, training and actions.</div>
  );

  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
        <PageHeader
          title="Setter Management"
          subtitle={`${activeCount} active of ${totalCount} fulfilment setters`}
        />

        <Tabs defaultValue="management" className="space-y-5">
          <TabsList>
            <TabsTrigger value="management">Setter Management</TabsTrigger>
            <TabsTrigger value="roster">Setter Assignment</TabsTrigger>
          </TabsList>
          <TabsContent value="management"><MasterDetail list={list} detail={detail} /></TabsContent>
          <TabsContent value="roster">
            <SetterRoster />
          </TabsContent>
        </Tabs>
      </PageContainer>
    </DashboardLayout>
  );
};

export default CSMSetters;
