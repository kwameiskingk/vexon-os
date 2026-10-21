import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";
import { Skeleton } from "@/components/ui/skeleton";
import { useGreeting } from "@/hooks/useGreeting";
import { useClientHealth } from "@/hooks/useNativeClientHealth";
import { useClientHealthOverrides, effectiveHealth } from "@/hooks/useClientHealthOverrides";
import { fetchTestSetterIds, isTestSetterMeeting } from "@/lib/testAccounts";

import { Calendar, UserCheck, AlertTriangle, Clock } from "lucide-react";

interface ClientHealthSummary {
  total: number;
  healthy: number;
  needsAttention: number;
  atRisk: number;
  avgHealthScore: number;
}

interface WeekSummary {
  meetingsLogged: number;
  meetingsSat: number;
  settersActive: number;
  approvalsPending: number;
}

interface ActionItem {
  type: 'at_risk' | 'reassignment' | 'pending_approval' | 'scheduled_today';
  count: number;
  label: string;
}

// Return only user_ids whose role is 'setter' — excludes csm/ops/dev/sdr_manager/account_executive
// users that happen to share the 'fulfilment' department.
async function filterToSetterRoleIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', userIds);
  return new Set((roles || []).filter((r) => r.role === 'setter').map((r) => r.user_id));
}





const CSMDashboard = () => {
  const navigate = useNavigate();
  const { fullGreeting } = useGreeting();

  // Sheet-driven snapshot is the source of truth for portfolio health
  const { data: snapshot, isLoading: snapshotLoading } = useClientHealth();
  const matchedIds = useMemo(
    () => (snapshot?.rows || []).map((r) => r.clientProfileId).filter(Boolean) as string[],
    [snapshot]
  );
  const { data: overrides } = useClientHealthOverrides(matchedIds);

  const healthSummary = useMemo<ClientHealthSummary | null>(() => {
    if (!snapshot) return null;
    let healthy = 0;
    let needsAttention = 0;
    let atRisk = 0;
    let unknown = 0;
    snapshot.rows.forEach((row) => {
      const override = row.clientProfileId ? overrides?.[row.clientProfileId] ?? null : null;
      const bucket = effectiveHealth(row.healthStatus, override);
      if (bucket === "green") healthy++;
      else if (bucket === "amber") needsAttention++;
      else if (bucket === "red") atRisk++;
      else unknown++;
    });
    const total = snapshot.rows.length;
    const known = total - unknown;
    const avgHealthScore = known > 0 ? Math.round((healthy / known) * 100) : 0;
    return { total, healthy, needsAttention, atRisk, avgHealthScore };
  }, [snapshot, overrides]);

  const healthLoading = snapshotLoading;

  // Fetch this week's summary
  const { data: weekSummary, isLoading: weekLoading } = useQuery({
    queryKey: ['csm-week-summary'],
    queryFn: async () => {
      const now = new Date();
      // Monday of this week
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - diff);
      weekStart.setHours(0, 0, 0, 0);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      // Counters fetch setter keys (not head-counts) so demo/test setters'
      // meetings never inflate the shared numbers.
      const testIds = await fetchTestSetterIds();

      // Meetings logged this week (fulfilment only)
      const { data: loggedRows } = await supabase
        .from('meetings')
        .select('id, setter_id, setter_profile_id, logged_by_setter_id')
        .eq('department', 'fulfilment')
        .gte('created_at', weekStartStr);
      const meetingsLogged = (loggedRows || []).filter((m) => !isTestSetterMeeting(m, testIds)).length;

      // Meetings SAT this week (fulfilment only)
      const { data: satRows } = await supabase
        .from('meetings')
        .select('id, setter_id, setter_profile_id, logged_by_setter_id')
        .eq('department', 'fulfilment')
        .eq('attendance_status', 'sat')
        .gte('meeting_date', weekStartStr);
      const meetingsSat = (satRows || []).filter((m) => !isTestSetterMeeting(m, testIds)).length;

      // Active setters (fulfilment) — only users whose role is 'setter'
      const { data: activeFulfilSetters } = await supabase
        .from('setters_profiles')
        .select('user_id')
        .eq('active', true)
        .eq('is_test_account', false)
        .eq('department', 'fulfilment');
      const activeIds = (activeFulfilSetters || []).map((s) => s.user_id).filter(Boolean) as string[];
      const setterRoleIds = await filterToSetterRoleIds(activeIds);
      const settersActive = setterRoleIds.size;



      // Pending approvals - fulfilment meetings not yet approved (exclude rejected/cancelled)
      const { data: pendingRows } = await supabase
        .from('meetings')
        .select('id, setter_id, setter_profile_id, logged_by_setter_id')
        .eq('department', 'fulfilment')
        .eq('approved_by_admin', false)
        .not('status', 'in', '("rejected","cancelled")');
      const approvalsPending = (pendingRows || []).filter((m) => !isTestSetterMeeting(m, testIds)).length;

      return {
        meetingsLogged: meetingsLogged || 0,
        meetingsSat: meetingsSat || 0,
        settersActive: settersActive || 0,
        approvalsPending: approvalsPending || 0
      } as WeekSummary;
    }
  });

  // Fetch top setters - hybrid: MAX(app-logged, sheet-synced) for current month
  const { data: topSetters, isLoading: settersLoading } = useQuery({
    queryKey: ['csm-top-setters'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      // Get fulfilment setters with their emails — only users whose role is 'setter'
      const { data: rawSetters } = await supabase
        .from('setters_profiles')
        .select('id, full_name, user_id, email, active')
        .eq('active', true)
        .eq("is_test_account", false)
        .eq('department', 'fulfilment');

      const rawIds = (rawSetters || []).map((s) => s.user_id).filter(Boolean) as string[];
      const setterRoleIds = await filterToSetterRoleIds(rawIds);
      const settersList = (rawSetters || []).filter((s) => s.user_id && setterRoleIds.has(s.user_id));

      if (settersList.length === 0) return [];


      // Fetch app-logged meetings this month per setter
      const { data: appMeetings } = await supabase
        .from('meetings')
        .select('setter_id, logged_by_setter_id')
        .eq('department', 'fulfilment')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd + 'T23:59:59');

      // Count app meetings per user_id
      const appCounts = new Map<string, number>();
      (appMeetings || []).forEach(m => {
        const uid = m.logged_by_setter_id || m.setter_id;
        if (uid) appCounts.set(uid, (appCounts.get(uid) || 0) + 1);
      });

      // Fetch sheet-synced meetings from performance table for the same month
      const setterEmails = settersList.map(s => s.email?.toLowerCase()).filter(Boolean) as string[];
      const { data: perfRecords } = await supabase
        .from('performance')
        .select('email, meetings_booked')
        .in('email', setterEmails)
        .gte('date', monthStart)
        .lte('date', monthEnd);

      // Sum sheet meetings per email
      const sheetCounts = new Map<string, number>();
      (perfRecords || []).forEach(p => {
        const email = p.email?.toLowerCase();
        if (email) sheetCounts.set(email, (sheetCounts.get(email) || 0) + (p.meetings_booked || 0));
      });

      // Hybrid: MAX(app, sheet) per setter
      const settersWithMeetings = settersList.map(setter => {
        const appCount = appCounts.get(setter.user_id) || 0;
        const sheetCount = sheetCounts.get(setter.email?.toLowerCase() || '') || 0;
        return { ...setter, meetings_booked: Math.max(appCount, sheetCount) };
      });

      return settersWithMeetings
        .sort((a, b) => b.meetings_booked - a.meetings_booked)
        .slice(0, 5);
    }
  });

  // Fetch action items
  const { data: actionItems, isLoading: actionsLoading } = useQuery({
    queryKey: ['csm-action-items'],
    queryFn: async () => {
      const items: ActionItem[] = [];

      // Active client list (used only for setter-assignment gap)
      const { data: allClients } = await supabase
        .from('client_profiles')
        .select('id')
        .eq('status', 'active');

      // Clients needing setter assignment — check both legacy assignments AND roster
      const thirtyDaysAgoStr = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const { data: clientsWithSetters } = await supabase
        .from('setter_client_assignments')
        .select('client_id')
        .eq('status', 'active');
      const { data: clientsWithRoster } = await supabase
        .from('roster_entries')
        .select('client_profile_id')
        .gte('roster_date', thirtyDaysAgoStr);

      const clientsWithSetterIds = new Set([
        ...(clientsWithSetters?.map(c => c.client_id) || []),
        ...(clientsWithRoster?.map(r => r.client_profile_id).filter(Boolean) || []),
      ]);
      const totalActive = allClients?.length || 0;
      const reassignmentNeeded = totalActive - clientsWithSetterIds.size;

      if (reassignmentNeeded > 0) {
        items.push({ type: 'reassignment', count: reassignmentNeeded, label: 'clients need setter assignment' });
      }

      // Pending approvals (demo/test setters' meetings excluded)
      const actionTestIds = await fetchTestSetterIds();
      const { data: pendingActionRows } = await supabase
        .from('meetings')
        .select('id, setter_id, setter_profile_id, logged_by_setter_id')
        .eq('department', 'fulfilment')
        .eq('approved_by_admin', false)
        .not('status', 'in', '("rejected","cancelled")');
      const pendingCount = (pendingActionRows || []).filter((m) => !isTestSetterMeeting(m, actionTestIds)).length;

      if (pendingCount && pendingCount > 0) {
        items.push({ type: 'pending_approval', count: pendingCount, label: 'meetings pending approval' });
      }

      // Today's scheduled meetings (demo/test setters' meetings excluded)
      const today = new Date().toISOString().split('T')[0];
      const { data: todayRows } = await supabase
        .from('meetings')
        .select('id, setter_id, setter_profile_id, logged_by_setter_id')
        .eq('department', 'fulfilment')
        .eq('meeting_date', today);
      const todayMeetings = (todayRows || []).filter((m) => !isTestSetterMeeting(m, actionTestIds)).length;

      if (todayMeetings && todayMeetings > 0) {
        items.push({ type: 'scheduled_today', count: todayMeetings, label: 'meetings scheduled for today' });
      }



      return items;
    }
  });

  const healthChartData = healthSummary ? [
    { name: 'Healthy', value: healthSummary.healthy, color: '#22c55e' },
    { name: 'Needs Attention', value: healthSummary.needsAttention, color: '#f59e0b' },
    { name: 'At Risk', value: healthSummary.atRisk, color: '#ef4444' },
  ].filter(d => d.value > 0) : [];

  // Merge sheet-driven at-risk count into action items
  const mergedActionItems = useMemo<ActionItem[]>(() => {
    const list: ActionItem[] = [];
    if (healthSummary && healthSummary.atRisk > 0) {
      list.push({ type: 'at_risk', count: healthSummary.atRisk, label: 'clients at risk' });
    }
    return [...list, ...(actionItems || [])];
  }, [healthSummary, actionItems]);


  const getActionIcon = (type: string) => {
    switch (type) {
      case 'at_risk': return <AlertTriangle className="h-4 w-4 text-red-400" />;
      case 'reassignment': return <UserCheck className="h-4 w-4 text-amber-400" />;
      case 'pending_approval': return <Clock className="h-4 w-4 text-blue-400" />;
      case 'scheduled_today': return <Calendar className="h-4 w-4 text-green-400" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const isLoading = healthLoading || weekLoading || settersLoading || actionsLoading;

  return (
    <DashboardLayout role="admin">
      <PageContainer>
      <div className="space-y-5">
        {/* Header */}
        <PageHeader
          title={fullGreeting}
          subtitle="Client Success Management Overview"
        />


        {healthLoading || weekLoading ? (
          <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
        ) : (
          <>
            <StatStrip
              stats={[
                { label: "Clients", value: healthSummary?.total || 0, caption: `${healthSummary?.healthy ?? 0} healthy · ${healthSummary?.needsAttention ?? 0} attention · ${healthSummary?.atRisk ?? 0} at risk` },
                { label: "Average health", value: `${healthSummary?.avgHealthScore || 0}%`, caption: "Share of scored clients that are healthy" },
                { label: "At risk", value: healthSummary?.atRisk || 0, caption: healthSummary?.atRisk ? "Open Clients to see who" : "Nobody at risk" },
              ]}
            />
            <StatStrip
              stats={[
                { label: "Meetings logged · wk", value: weekSummary?.meetingsLogged ?? 0 },
                { label: "Meetings sat · wk", value: weekSummary?.meetingsSat ?? 0 },
                { label: "Active setters", value: weekSummary?.settersActive ?? 0 },
                { label: "Pending approvals", value: weekSummary?.approvalsPending ?? 0, caption: "Open Appointments to resolve" },
              ]}
            />
          </>
        )}

        <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
          <Panel title="Top setters" meta="Fulfilment, by meetings booked this month" aside={<button type="button" className="text-[11.5px] text-[var(--dim)] hover:text-[var(--ink)]" onClick={() => navigate('/csm/setters')}>All setters →</button>}>
            {settersLoading ? (
              <div className="space-y-2 pt-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : topSetters && topSetters.length > 0 ? (
              <RowList columns="28px 1fr auto">
                {topSetters.map((setter, index) => (
                  <Row key={setter.id} onClick={() => navigate('/csm/setters')}>
                    <RowNum className="text-left text-[var(--dim)]">#{index + 1}</RowNum>
                    <RowName primary={setter.full_name || 'Unknown'} />
                    <RowNum>{setter.meetings_booked || 0} booked</RowNum>
                  </Row>
                ))}
              </RowList>
            ) : (
              <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No active setters</p>
            )}
          </Panel>

          <Panel title="Action required" aside={mergedActionItems.length > 0 ? <Pill variant="warn">{mergedActionItems.length}</Pill> : <Pill variant="ok">All caught up</Pill>}>
            {actionsLoading ? (
              <div className="space-y-2 pt-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : mergedActionItems.length > 0 ? (
              <RowList columns="1fr auto">
                {mergedActionItems.map((item, index) => (
                  <Row
                    key={index}
                    health={item.type === 'at_risk' ? 'bad' : item.type === 'pending_approval' || item.type === 'reassignment' ? 'warn' : 'none'}
                    onClick={() => {
                      if (item.type === 'at_risk') navigate('/csm/clients');
                      if (item.type === 'pending_approval') navigate('/csm/meetings');
                      if (item.type === 'reassignment') navigate('/csm/setters');
                      if (item.type === 'scheduled_today') navigate('/csm/meetings');
                    }}
                  >
                    <RowName primary={<><span className="font-mono">{item.count}</span> {item.label}</>} />
                    <span className="text-[11.5px] text-[var(--dim)]">Open →</span>
                  </Row>
                ))}
              </RowList>
            ) : (
              <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">All caught up.</p>
            )}
          </Panel>
        </div>
      </div>
      </PageContainer>
    </DashboardLayout>
  );
};

export default CSMDashboard;
