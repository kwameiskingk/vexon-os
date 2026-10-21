import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchManagedSetterProfileIds } from "@/lib/managedRoster";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getLeadTypeConfig } from "@/lib/leadTypes";
import { useAuth } from "@/contexts/AuthContext";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { UpdateMeetingStatusModal } from "@/components/meetings/UpdateMeetingStatusModal";
import { ClientAssignmentModal } from "@/components/admin/ClientAssignmentModal";
import { MeetingDetailDrawer } from "@/components/meetings/MeetingDetailDrawer";
import { Skeleton } from "@/components/ui/skeleton";
import { LogManagerMeetingModal } from "@/components/sdr-manager/LogManagerMeetingModal";

type PeriodFilter = "daily" | "weekly" | "monthly";

const getDateRange = (period: PeriodFilter) => {
  const now = new Date();
  switch (period) {
    case "daily":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "weekly": {
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      return { start: weekStart, end: weekEnd };
    }
    case "monthly":
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
};

const SDRManagerMeetings = () => {
  const { user } = useAuth();
  // Acquisition meetings have no client concept — the client-assignment UI
  // is hidden only when the manager holds NO fulfilment department, so a
  // dual-department manager keeps it for their fulfilment meetings.
  const { departments: managerDepartments } = useSdrManagerScope();
  const hideClientAssignment = !managerDepartments.includes("fulfilment");
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "history">("pending");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("monthly");
  const [showUpdateStatusModal, setShowUpdateStatusModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignMeetingId, setAssignMeetingId] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [logModalOpen, setLogModalOpen] = useState(false);

  interface SetterIds {
    profileIds: string[];
    userIds: string[];
  }

  const { data: assignedSetterIds } = useQuery<SetterIds>({
    queryKey: ['sdr-manager-setter-ids', user?.id],
    queryFn: async (): Promise<SetterIds> => {
      if (!user?.id) return { profileIds: [], userIds: [] };
      
      const managedIds = await fetchManagedSetterProfileIds(user.id);
      const { data: managedProfiles } = managedIds.length
        ? await supabase.from('setters_profiles').select('id, user_id').in('id', managedIds)
        : { data: [] };

      return {
        profileIds: (managedProfiles ?? []).map((p: any) => p.id).filter(Boolean),
        userIds: (managedProfiles ?? []).map((p: any) => p.user_id).filter(Boolean)
      };
    },
    enabled: !!user?.id
  });

  const { start: rangeStart, end: rangeEnd } = getDateRange(periodFilter);
  const rangeStartISO = rangeStart.toISOString();
  const rangeEndISO = rangeEnd.toISOString();

  const { data: meetings, isLoading, refetch } = useQuery({
    queryKey: ['sdr-manager-meetings', assignedSetterIds, periodFilter, user?.id],
    queryFn: async () => {
      const profileIds = assignedSetterIds?.profileIds || [];
      const userIds = assignedSetterIds?.userIds || [];
      if (!profileIds.length && !userIds.length && !user?.id) return [];

      const selectFields = '*, client_profiles(id, company_name)';
      const queries: any[] = [];

      if (profileIds.length > 0) {
        queries.push(
          supabase.from('meetings').select(selectFields)
            .in('setter_profile_id', profileIds)
            .gte('created_at', rangeStartISO)
            .lte('created_at', rangeEndISO)
            .order('created_at', { ascending: false })
        );
      }

      if (userIds.length > 0) {
        queries.push(
          supabase.from('meetings').select(selectFields)
            .in('logged_by_setter_id', userIds)
            .gte('created_at', rangeStartISO)
            .lte('created_at', rangeEndISO)
            .order('created_at', { ascending: false })
        );
        queries.push(
          supabase.from('meetings').select(selectFields)
            .in('setter_id', userIds)
            .gte('created_at', rangeStartISO)
            .lte('created_at', rangeEndISO)
            .order('created_at', { ascending: false })
        );
      }

      // Meetings the SDR manager logged themselves
      if (user?.id) {
        queries.push(
          supabase.from('meetings').select(selectFields)
            .eq('logged_by_manager_id', user.id)
            .gte('created_at', rangeStartISO)
            .lte('created_at', rangeEndISO)
            .order('created_at', { ascending: false })
        );
      }

      const results = await Promise.all(queries);
      const allMeetings = results.flatMap(r => r.data || []);
      const uniqueMeetings = Array.from(new Map(allMeetings.map(m => [m.id, m])).values());

      return uniqueMeetings.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: !!user?.id
  });

  const { data: managerProfile } = useQuery({
    queryKey: ['sdr-manager-self-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: setterProfiles } = useQuery({
    queryKey: ['sdr-manager-setter-profiles', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const managedIds = await fetchManagedSetterProfileIds(user.id);
      if (!managedIds.length) return [];
      const { data: managedProfiles } = await supabase
        .from('setters_profiles')
        .select('id, user_id, full_name, email')
        .in('id', managedIds);
      return managedProfiles ?? [];
    },
    enabled: !!user?.id
  });

  const getSetterName = (meeting: any) => {
    if (meeting.logged_by_manager_id && meeting.logged_by_manager_id === user?.id) {
      const name = managerProfile?.full_name || managerProfile?.email || "You";
      return `${name} (You)`;
    }
    if (!meeting.logged_by_setter_id && !meeting.setter_profile_id) {
      return "SDR Trialist";
    }

    const profile = setterProfiles?.find((s: any) =>
      s.user_id === meeting.logged_by_setter_id || s.id === meeting.setter_profile_id
    );

    return profile?.full_name || profile?.email || "Unknown Setter";
  };

  const managerLoggedCount = (meetings || []).filter(
    (m: any) => m.logged_by_manager_id && m.logged_by_manager_id === user?.id
  ).length;

  const getStatusBadge = (meeting: any) => {
    if (meeting.attendance_status === 'sat') {
      return <Pill variant="ok">Sat</Pill>;
    }
    if (meeting.attendance_status === 'no_show') {
      return <Pill variant="bad">No Show</Pill>;
    }
    if (meeting.attendance_status === 'rescheduled') {
      return <Pill variant="warn">Rescheduled</Pill>;
    }
    if (meeting.attendance_status === 'cancelled') {
      return <Pill variant="bad">Cancelled</Pill>;
    }
    if (meeting.approved_by_admin) {
      return <Pill variant="info">Approved</Pill>;
    }
    if (meeting.status === 'rejected') {
      return <Pill variant="bad">Rejected</Pill>;
    }
    return <Pill>Pending</Pill>;
  };

  const pendingMeetings = meetings?.filter(m => !m.approved_by_admin && m.status !== 'rejected') || [];
  const approvedMeetings = meetings?.filter(m => m.approved_by_admin && !['sat', 'no_show', 'rescheduled', 'cancelled'].includes(m.attendance_status)) || [];
  const historyMeetings = meetings?.filter(m => 
    ['sat', 'no_show', 'rescheduled', 'cancelled'].includes(m.attendance_status) || 
    m.status === 'rejected'
  ) || [];

  const filterBySearch = (list: any[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((m) =>
      m.company_name?.toLowerCase().includes(q) ||
      m.prospect_name?.toLowerCase().includes(q) ||
      m.client_profiles?.company_name?.toLowerCase().includes(q) ||
      getSetterName(m).toLowerCase().includes(q)
    );
  };

  const currentMeetings = filterBySearch(
    activeTab === 'pending' 
      ? pendingMeetings 
      : activeTab === 'approved' 
      ? approvedMeetings 
      : historyMeetings
  );

  const handleOpenStatusModal = (meeting: any) => {
    setSelectedMeeting(meeting);
    setShowUpdateStatusModal(true);
  };

  const handleOpenAssignModal = (meetingId: string) => {
    setAssignMeetingId(meetingId);
    setAssignModalOpen(true);
  };

  const handleOpenDetailDrawer = (meeting: any) => {
    setSelectedMeeting(meeting);
    setDetailDrawerOpen(true);
  };

  const handleStatusUpdated = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['sdr-manager-meetings'] });
  };

  const handleAssignmentComplete = () => {
    refetch();
    setAssignModalOpen(false);
  };

  const periodLabel = periodFilter === 'daily' ? 'Today' : periodFilter === 'weekly' ? 'This Week' : 'This Month';

  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
      <PageHeader
        title="Team Meetings"
        subtitle={`Meetings booked ${periodLabel.toLowerCase()} by your team`}
        actions={
          <div className="flex items-center gap-2">
            <ButtonV2 variant="primary" size="sm" onClick={() => setLogModalOpen(true)}>Log appointment</ButtonV2>
            <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Today</SelectItem>
                <SelectItem value="weekly">This Week</SelectItem>
                <SelectItem value="monthly">This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* KPI Summary */}
      <div className="mb-6">
        <StatStrip
          stats={[
            { label: "Total meetings", value: <>{meetings?.length || 0}{managerLoggedCount > 0 && <span className="ml-1 font-mono text-[12px] text-[var(--dim)]">+{managerLoggedCount}</span>}</>, caption: managerLoggedCount > 0 ? `${periodLabel} · +${managerLoggedCount} logged by you, team total only` : periodLabel },
            { label: "Pending approval", value: pendingMeetings.length, caption: periodLabel },
            { label: "Sat", value: meetings?.filter(m => m.attendance_status === 'sat').length || 0, caption: periodLabel },
            { label: "No shows", value: meetings?.filter(m => m.attendance_status === 'no_show').length || 0, caption: periodLabel },
          ]}
        />
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--dim)]" />
        <Input
          placeholder="Search by company, prospect, setter…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 rounded-none border-0 border-b border-[var(--line2)] bg-transparent pl-6 text-[12.5px] focus-visible:ring-0"
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="mb-4">
          <TabsTrigger value="pending">
            Pending ({pendingMeetings.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({approvedMeetings.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            History ({historyMeetings.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <Panel
            title={activeTab === 'pending' ? 'Pending approval' : activeTab === 'approved' ? 'Approved' : 'History'}
            meta={periodLabel}
            aside={<Pill variant={activeTab === 'pending' && currentMeetings.length > 0 ? 'warn' : 'default'}>{currentMeetings.length}</Pill>}
          >
            {isLoading ? (
              <div className="space-y-2 pt-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
            ) : currentMeetings.length === 0 ? (
              <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No meetings found for {periodLabel.toLowerCase()}</p>
            ) : (
              <RowList columns="128px minmax(0,1fr) auto">
                {currentMeetings.map((meeting) => (
                  <Row key={meeting.id} onClick={() => handleOpenDetailDrawer(meeting)}>
                    <RowNum className="text-[var(--dim)]">{format(new Date(meeting.meeting_date), 'd MMM')} · {String(meeting.meeting_time).slice(0, 5)}</RowNum>
                    <RowName
                      primary={<span className="flex flex-wrap items-center gap-[6px]">{meeting.company_name}{meeting.is_rebook && <Pill variant="warn">Rebook</Pill>}<Pill variant="info">{getLeadTypeConfig(meeting.lead_type).label}</Pill>{meeting.logged_by_manager_id && meeting.logged_by_manager_id === user?.id && <Pill variant="info">Logged by you</Pill>}{getStatusBadge(meeting)}</span>}
                      secondary={<>{meeting.prospect_name} · {getSetterName(meeting)}{meeting.created_at ? <span className="opacity-70"> · logged {format(new Date(meeting.created_at), 'd MMM')}</span> : null}{meeting.client_profiles?.company_name ? <span className="text-[var(--accent)]"> · {meeting.client_profiles.company_name}</span> : null}</>}
                    />
                    <div className="flex items-center gap-[6px]" onClick={(e) => e.stopPropagation()}>
                      <ButtonV2 size="sm" variant="ghost" onClick={() => handleOpenDetailDrawer(meeting)}>View</ButtonV2>
                      {!hideClientAssignment && !meeting.client_profile_id && activeTab === 'pending' && (
                        <ButtonV2 size="sm" onClick={() => handleOpenAssignModal(meeting.id)}>Assign client</ButtonV2>
                      )}
                      {meeting.approved_by_admin && !['sat', 'no_show', 'rescheduled', 'cancelled'].includes(meeting.attendance_status) && (
                        <ButtonV2 size="sm" onClick={() => handleOpenStatusModal(meeting)}>Update status</ButtonV2>
                      )}
                    </div>
                  </Row>
                ))}
              </RowList>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      {selectedMeeting && (
        <UpdateMeetingStatusModal
          open={showUpdateStatusModal}
          onOpenChange={setShowUpdateStatusModal}
          meeting={selectedMeeting}
          onUpdated={handleStatusUpdated}
        />
      )}

      {assignMeetingId && (
        <ClientAssignmentModal
          open={assignModalOpen}
          onOpenChange={setAssignModalOpen}
          meetingId={assignMeetingId}
          onAssigned={handleAssignmentComplete}
        />
      )}

      {selectedMeeting && (
        <MeetingDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={setDetailDrawerOpen}
          meeting={selectedMeeting}
          onUpdate={handleStatusUpdated}
          onAssignClient={handleOpenAssignModal}
          getSetterName={getSetterName}
          hideClientAssignment={hideClientAssignment}
        />
      )}

      <LogManagerMeetingModal
        open={logModalOpen}
        onOpenChange={setLogModalOpen}
        onLogged={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['sdr-manager-meetings'] });
        }}
      />
      </PageContainer>
    </DashboardLayout>
  );
};

export default SDRManagerMeetings;
