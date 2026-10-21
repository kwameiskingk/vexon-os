import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { KPICardSkeleton } from "@/components/dashboard/KPICardSkeleton";
import { AppointmentsOverview } from "@/components/dashboard/AppointmentsOverview";
import { TodaysCallsCard } from "@/components/dashboard/TodaysCallsCard";
import { ActionRequiredCard } from "@/components/dashboard/ActionRequiredCard";
import { QuickPulseCard } from "@/components/dashboard/QuickPulseCard";
import { RecentWinsCard } from "@/components/dashboard/RecentWinsCard";
import { AEDashboardV2 } from "@/components/ae/AEDashboardV2";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDepartment } from "@/contexts/DepartmentContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useGreeting } from "@/hooks/useGreeting";
import { useAutoSync } from "@/hooks/useAutoSync";

// Helper function to format talk time in hours and minutes from SECONDS
const formatTalkTime = (seconds: number): string => {
  if (seconds === 0) return "0h 0m";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
};

const AdminDashboard = () => {
  const { selectedDepartment } = useDepartment();
  const { selectedWorkspace } = useWorkspace();
  const { user, userRole, actingAs } = useAuth();
  const { fullGreeting } = useGreeting();
  const isAE = userRole === 'account_executive';
  
  // Setter KPIs
  const [totalDials, setTotalDials] = useState(0);
  const [totalTalkTime, setTotalTalkTime] = useState(0);
  const [totalConnects, setTotalConnects] = useState(0);
  const [connectRate, setConnectRate] = useState(0);
  const [connectsOver3Min, setConnectsOver3Min] = useState(0);
  const [meetingsBooked, setMeetingsBooked] = useState(0);
  const [rebooksCount, setRebooksCount] = useState(0);
  const [discoveryCallsToday, setDiscoveryCallsToday] = useState(0);
  const [followUpCallsToday, setFollowUpCallsToday] = useState(0);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [hasDataForDate, setHasDataForDate] = useState(true);

  // Check if it's before 9:15 AM UK time (morning meeting ends at 9:15)
  const isBeforeCutoffUK = (): boolean => {
    const ukTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/London' });
    const ukDate = new Date(ukTime);
    const hours = ukDate.getHours();
    const minutes = ukDate.getMinutes();
    return hours < 9 || (hours === 9 && minutes < 15);
  };

  // Get previous working date (skips weekends)
  const getPreviousWorkingDate = (dates: string[], referenceDate: Date): string | null => {
    const ukTime = new Date(referenceDate.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    const dayOfWeek = ukTime.getDay(); // 0 = Sunday, 1 = Monday
    const today = referenceDate.toISOString().split('T')[0];
    
    // Filter to dates before today
    const previousDates = dates.filter(d => d < today).sort((a, b) => b.localeCompare(a));
    if (previousDates.length === 0) return null;
    
    // On Monday, prefer Friday's data
    if (dayOfWeek === 1) {
      const friday = new Date(ukTime);
      friday.setDate(friday.getDate() - 3);
      const fridayStr = friday.toISOString().split('T')[0];
      if (previousDates.includes(fridayStr)) return fridayStr;
    }
    
    // Otherwise return most recent previous date
    return previousDates[0];
  };

  // Auto-sync on mount and every 1 hour
  useAutoSync(() => {
    setLastSyncTime(localStorage.getItem('lastGoogleSheetsSync'));
    loadAvailableDates();
    if (selectedDate) loadDashboardData();
  });

  useEffect(() => {
    loadAvailableDates();
    const savedSyncTime = localStorage.getItem('lastGoogleSheetsSync');
    if (savedSyncTime) {
      setLastSyncTime(savedSyncTime);
    }
  }, []);

  useEffect(() => {
    if (selectedDate !== undefined) {
      loadDashboardData();
      localStorage.setItem('adminDashboardSelectedDate', selectedDate.toISOString());
    }
  }, [selectedDate, selectedDepartment, selectedWorkspace]);

  // triggerInitialSync removed - handled by useAutoSync

  const loadAvailableDates = async () => {
    const { data: dateData } = await supabase
      .from("performance")
      .select("date")
      .order("date", { ascending: false });

    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    
    // Always include today in available dates
    const dbDates = dateData?.map(d => d.date) || [];
    const allDateStrings = Array.from(new Set([todayString, ...dbDates]));
    const uniqueDates = allDateStrings
      .sort((a, b) => b.localeCompare(a)) // Sort descending
      .map(d => new Date(d));
    
    setAvailableDates(uniqueDates);
    
    // Always default to today on page load - date picker auto-advances each day
    // Clear any stale localStorage date from previous days
    localStorage.removeItem('adminDashboardSelectedDate');
    setSelectedDate(today);
  };

  const loadDashboardData = async () => {
    if (!selectedDate) return;
    
    setIsLoading(true);
    setHasDataForDate(true);
    
    const targetDate = selectedDate.toISOString().split('T')[0];
    
    // Determine department filter
    const departmentFilter = selectedDepartment === 'sales' ? 'acquisition' : 'fulfilment';
    
    // Get setters in the selected department (with IDs and user_ids for meeting lookup)
    const { data: departmentSetters } = await supabase
      .from("setters_profiles")
      .select("id, user_id, email")
      .eq("active", true)
        .eq("is_test_account", false)
      .eq("department", departmentFilter);
    
    const departmentEmails = departmentSetters?.map(s => s.email.toLowerCase()) || [];
    const departmentSetterProfileIds = departmentSetters?.map(s => s.id) || [];
    const departmentUserIds = departmentSetters?.filter(s => s.user_id).map(s => s.user_id) || [];
    
    // Load performance data (for dials, talk time, connects - NOT meetings)
    const { data: allPerformanceData } = await supabase
      .from("performance")
      .select("*")
      .eq("date", targetDate)
      .in("email", departmentEmails)
      .order("created_at", { ascending: false });
    
    // Count meetings directly from meetings table by created_at date (when booked)
    const { data: meetingsData } = await supabase
      .from("meetings")
      .select("setter_profile_id, logged_by_setter_id, is_rebook, created_at, meeting_date")
      .gte("created_at", `${targetDate}T00:00:00`)
      .lte("created_at", `${targetDate}T23:59:59`)
      .gte("meeting_date", targetDate);
    
    // Filter to only department setters
    const deptMeetings = (meetingsData || []).filter(m => {
      return departmentSetterProfileIds.includes(m.setter_profile_id) || departmentUserIds.includes(m.logged_by_setter_id);
    });
    
    const freshMeetings = deptMeetings.filter(m => !m.is_rebook);
    const rebooks = deptMeetings.filter(m => m.is_rebook);

    // Discovery calls today: acquisition meetings with meeting_date = selected date
    const { count: discoveryCount } = await supabase
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .eq("meeting_date", targetDate)
      .eq("department", "acquisition");

    // Follow-up calls today: pitch_calls with pitch_call_date = today
    const { count: followUpCount } = await supabase
      .from("pitch_calls")
      .select("id", { count: "exact", head: true })
      .eq("pitch_call_date", targetDate);
    
    if ((!allPerformanceData || allPerformanceData.length === 0) && deptMeetings.length === 0) {
      setHasDataForDate(false);
      resetAllKPIs();
      setDiscoveryCallsToday(discoveryCount || 0);
      setFollowUpCallsToday(followUpCount || 0);
      setIsLoading(false);
      return;
    }
    
    // Group by email and take most recent record per setter
    const latestByEmail = new Map<string, any>();
    allPerformanceData?.forEach(record => {
      const email = record.email?.toLowerCase();
      if (email && !latestByEmail.has(email)) {
        latestByEmail.set(email, record);
      }
    });
    const performance = Array.from(latestByEmail.values());

    // Calculate setter KPIs (dials, talk time, connects from performance; meetings from meetings table)
    const totalDialsCalc = performance.reduce((sum, p) => sum + (p.dials_made || 0), 0);
    const totalTalkTimeSeconds = performance.reduce((sum, p) => sum + (p.call_duration_seconds || 0), 0);
    const totalConnectsCalc = performance.reduce((sum, p) => sum + (p.conversations || 0), 0);

    setTotalDials(totalDialsCalc);
    setTotalTalkTime(totalTalkTimeSeconds);
    setMeetingsBooked(freshMeetings.length);
    setRebooksCount(rebooks.length);
    setTotalConnects(totalConnectsCalc);
    setConnectRate(totalDialsCalc > 0 ? Math.round((totalConnectsCalc / totalDialsCalc) * 100) : 0);
    setConnectsOver3Min(0);
    setDiscoveryCallsToday(discoveryCount || 0);
    setFollowUpCallsToday(followUpCount || 0);
    
    setIsLoading(false);
  };

  const resetAllKPIs = () => {
    setTotalDials(0);
    setTotalTalkTime(0);
    setTotalConnects(0);
    setConnectRate(0);
    setConnectsOver3Min(0);
    setMeetingsBooked(0);
    setRebooksCount(0);
    setDiscoveryCallsToday(0);
    setFollowUpCallsToday(0);
  };

  const refreshData = async () => {
    setIsSyncing(true);
    try {
      await loadAvailableDates();
      if (selectedDate) await loadDashboardData();
      toast.success("Refreshed");
    } catch (error) {
      console.error("Error refreshing data:", error);
      toast.error(error instanceof Error ? error.message : "Failed to refresh data");
    } finally {
      setIsSyncing(false);
    }
  };

  // Dashboard title based on department and workspace
  const getDashboardTitle = () => {
    if (selectedDepartment === 'sales') {
      if (selectedWorkspace === 'closers') {
        return fullGreeting;
      }
      return fullGreeting;
    }
    return fullGreeting;
  };

  const getSubtitle = () => {
    if (selectedDepartment === 'sales' && selectedWorkspace === 'closers') {
      return "Here's what needs your attention today";
    }
    const dept = selectedDepartment === 'operations' ? 'Fulfilment' : 'Discovery and follow-up';
    return `${dept} appointments for ${format(new Date(), 'EEEE d MMMM yyyy')} and the week ahead`;
  };

  // Render Setter KPIs
  const renderCloserDashboard = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <TodaysCallsCard />
      <ActionRequiredCard />
      <QuickPulseCard />
      <RecentWinsCard />
    </div>
  );

  // Determine which KPIs to show
  const shouldShowCloserDashboard = selectedDepartment === 'sales' && selectedWorkspace === 'closers';
  const showWorkspaceSelector = selectedDepartment === 'sales';

  // If user is an AE — or an admin acting as one (2 Sep) — render the
  // dedicated AE dashboard. useAEDashboardData is subject-agnostic and
  // already includes the unassigned pool, so it works for the acting admin.
  if (isAE || actingAs === 'account_executive') {
    return (
      <DashboardLayout role="admin" showWorkspaceSelector={false}>
        <PageContainer>
          <AEDashboardV2 />
        </PageContainer>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" showWorkspaceSelector={showWorkspaceSelector}>
      <PageContainer>
        <PageHeader 
          title={getDashboardTitle()}
          subtitle={getSubtitle()}
        />
        <div className="space-y-5 animate-fade-in">

        {isLoading && shouldShowCloserDashboard ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <KPICardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            {/* 14 Oct 2026 (the owner): the setters view is the appointments-first
                Overview; the closers view (AE pages) is untouched until the AE
                recording. */}
            {shouldShowCloserDashboard ? (
              renderCloserDashboard()
            ) : (
              <AppointmentsOverview
                department={selectedDepartment === 'operations' ? 'fulfilment' : 'acquisition'}
                appointmentsPath={selectedDepartment === 'operations' ? '/admin/meetings' : '/admin/sales/meetings'}
              />
            )}
          </>
        )}

        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

export default AdminDashboard;
