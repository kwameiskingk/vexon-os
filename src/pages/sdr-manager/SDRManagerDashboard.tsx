import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchManagedSetterProfileIds } from "@/lib/managedRoster";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Meter, Panel, Pill, Row, RowList, RowName, RowNum } from "@/components/ui-v2";
import type { Health } from "@/components/ui-v2";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

import { Calendar, AlertTriangle, TrendingUp, TrendingDown, RefreshCw, PhoneCall, MessageSquare, ArrowUpDown } from "lucide-react";
// Table imports removed — using strip layout instead
import { TeamGoalCard } from "@/components/gamification/TeamGoalCard";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays, isToday } from "date-fns";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useGreeting } from "@/hooks/useGreeting";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";
import { TeamSummaryStrip } from "@/components/sdr-manager/TeamSummaryStrip";
import { useNavigate } from "react-router-dom";
import { useAutoSync } from "@/hooks/useAutoSync";
import { useAIInsights } from "@/hooks/useAIInsights";
import { AIFormattedText } from "@/components/ui/ai-formatted-text";

interface SetterWithStats {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  status: string | null;
  department: string | null;
  current_coaching_focus: string | null;
  last_coaching_session: string | null;
  kpi_health: 'good' | 'warning' | 'critical';
  meetings_booked: number;
  dials_made: number;
  scheduled_meetings: number;
  talk_time: number;
  connects?: number;
  connect_rate?: number;
  quality_convos?: number;
}

interface ActionItem {
  type: 'critical' | 'warning' | 'coaching' | 'follow_up' | 'positive';
  priority: 'high' | 'medium' | 'low';
  setter_name: string;
  setter_id: string;
  message: string;
  action: string;
  metric?: string;
}

const SDRManagerDashboard = () => {
  const { user } = useAuth();
  const { fullGreeting } = useGreeting();
  // The whole Overview follows the ACTIVE scope — the sidebar pill for
  // dual-department managers, identical to the old scalar for everyone else.
  // That includes the Setter Activity panel and the day tiles fed by the
  // assigned-setters roster below (ruling 2026-08-11): they must match the
  // KPI strip above them on the same page, not union across departments.
  const { activeScope: managerDepartment, isLoading: scopeLoading } = useSdrManagerScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isSyncing, setIsSyncing] = useState(false);

  useAutoSync(() => {
    queryClient.invalidateQueries({ queryKey: ['sdr-manager-assigned-setters'] });
    queryClient.invalidateQueries({ queryKey: ['sdr-manager-scheduled-meetings'] });
  });
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const focusClearedKey = `focus-cleared-${format(new Date(), 'yyyy-MM-dd')}`;
  const [focusCleared, setFocusCleared] = useState(() => {
    return localStorage.getItem(focusClearedKey) === 'true';
  });

  const handleClearFocus = () => {
    setFocusCleared(true);
    localStorage.setItem(focusClearedKey, 'true');
  };

  const handleSyncMetrics = async () => {
    setIsSyncing(true);
    try {
      queryClient.invalidateQueries({ queryKey: ['sdr-manager-assigned-setters'] });
      queryClient.invalidateQueries({ queryKey: ['sdr-manager-scheduled-meetings'] });
      toast.success("Refreshed.");
    } catch (error: any) {
      console.error('Refresh error:', error);
      toast.error("Refresh failed. Please try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch assigned setters with their stats — scoped to the active
  // department so Setter Activity matches the KPI strip above it.
  const { data: assignedSetters, isLoading } = useQuery({
    queryKey: ['sdr-manager-assigned-setters', user?.id, managerDepartment, format(selectedDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (!user?.id) return [];

      // Managed roster (assignments, or whole-department for acting admins)
      // wrapped back into the assignment shape so the code below is unchanged.
      const managedIds = await fetchManagedSetterProfileIds(user.id);
      const { data: managedProfiles, error: assignmentError } = managedIds.length
        ? await supabase
            .from('setters_profiles')
            .select('id, user_id, full_name, email, status, department, close_user_id, current_coaching_focus, last_coaching_session, is_test_account')
            .in('id', managedIds)
        : { data: [], error: null };

      if (assignmentError) throw assignmentError;
      const assignments = (managedProfiles ?? []).map((p: any) => ({
        setter_profile_id: p.id,
        department: p.department,
        setters_profiles: p,
      }));
      if (assignments.length === 0) return [];

      // Same department gate as the Metrics roster: the setter profile's own
      // department must match the active scope.
      const filteredAssignments = assignments.filter(
        (a) =>
          !(a.setters_profiles as any)?.is_test_account &&
          (a.setters_profiles as any)?.department === managerDepartment
      );
      if (filteredAssignments.length === 0) return [];

      // Get setter_ids (user_ids) and setter_profile_ids from the profiles
      const setterUserIds = filteredAssignments
        .map(a => (a.setters_profiles as any)?.user_id)
        .filter(Boolean);
      
      const setterProfileIds = filteredAssignments
        .map(a => (a.setters_profiles as any)?.id)
        .filter(Boolean);

      // Map profile_id → close_user_id for setter_close_metrics joins
      const profileIdToCloseId = new Map<string, string>(
        filteredAssignments
          .map((a) => {
            const profile = a.setters_profiles as any;
            return [profile?.id, profile?.close_user_id] as [string | undefined, string | undefined];
          })
          .filter(([profileId, closeId]) => !!profileId && !!closeId) as [string, string][]
      );
      const setterCloseIds = Array.from(new Set(Array.from(profileIdToCloseId.values())));

      // Query day-specific metrics in parallel:
      // - dials/talk_time/connects from setter_close_metrics (LIVE from Close, 5-min sync)
      // - scheduled meetings by meeting_date
      // - booked meetings by created_at (actual logging date)
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const dayStart = `${dateStr}T00:00:00`;
      const dayEnd = `${dateStr}T23:59:59.999`;

      const [closeMetrics, scheduledMeetings, profileBookedMeetings, setterBookedMeetings, loggedBookedMeetings] = await Promise.all([
        setterCloseIds.length > 0
          ? supabase
              .from('setter_close_metrics')
              .select('close_user_id, dials, talk_time_seconds, connects, connects_3_plus_mins')
              .in('close_user_id', setterCloseIds)
              .eq('date', dateStr)
              .then(({ data }) => data || [])
          : Promise.resolve([]),
        setterProfileIds.length > 0
          ? supabase
              .from('meetings')
              .select('setter_profile_id')
              .in('setter_profile_id', setterProfileIds)
              .eq('meeting_date', dateStr)
              .then(({ data }) => data || [])
          : Promise.resolve([]),
        setterProfileIds.length > 0
          ? supabase
              .from('meetings')
              .select('id, setter_profile_id, setter_id, logged_by_setter_id')
              .in('setter_profile_id', setterProfileIds)
              .gte('created_at', dayStart)
              .lte('created_at', dayEnd)
              .then(({ data }) => data || [])
          : Promise.resolve([]),
        setterUserIds.length > 0
          ? supabase
              .from('meetings')
              .select('id, setter_profile_id, setter_id, logged_by_setter_id')
              .in('setter_id', setterUserIds)
              .gte('created_at', dayStart)
              .lte('created_at', dayEnd)
              .then(({ data }) => data || [])
          : Promise.resolve([]),
        setterUserIds.length > 0
          ? supabase
              .from('meetings')
              .select('id, setter_profile_id, setter_id, logged_by_setter_id')
              .in('logged_by_setter_id', setterUserIds)
              .gte('created_at', dayStart)
              .lte('created_at', dayEnd)
              .then(({ data }) => data || [])
          : Promise.resolve([]),
      ]);

      const profileIdToUserId = new Map<string, string>(
        filteredAssignments
          .map((a) => {
            const profile = a.setters_profiles as any;
            return [profile?.id, profile?.user_id] as [string | undefined, string | undefined];
          })
          .filter(([profileId, userId]) => !!profileId && !!userId) as [string, string][]
      );

      // Aggregate Close metrics by close_user_id
      const closeMap = new Map<string, { dials: number; talk_time_seconds: number; connects: number; quality_convos: number }>();
      closeMetrics.forEach((p: any) => {
        if (!p.close_user_id) return;
        const cur = closeMap.get(p.close_user_id) || { dials: 0, talk_time_seconds: 0, connects: 0, quality_convos: 0 };
        closeMap.set(p.close_user_id, {
          dials: cur.dials + (p.dials || 0),
          talk_time_seconds: cur.talk_time_seconds + (p.talk_time_seconds || 0),
          connects: cur.connects + (p.connects || 0),
          quality_convos: cur.quality_convos + (p.connects_3_plus_mins || 0),
        });
      });
      // Map scheduled meetings by setter_profile_id (meeting date)
      const scheduledMap = new Map<string, number>();
      scheduledMeetings.forEach((m: any) => {
        if (!m.setter_profile_id) return;
        const current = scheduledMap.get(m.setter_profile_id) || 0;
        scheduledMap.set(m.setter_profile_id, current + 1);
      });

      // Map booked meetings by logging date (created_at)
      const bookedMeetings = Array.from(
        new Map(
          [...profileBookedMeetings, ...setterBookedMeetings, ...loggedBookedMeetings].map((m: any) => [m.id, m])
        ).values()
      );

      const bookedMap = new Map<string, number>();
      bookedMeetings.forEach((meeting: any) => {
        const bookedByUserId =
          meeting.logged_by_setter_id ||
          meeting.setter_id ||
          (meeting.setter_profile_id ? profileIdToUserId.get(meeting.setter_profile_id) : null);

        if (!bookedByUserId) return;
        bookedMap.set(bookedByUserId, (bookedMap.get(bookedByUserId) || 0) + 1);
      });

      return filteredAssignments.map(a => {
        const profile = a.setters_profiles as any;
        const closeId = profile?.close_user_id;
        const closeData = (closeId && closeMap.get(closeId)) || { dials: 0, talk_time_seconds: 0, connects: 0, quality_convos: 0 };
        const talkTimeMin = Math.round(closeData.talk_time_seconds / 60);
        const scheduled = scheduledMap.get(profile?.id) || 0;
        const booked = bookedMap.get(profile?.user_id) || 0;

        // Calculate KPI health based on daily performance (target: 2 meetings/day)
        const meetingTarget = 2;
        const meetingPercent = (booked / meetingTarget) * 100;

        let kpiHealth: 'good' | 'warning' | 'critical' = 'good';
        if (meetingPercent < 50) kpiHealth = 'critical';
        else if (meetingPercent < 80) kpiHealth = 'warning';

        const connectRate = closeData.dials > 0 ? (closeData.connects / closeData.dials) * 100 : 0;

        return {
          id: profile?.id,
          user_id: profile?.user_id,
          full_name: profile?.full_name,
          email: profile?.email,
          status: profile?.status,
          department: a.department || profile?.department,
          current_coaching_focus: profile?.current_coaching_focus,
          last_coaching_session: profile?.last_coaching_session,
          kpi_health: kpiHealth,
          meetings_booked: booked,
          dials_made: closeData.dials,
          scheduled_meetings: scheduled,
          talk_time: talkTimeMin,
          connects: closeData.connects,
          quality_convos: closeData.quality_convos,
          connect_rate: Math.round(connectRate * 10) / 10,
        } as SetterWithStats;
      });
    },
    // Wait for the scope to resolve so an acquisition manager's first fetch
    // isn't wasted on the fulfilment fallback.
    enabled: !!user?.id && !scopeLoading
  });

  // Fetch total booked meetings count for all setters
  const { data: totalBookedMeetings } = useQuery({
    queryKey: ['sdr-manager-total-booked', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      
      const setterProfileIds = await fetchManagedSetterProfileIds(user.id);
      if (setterProfileIds.length === 0) return 0;
      
      const { count } = await supabase
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .in('setter_profile_id', setterProfileIds);
        
      return count || 0;
    },
    enabled: !!user?.id
  });

  // Fetch upcoming coaching sessions
  const { data: upcomingSessions } = useQuery({
    queryKey: ['sdr-manager-upcoming-sessions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('coaching_sessions')
        .select(`
          id,
          session_date,
          session_type,
          setters_profiles (full_name)
        `)
        .eq('manager_user_id', user.id)
        .gte('session_date', format(new Date(), 'yyyy-MM-dd'))
        .order('session_date', { ascending: true })
        .limit(5);
      return data || [];
    },
    enabled: !!user?.id
  });

  // Fetch active PIPs
  const { data: activePIPs } = useQuery({
    queryKey: ['sdr-manager-active-pips', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const setterIds = await fetchManagedSetterProfileIds(user.id);
      if (setterIds.length === 0) return [];
      
      const { data } = await supabase
        .from('pip_records')
        .select(`
          id,
          start_date,
          reason,
          setters_profiles (full_name)
        `)
        .in('setter_profile_id', setterIds)
        .eq('status', 'active');
      return data || [];
    },
    enabled: !!user?.id
  });

  const setters = assignedSetters || [];

  // Fetch Start of Day submissions for assigned setters on the selected date
  const setterUserIdsForSoD = useMemo(
    () => setters.map((s) => s.user_id).filter(Boolean) as string[],
    [setters]
  );
  const { data: sodSubmissions = [], isLoading: sodLoading } = useQuery({
    queryKey: ['sdr-manager-sod', setterUserIdsForSoD.join(','), format(selectedDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (setterUserIdsForSoD.length === 0) return [];
      const { data } = await supabase
        .from('start_of_day_submissions')
        .select('id, user_id, mood, planned_activities, top_priorities, success_definition, blockers, anything_else, submitted_at, uk_submitted_at, missed')
        .in('user_id', setterUserIdsForSoD)
        .eq('date', format(selectedDate, 'yyyy-MM-dd'))
        .order('submitted_at', { ascending: false });
      return data || [];
    },
    enabled: setterUserIdsForSoD.length > 0,
  });
  const totalSetters = setters.length;
  const activeSetters = setters.filter(s => s.status === 'active').length;
  const trainees = setters.filter(s => s.status === 'trainee').length;
  const onPIP = setters.filter(s => s.status === 'pip').length;
  const criticalKPI = setters.filter(s => s.kpi_health === 'critical');
  const warningKPI = setters.filter(s => s.kpi_health === 'warning');

  // Calculate scheduled meetings for today
  const totalScheduledMeetings = setters.reduce((sum, s) => sum + s.scheduled_meetings, 0);
  
  // Calculate total meetings booked for the selected day
  const totalMeetingsBooked = setters.reduce((sum, s) => sum + s.meetings_booked, 0);
  const totalDials = setters.reduce((sum, s) => sum + s.dials_made, 0);

  // Calculate team talk time (in minutes)
  const totalTalkTime = setters.reduce((sum, s) => sum + s.talk_time, 0);
  
  // Format talk time as hours:minutes
  const formatTalkTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Generate real-time metric-based insights for Today's Focus
  // Time-aware, status-aware, with positive recognition
  const generateActionItems = (): ActionItem[] => {
    const items: ActionItem[] = [];
    const dailyMeetingTarget = 2;
    const dailyDialTarget = 150;
    const dailyTalkTarget = 90; // minutes (standardized target)

    // Calculate time-of-day progress factor (0-1) based on work hours 8am-6pm
    const now = new Date();
    const currentHour = now.getHours();
    const isViewingToday = isToday(selectedDate);
    // How far through the workday are we (clamped 0-1)
    const dayProgress = isViewingToday
      ? Math.min(1, Math.max(0, (currentHour - 8) / 10))
      : 1; // If viewing a past date, expect full-day targets
    const isEarlyMorning = isViewingToday && currentHour < 10;

    // Scale targets by time of day so we don't flag everyone at 9am
    const expectedDials = Math.round(dailyDialTarget * dayProgress);
    const expectedTalk = Math.round(dailyTalkTarget * dayProgress);
    // Meetings can happen any time, but don't expect them before 10am
    const expectedMeetings = isEarlyMorning ? 0 : Math.max(1, Math.round(dailyMeetingTarget * dayProgress));

    setters.forEach(setter => {
      const isTrainee = setter.status === 'trainee';
      const isPIP = setter.status === 'pip';
      // Trainees get 60% of targets
      const targetMultiplier = isTrainee ? 0.6 : 1;
      const adjDialTarget = Math.round(expectedDials * targetMultiplier);
      const adjMeetingTarget = Math.round(expectedMeetings * targetMultiplier);
      const adjTalkTarget = Math.round(expectedTalk * targetMultiplier);

      // Skip zero-activity alerts if it's too early in the day
      if (isEarlyMorning) {
        // Only flag PIP setters who have 0 activity even in the morning
        if (isPIP && setter.dials_made === 0) {
          items.push({
            type: 'warning', priority: 'medium',
            setter_name: setter.full_name, setter_id: setter.id,
            message: `${setter.full_name} (PIP) hasn't started dialing yet — early check-in recommended`,
            action: 'Quick message to confirm they are set up and ready',
            metric: 'PIP · 0 dials'
          });
        }
      } else {
        // ── Critical: Zero activity well into the day ──
        if (setter.dials_made === 0 && setter.meetings_booked === 0 && dayProgress > 0.2) {
          items.push({
            type: 'critical', priority: 'high',
            setter_name: setter.full_name, setter_id: setter.id,
            message: `${setter.full_name}${isPIP ? ' (PIP)' : isTrainee ? ' (Trainee)' : ''} has zero activity — no dials or meetings recorded`,
            action: isPIP
              ? 'Urgent: PIP setter with no activity — escalate immediately'
              : 'Immediate check-in: confirm availability and remove blockers',
            metric: '0 activity'
          });
        }

        // ── High effort, no conversions ──
        else if (setter.meetings_booked === 0 && setter.dials_made >= adjDialTarget * 0.5 && adjMeetingTarget > 0) {
          items.push({
            type: 'warning', priority: 'high',
            setter_name: setter.full_name, setter_id: setter.id,
            message: `${setter.full_name} has ${setter.dials_made} dials but 0 meetings — putting in effort but not converting`,
            action: isTrainee
              ? 'Sit in on their next few calls to coach pitch delivery'
              : 'Review call recordings: focus on qualifying and closing for the meeting',
            metric: `${setter.dials_made} dials / 0 mtgs`
          });
        }

        // ── Some dials but well behind pace ──
        else if (setter.meetings_booked === 0 && setter.dials_made > 0 && setter.dials_made < adjDialTarget * 0.3 && dayProgress > 0.3) {
          items.push({
            type: 'warning', priority: 'high',
            setter_name: setter.full_name, setter_id: setter.id,
            message: `${setter.full_name} only has ${setter.dials_made} dials and 0 meetings — significantly behind pace`,
            action: 'Check in: understand blockers and push for activity ramp-up',
            metric: `${setter.dials_made}/${adjDialTarget} dials`
          });
        }

        // ── Below meeting target (has some meetings but behind) ──
        else if (setter.meetings_booked > 0 && adjMeetingTarget > 0 && setter.meetings_booked < adjMeetingTarget) {
          items.push({
            type: 'follow_up', priority: 'medium',
            setter_name: setter.full_name, setter_id: setter.id,
            message: `${setter.full_name} at ${setter.meetings_booked} meeting${setter.meetings_booked > 1 ? 's' : ''} — needs ${adjMeetingTarget - setter.meetings_booked} more to hit daily pace`,
            action: 'Encourage push in remaining hours; review pipeline quality',
            metric: `${setter.meetings_booked}/${dailyMeetingTarget} mtgs`
          });
        }
      }

      // ── Short conversations pattern (any time of day) ──
      if (setter.dials_made > 40 && setter.talk_time > 0 && setter.talk_time < adjTalkTarget * 0.25 && !isEarlyMorning) {
        const avgCallSecs = Math.round((setter.talk_time * 60) / setter.dials_made);
        if (!items.some(i => i.setter_id === setter.id && i.priority === 'high')) {
          items.push({
            type: 'follow_up', priority: 'medium',
            setter_name: setter.full_name, setter_id: setter.id,
            message: `${setter.full_name} averaging ~${avgCallSecs}s per call — conversations are ending too quickly`,
            action: 'Review opening pitch; practice hooking the prospect in first 30 seconds',
            metric: `~${avgCallSecs}s avg`
          });
        }
      }

      // ── Long calls, low conversion (quality issue) ──
      if (setter.talk_time > adjTalkTarget && setter.meetings_booked < Math.max(1, adjMeetingTarget * 0.5) && !isEarlyMorning) {
        if (!items.some(i => i.setter_id === setter.id && i.type === 'critical')) {
          items.push({
            type: 'follow_up', priority: 'medium',
            setter_name: setter.full_name, setter_id: setter.id,
            message: `${setter.full_name} has ${formatTalkTime(setter.talk_time)} talk time but only ${setter.meetings_booked} meeting(s) — spending too long on each call`,
            action: 'Coach on tighter qualifying and closing for the booking sooner',
            metric: `${formatTalkTime(setter.talk_time)} / ${setter.meetings_booked} mtgs`
          });
        }
      }

      // ── Coaching overdue ──
      if (setter.last_coaching_session) {
        const daysSince = Math.floor((Date.now() - new Date(setter.last_coaching_session).getTime()) / (1000 * 60 * 60 * 24));
        const threshold = isPIP ? 5 : isTrainee ? 5 : 10;
        if (daysSince > threshold && !items.some(i => i.setter_id === setter.id && i.priority === 'high')) {
          items.push({
            type: 'coaching', priority: isPIP || isTrainee ? 'medium' : 'low',
            setter_name: setter.full_name, setter_id: setter.id,
            message: `${setter.full_name}${isPIP ? ' (PIP)' : isTrainee ? ' (Trainee)' : ''} — last coaching ${daysSince} days ago`,
            action: isPIP
              ? 'PIP requires regular coaching — schedule ASAP'
              : 'Schedule a coaching session this week',
            metric: `${daysSince}d ago`
          });
        }
      } else if (!setter.last_coaching_session) {
        // Never had coaching
        if (isTrainee || isPIP) {
          items.push({
            type: 'coaching', priority: 'medium',
            setter_name: setter.full_name, setter_id: setter.id,
            message: `${setter.full_name}${isTrainee ? ' (Trainee)' : ' (PIP)'} has never had a coaching session`,
            action: 'Schedule first coaching session — this is a priority',
            metric: 'No sessions'
          });
        }
      }

      // ── Positive: Exceeding targets ──
      if (setter.meetings_booked >= dailyMeetingTarget && setter.dials_made >= expectedDials * 0.8) {
        items.push({
          type: 'positive', priority: 'low',
          setter_name: setter.full_name, setter_id: setter.id,
          message: `${setter.full_name} already at ${setter.meetings_booked} meetings with ${setter.dials_made} dials — strong performance`,
          action: 'Acknowledge in team chat; ask what\'s working to share with others',
          metric: `${setter.meetings_booked} mtgs ✓`
        });
      }
    });

    // De-duplicate: keep only the highest priority item per setter (except positive)
    const bestPerSetter = new Map<string, ActionItem>();
    const positiveItems: ActionItem[] = [];
    const priorityOrder = { high: 0, medium: 1, low: 2 };

    items.forEach(item => {
      if (item.type === 'positive') {
        positiveItems.push(item);
        return;
      }
      const existing = bestPerSetter.get(item.setter_id);
      if (!existing || priorityOrder[item.priority] < priorityOrder[existing.priority]) {
        bestPerSetter.set(item.setter_id, item);
      }
    });

    const deduped = [...bestPerSetter.values(), ...positiveItems];

    return deduped.sort((a, b) => {
      // Positive items always last
      if (a.type === 'positive' && b.type !== 'positive') return 1;
      if (b.type === 'positive' && a.type !== 'positive') return -1;
      const diff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (diff !== 0) return diff;
      const typeOrder: Record<string, number> = { critical: 0, warning: 1, follow_up: 2, coaching: 3, positive: 4 };
      return (typeOrder[a.type] ?? 4) - (typeOrder[b.type] ?? 4);
    });
  };

  const actionItems = focusCleared ? [] : generateActionItems();

  // Fetch approved/active leave requests covering today
  const { data: activeLeaveData } = useQuery({
    queryKey: ['active-leave-for-ai', format(selectedDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data } = await supabase
        .from('employee_leave_requests')
        .select('full_name, reason, leave_start_date, return_date, leave_days_amount, status')
        .in('status', ['approved', 'pending'])
        .lte('leave_start_date', dateStr)
        .gt('return_date', dateStr);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // AI-powered Today's Focus insights — sourced from LIVE Close.io data (5-min sync)
  const aiMetricsPayload = useMemo(() => {
    return setters.map(s => ({
      name: s.full_name,
      meetings_booked: s.meetings_booked,
      dials_made: s.dials_made,
      talk_time: s.talk_time,
      connects: s.connects ?? 0,
      connect_rate: s.connect_rate ?? 0,
      quality_convos: s.quality_convos ?? 0,
      kpi_health: s.kpi_health,
    }));
  }, [setters]);

  const { data: aiInsight, isLoading: aiLoading, refresh: refreshAI } = useAIInsights({
    setterMetrics: aiMetricsPayload,
    timeRange: isToday(selectedDate) ? 'today' : format(selectedDate, 'yyyy-MM-dd'),
    analysisType: 'today_focus',
    enabled: false,
    leaveData: activeLeaveData,
  });

  // Parse AI today_focus response (expects JSON array)
  const aiActionItems = useMemo(() => {
    if (!aiInsight) return null;
    try {
      // Try to extract JSON array from the response
      const jsonMatch = aiInsight.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as { priority: string; message: string; setter_name: string }[];
      }
    } catch {
      // If not parseable as JSON, return as text
    }
    return null;
  }, [aiInsight]);

  const [focusOpen, setFocusOpen] = useState(true);
  const [sortField, setSortField] = useState<'full_name' | 'dials_made' | 'talk_time' | 'meetings_booked' | 'conversion'>('full_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');


  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'full_name' ? 'asc' : 'desc');
    }
  };

  const sortedSetters = useMemo(() => {
    return [...setters].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      if (sortField === 'conversion') {
        aVal = a.dials_made > 0 ? a.meetings_booked / a.dials_made : 0;
        bVal = b.dials_made > 0 ? b.meetings_booked / b.dials_made : 0;
      } else if (sortField === 'full_name') {
        aVal = a.full_name?.toLowerCase() || '';
        bVal = b.full_name?.toLowerCase() || '';
      } else {
        aVal = a[sortField] || 0;
        bVal = b[sortField] || 0;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [setters, sortField, sortDir]);

  const getHealthBadge = (health: string) => {
    switch (health) {
      case 'good':
        return <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">Good</Badge>;
      case 'warning':
        return <Badge variant="default" className="bg-amber-500/20 text-amber-400 border-amber-500/30">Warning</Badge>;
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'active':
        return <Badge variant="success" className="text-[10px] px-1.5 py-0.5">Active</Badge>;
      case 'trainee':
        return <Badge variant="default" className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0.5">Trainee</Badge>;
      case 'pip':
        return <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">PIP</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">{status || '—'}</Badge>;
    }
  };

  const getActionIcon = (type: ActionItem['type']) => {
    switch (type) {
      case 'critical':
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'coaching':
        return <MessageSquare className="h-4 w-4 text-primary" />;
      case 'follow_up':
        return <PhoneCall className="h-4 w-4 text-blue-500" />;
      case 'positive':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
    }
  };

  const getActionBg = (type: ActionItem['type']) => {
    switch (type) {
      case 'critical':
        return 'bg-destructive/10 border-destructive/20';
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/20';
      case 'coaching':
        return 'bg-primary/10 border-primary/20';
      case 'follow_up':
        return 'bg-blue-500/10 border-blue-500/20';
      case 'positive':
        return 'bg-green-500/10 border-green-500/20';
    }
  };

  const SortHeader = ({ field, children }: { field: typeof sortField; children: React.ReactNode }) => (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => handleSort(field)}
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-primary' : 'text-muted-foreground/50'}`} />
    </button>
  );

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title={fullGreeting}
          subtitle={`Snapshot for ${format(selectedDate, 'EEEE, MMMM d, yyyy')}`}
          actions={
            <TooltipProvider>
              <div className="flex items-center gap-1.5">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <ButtonV2 size="sm" aria-label="Filter by date"><Calendar className="h-3.5 w-3.5" /></ButtonV2>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Filter by date</TooltipContent>
                  </Tooltip>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedDate(date);
                          setCalendarOpen(false);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ButtonV2 size="sm" onClick={handleSyncMetrics} disabled={isSyncing} aria-label="Sync metrics">
                      <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    </ButtonV2>
                  </TooltipTrigger>
                  <TooltipContent>Sync metrics</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          }
        />

        {/* TEAM SUMMARY STRIP — real team-vs-target figures (this week),
            replacing the old hardcoded KPI cards (2026-08-06 team-tiles). */}
        {user?.id && <TeamSummaryStrip managerUserId={user.id} department={managerDepartment} />}

        {/* START OF DAY + COACHING */}
        <div className="mb-7 grid gap-7 lg:grid-cols-[1fr_300px]">
          <Panel
            title="Start of Day submissions"
            meta={`${sodSubmissions.filter((s: any) => !s.missed).length} of ${setters.length} in`}
            aside={<button type="button" className="text-[11.5px] text-[var(--dim)] hover:text-[var(--ink)]" onClick={() => navigate('/sdr-manager/attendance')}>View all →</button>}
          >
            {sodLoading ? (
              <div className="space-y-2 pt-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : sodSubmissions.length === 0 ? (
              <p className="py-[18px] text-[12px] text-[var(--dim)]">
                No Start of Day submissions for {isToday(selectedDate) ? 'today' : format(selectedDate, 'MMM d')} yet
              </p>
            ) : (
              <RowList columns="1fr auto">
                {sodSubmissions.map((sub: any) => {
                  const setter = setters.find((s) => s.user_id === sub.user_id);
                  const moodMap: Record<string, { health: Health; label: string }> = {
                    very_happy: { health: 'ok', label: 'Very happy' },
                    happy: { health: 'ok', label: 'Happy' },
                    neutral: { health: 'warn', label: 'Neutral' },
                    unhappy: { health: 'bad', label: 'Unhappy' },
                    very_unhappy: { health: 'bad', label: 'Very unhappy' },
                  };
                  const mood = sub.mood ? moodMap[sub.mood] : null;
                  return (
                    <Row key={sub.id} health={sub.missed ? 'bad' : (mood?.health ?? 'none')} className="items-start">
                      <RowName
                        primary={<span className="flex flex-wrap items-center gap-[6px]">{setter?.full_name || 'Unknown'}{mood && <Pill variant={mood.health === 'ok' ? 'ok' : mood.health === 'warn' ? 'warn' : 'bad'}>{mood.label}</Pill>}{sub.missed && <Pill variant="bad">Missed</Pill>}</span>}
                        secondary={<>
                          {sub.top_priorities && <span className="block line-clamp-2"><span className="text-[var(--dim2)]">Priorities: </span>{sub.top_priorities}</span>}
                          {sub.blockers && <span className="block line-clamp-2 text-[var(--warn)]"><span className="text-[var(--dim2)]">Blockers: </span>{sub.blockers}</span>}
                        </>}
                      />
                      {sub.submitted_at && !sub.missed ? (
                        <RowNum className="text-[var(--dim)]">{format(new Date(sub.uk_submitted_at || sub.submitted_at), 'HH:mm')}</RowNum>
                      ) : <span />}
                    </Row>
                  );
                })}
              </RowList>
            )}
          </Panel>

          {/* Coaching sidebar */}
          <Panel title="Coaching" aside={upcomingSessions && upcomingSessions.length > 0 ? <Pill>{upcomingSessions.length}</Pill> : undefined}>
            {upcomingSessions && upcomingSessions.length > 0 ? (
              <RowList columns="1fr auto">
                {upcomingSessions.slice(0, 4).map((session: any) => (
                  <Row key={session.id} onClick={() => navigate('/sdr-manager/coaching')}>
                    <RowName primary={session.setters_profiles?.full_name} secondary={<span className="capitalize">{session.session_type?.replace('_', ' ')}</span>} />
                    <RowNum className="text-[var(--dim)]">{format(new Date(session.session_date), 'd MMM')}</RowNum>
                  </Row>
                ))}
              </RowList>
            ) : (
              <p className="py-[18px] text-[12px] text-[var(--dim)]">No upcoming sessions</p>
            )}
          </Panel>
        </div>

        {/* SETTER ACTIVITY — small multiples */}
        <div className="mb-7">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : setters.length === 0 ? (
            <Panel title="Setter activity"><p className="py-[18px] text-[12px] text-[var(--dim)]">No setters assigned</p></Panel>
          ) : (() => {
            const panels: { title: string; target: number; unit: string; getValue: (s: SetterWithStats) => number }[] = [
              { title: 'Dials', target: 150, unit: '', getValue: s => s.dials_made },
              { title: 'Talk time', target: 90, unit: 'min', getValue: s => s.talk_time },
              { title: 'Meetings', target: 2, unit: '', getValue: s => s.meetings_booked },
            ];
            return (
              <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
                {panels.map(panel => {
                  const avgVal = sortedSetters.reduce((s, st) => s + panel.getValue(st), 0) / Math.max(sortedSetters.length, 1);
                  return (
                    <Panel key={panel.title} title={panel.title} meta={`Today · target ${panel.target}${panel.unit === 'min' ? 'm' : ''} each`} aside={setters.length > 1 ? <Pill>avg {panel.unit === 'min' ? formatTalkTime(Math.round(avgVal)) : Math.round(avgVal)}</Pill> : undefined}>
                      <RowList columns="90px 1fr">
                        {sortedSetters.map(setter => {
                          const val = Math.round(panel.getValue(setter));
                          return (
                            <Row key={setter.id} onClick={() => navigate('/sdr-manager/setters')} health={setter.kpi_health === 'good' ? 'ok' : setter.kpi_health === 'warning' ? 'warn' : 'bad'} className="py-2">
                              <span className="truncate text-[12.5px] font-semibold">{(setter.full_name || setter.email || '—').split(' ')[0]}</span>
                              <Meter value={val} target={panel.target} label={`${setter.full_name} ${panel.title}`} />
                            </Row>
                          );
                        })}
                      </RowList>
                    </Panel>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* TEAM GOAL — scoped to the manager's own department */}
        <TeamGoalCard canManage department={managerDepartment} />

      </PageContainer>
    </DashboardLayout>
  );
};

export default SDRManagerDashboard;
