import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveAeUserIds } from "@/lib/aeRoster";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";
import { capitalizeSetterName } from "@/lib/utils";
import { filterToSetterRoleIds } from "@/lib/setterRoleFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Medal, Award, ChevronDown } from "lucide-react";
import { Workspace } from "@/contexts/WorkspaceContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type TimePeriod = 'today' | 'this_week' | 'this_month';

const getDateRange = (period: TimePeriod) => {
  const now = new Date();
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'this_week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'this_month':
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
};

const periodLabels: Record<TimePeriod, string> = {
  today: 'Today',
  this_week: 'This Week',
  this_month: 'This Month'
};

interface DashboardLeaderboardProps {
  workspace: Workspace;
  department: string;
}

interface LeaderboardEntry {
  email: string;
  name: string;
  rank: number;
  meetings_booked: number;
  dials_made: number;
  talk_time_seconds: number;
  clients_won?: number;
  proposals_sent?: number;
  pitch_calls?: number;
}

export const DashboardLeaderboard = ({ workspace, department }: DashboardLeaderboardProps) => {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('this_month');
  const dateRange = getDateRange(timePeriod);

  // Fetch performance data for selected period (legacy sheet source — may be empty)
  const { data: performanceData } = useQuery({
    queryKey: ['dashboard-leaderboard-performance', department, timePeriod],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance')
        .select('*')
        .gte('date', format(dateRange.start, 'yyyy-MM-dd'))
        .lte('date', format(dateRange.end, 'yyyy-MM-dd'));
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch Close CRM telemetry — SOURCE OF TRUTH for dials / talk-time / connects.
  const { data: closeMetricsData } = useQuery({
    queryKey: ['dashboard-leaderboard-close', department, timePeriod],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setter_close_metrics')
        .select('close_user_id, date, dials, talk_time_seconds, connects_3_plus_mins')
        .gte('date', format(dateRange.start, 'yyyy-MM-dd'))
        .lte('date', format(dateRange.end, 'yyyy-MM-dd'));
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch ACTUAL meetings from meetings table by created_at (when booked)
  const { data: meetingsData } = useQuery({
    queryKey: ['dashboard-leaderboard-meetings', department, timePeriod],
    queryFn: async () => {
      let query = supabase
        .from('meetings')
        .select('setter_profile_id, logged_by_setter_id, created_at, is_rebook, meeting_date')
        .gte('created_at', format(dateRange.start, "yyyy-MM-dd'T'00:00:00"))
        .lte('created_at', format(dateRange.end, "yyyy-MM-dd'T'23:59:59"));
      // For daily view, exclude backdated meetings
      if (timePeriod === 'today') {
        query = query.gte('meeting_date', format(dateRange.start, 'yyyy-MM-dd'));
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });

  // Map UI department names to database department values
  const getDeptFilter = (dept: string) => {
    if (dept === 'sales' || dept === 'acquisition') return 'acquisition';
    return 'fulfilment';
  };
  
  const deptFilter = getDeptFilter(department);

  // Fetch setters profiles - only active setters in selected department
  const { data: settersProfiles } = useQuery({
    queryKey: ['dashboard-setters-profiles', deptFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setters_profiles')
        .select('*')
        .eq('active', true)
        .eq("is_test_account", false)
        .eq('department', deptFilter);
      if (error) throw error;
      const rows = data || [];
      // Restrict to users whose role is actually 'setter' — drops csm / ops /
      // dev / sdr_manager / account_executive even if they share the department.
      const setterRoleIds = await filterToSetterRoleIds(rows.map(r => r.user_id));
      return rows.filter(r => r.user_id && setterRoleIds.has(r.user_id));
    }
  });

  // Fetch Account Executive users (closers)
  const { data: aeUsers } = useQuery({
    queryKey: ['dashboard-ae-users'],
    queryFn: async () => {
      // Shared roster: role-holders + acting AEs (Marcus), minus offboarded.
      const userIds = await fetchActiveAeUserIds();
      if (!userIds.length) return [];
      
      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      
      if (profilesError) return [];
      return profiles || [];
    },
    enabled: workspace === 'closers'
  });

  // Fetch closer metrics (discovery logs for clients won, agreement_send_queue for proposals)
  const { data: closerMetrics } = useQuery({
    queryKey: ['dashboard-closer-metrics', timePeriod],
    queryFn: async () => {
      // Get clients won (converted from discovery calls)
      const { data: clientsWon } = await supabase
        .from('sales_discovery_logs')
        .select('*')
        .eq('converted_to_client', true)
        .gte('created_at', format(dateRange.start, 'yyyy-MM-dd'))
        .lte('created_at', format(dateRange.end, 'yyyy-MM-dd'));
      
      // Get proposals sent
      const { data: proposalsSent } = await supabase
        .from('agreement_send_queue')
        .select('*')
        .in('status', ['sent', 'completed'])
        .gte('created_at', format(dateRange.start, 'yyyy-MM-dd'))
        .lte('created_at', format(dateRange.end, 'yyyy-MM-dd'));
      
      // Get pitch calls (meetings marked as sat in acquisition)
      const { data: pitchCalls } = await supabase
        .from('meetings')
        .select('*')
        .eq('department', 'acquisition')
        .eq('status', 'sat')
        .gte('meeting_date', format(dateRange.start, 'yyyy-MM-dd'))
        .lte('meeting_date', format(dateRange.end, 'yyyy-MM-dd'));
      
      return {
        clientsWon: clientsWon?.length || 0,
        proposalsSent: proposalsSent?.length || 0,
        pitchCalls: pitchCalls?.length || 0
      };
    },
    enabled: workspace === 'closers'
  });

  // Calculate setter leaderboard
  const calculateSetterLeaderboard = (): LeaderboardEntry[] => {
    if (!settersProfiles) return [];
    
    const deptEmails = settersProfiles.map(sp => sp.email?.toLowerCase()).filter(Boolean);
    
    // Build maps: profile_id -> email, user_id -> email
    const profileIdToEmail = new Map<string, string>();
    const userIdToEmail = new Map<string, string>();
    settersProfiles.forEach(sp => {
      const email = sp.email?.toLowerCase();
      if (!email) return;
      if (sp.id) profileIdToEmail.set(sp.id, email);
      if (sp.user_id) userIdToEmail.set(sp.user_id, email);
    });
    
    // Count fresh + rebook meetings per setter email from meetings table (by created_at)
    const meetingCountsByEmail = new Map<string, { fresh: number; rebook: number }>();
    (meetingsData || []).forEach(m => {
      const email =
        (m.setter_profile_id ? profileIdToEmail.get(m.setter_profile_id) : null) ||
        (m.logged_by_setter_id ? userIdToEmail.get(m.logged_by_setter_id) : null);

      if (email && deptEmails.includes(email)) {
        const current = meetingCountsByEmail.get(email) || { fresh: 0, rebook: 0 };
        if (m.is_rebook) {
          current.rebook += 1;
        } else {
          current.fresh += 1;
        }
        meetingCountsByEmail.set(email, current);
      }
    });
    
    // Get dials/talk-time from setter_close_metrics (Close CRM) keyed by close_user_id
    const closeUidToEmail = new Map<string, string>();
    settersProfiles.forEach(sp => {
      const email = sp.email?.toLowerCase();
      if (email && sp.close_user_id) closeUidToEmail.set(String(sp.close_user_id), email);
    });
    const closeByEmail = new Map<string, { dials: number; talk_seconds: number; connects3: number }>();
    (closeMetricsData || []).forEach((r: any) => {
      const email = closeUidToEmail.get(String(r.close_user_id));
      if (!email || !deptEmails.includes(email)) return;
      const cur = closeByEmail.get(email) || { dials: 0, talk_seconds: 0, connects3: 0 };
      cur.dials += Number(r.dials || 0);
      cur.talk_seconds += Number(r.talk_time_seconds || 0);
      cur.connects3 += Number(r.connects_3_plus_mins || 0);
      closeByEmail.set(email, cur);
    });

    // Legacy sheet-sync rows (performance) — may be empty post-cutover; kept as fallback for meetings_sheet
    const filteredPerf = (performanceData || []).filter(p => {
      const email = p.email?.toLowerCase();
      return email && deptEmails.includes(email);
    });

    const grouped: Record<string, any> = {};

    // Initialize all dept setters
    settersProfiles.forEach(sp => {
      const email = sp.email?.toLowerCase();
      if (!email) return;
      grouped[email] = {
        email,
        name: capitalizeSetterName(email),
        meetings_app: 0,
        meetings_rebook: 0,
        meetings_sheet: 0,
        meetings_booked: 0,
        dials_made: 0,
        talk_time_seconds: 0
      };
    });

    // Aggregate Close telemetry → dials / talk time
    for (const [email, agg] of closeByEmail) {
      if (grouped[email]) {
        grouped[email].dials_made = agg.dials;
        grouped[email].talk_time_seconds = agg.talk_seconds;
      }
    }

    // Legacy sheet aggregation only powers meetings_sheet fallback now
    filteredPerf.forEach((row: any) => {
      const email = (row.email || "").toLowerCase();
      if (!email || !grouped[email]) return;
      grouped[email].meetings_sheet += row.meetings_booked || 0;
    });

    // Merge app meeting counts
    for (const [email, counts] of meetingCountsByEmail) {
      if (grouped[email]) {
        grouped[email].meetings_app = counts.fresh;
        grouped[email].meetings_rebook = counts.rebook;
      }
    }

    // Meetings: use the meetings table count for ALL periods (source of truth).
    // Fall back to legacy sheet value only if the app count is zero AND sheet > 0.
    Object.values(grouped).forEach((setter: any) => {
      setter.meetings_booked =
        setter.meetings_app > 0 ? setter.meetings_app : setter.meetings_sheet;
    });

    const sorted = Object.values(grouped).sort((a: any, b: any) => {
      if (b.meetings_booked !== a.meetings_booked) return b.meetings_booked - a.meetings_booked;
      if (b.dials_made !== a.dials_made) return b.dials_made - a.dials_made;
      return 0;
    });

    return sorted.map((setter: any, index: number) => ({
      email: setter.email,
      name: setter.name,
      meetings_booked: setter.meetings_booked,
      dials_made: setter.dials_made,
      talk_time_seconds: setter.talk_time_seconds,
      rank: index + 1
    }));
  };

  // Calculate closer leaderboard using actual AE users
  const calculateCloserLeaderboard = (): LeaderboardEntry[] => {
    if (!aeUsers || aeUsers.length === 0) return [];
    
    // For now, distribute metrics equally among AEs
    // In production, this would track per-AE metrics
    const totalClientsWon = closerMetrics?.clientsWon || 0;
    const totalProposals = closerMetrics?.proposalsSent || 0;
    const totalPitchCalls = closerMetrics?.pitchCalls || 0;
    
    const entries: LeaderboardEntry[] = aeUsers.map((ae, index) => ({
      email: ae.email || '',
      name: ae.full_name || ae.email?.split('@')[0] || 'Unknown',
      rank: index + 1,
      meetings_booked: 0,
      dials_made: 0,
      talk_time_seconds: 0,
      clients_won: totalClientsWon, // TODO: Track per-AE metrics
      proposals_sent: totalProposals,
      pitch_calls: totalPitchCalls
    }));
    
    // Sort by clients won
    return entries.sort((a, b) => (b.clients_won || 0) - (a.clients_won || 0))
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  };

  const leaderboard = workspace === 'setters' 
    ? calculateSetterLeaderboard() 
    : calculateCloserLeaderboard();

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Trophy className="h-4 w-4 text-yellow-400" />;
      case 2: return <Medal className="h-4 w-4 text-gray-400" />;
      case 3: return <Award className="h-4 w-4 text-amber-600" />;
      default: return <span className="text-xs text-muted-foreground w-4 text-center">{rank}</span>;
    }
  };

  const formatTalkTime = (seconds: number): string => {
    if (seconds === 0) return "0m";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            {workspace === 'setters' ? 'Setter Leaderboard' : 'Closer Leaderboard'}
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground">
                {periodLabels[timePeriod]}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-background border-border">
              <DropdownMenuItem 
                onClick={() => setTimePeriod('today')}
                className={timePeriod === 'today' ? 'bg-primary/10' : ''}
              >
                Today
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setTimePeriod('this_week')}
                className={timePeriod === 'this_week' ? 'bg-primary/10' : ''}
              >
                This Week
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setTimePeriod('this_month')}
                className={timePeriod === 'this_month' ? 'bg-primary/10' : ''}
              >
                This Month
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        {leaderboard.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">No data available</p>
        ) : (
          <div className="space-y-2">
            {/* Header row */}
            <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium pb-2 border-b border-border/50">
              <div className="col-span-1">#</div>
              <div className="col-span-4">Name</div>
              {workspace === 'setters' ? (
                <>
                  <div className="col-span-2 text-right">Meetings</div>
                  <div className="col-span-2 text-right">Dials</div>
                  <div className="col-span-3 text-right">Talk Time</div>
                </>
              ) : (
                <>
                  <div className="col-span-2 text-right">Won</div>
                  <div className="col-span-2 text-right">Proposals</div>
                  <div className="col-span-3 text-right">Pitch Calls</div>
                </>
              )}
            </div>
            
            {/* Data rows */}
            {leaderboard.slice(0, 10).map((entry) => (
              <div 
                key={entry.email} 
                className={`grid grid-cols-12 gap-2 py-2 text-sm items-center ${
                  entry.rank <= 3 ? 'bg-primary/5 -mx-4 px-4 rounded' : ''
                }`}
              >
                <div className="col-span-1 flex items-center">
                  {getRankIcon(entry.rank)}
                </div>
                <div className="col-span-4 truncate font-medium">
                  {entry.name}
                </div>
                {workspace === 'setters' ? (
                  <>
                    <div className="col-span-2 text-right tabular-nums">{entry.meetings_booked}</div>
                    <div className="col-span-2 text-right tabular-nums text-muted-foreground">{entry.dials_made}</div>
                    <div className="col-span-3 text-right tabular-nums text-muted-foreground">{formatTalkTime(entry.talk_time_seconds)}</div>
                  </>
                ) : (
                  <>
                    <div className="col-span-2 text-right tabular-nums">{entry.clients_won || 0}</div>
                    <div className="col-span-2 text-right tabular-nums text-muted-foreground">{entry.proposals_sent || 0}</div>
                    <div className="col-span-3 text-right tabular-nums text-muted-foreground">{entry.pitch_calls || 0}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
