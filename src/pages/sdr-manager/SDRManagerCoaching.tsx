import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchManagedSetterProfileIds } from "@/lib/managedRoster";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth, differenceInDays } from "date-fns";
import CoachingSessionModal from "@/components/sdr-manager/CoachingSessionModal";
import LogCallReviewModal from "@/components/sdr-manager/LogCallReviewModal";
import CoachingSessionCard from "@/components/sdr-manager/CoachingSessionCard";
import CoachingSessionDrawer from "@/components/sdr-manager/CoachingSessionDrawer";
import CoachingStatsStrip from "@/components/sdr-manager/CoachingStatsStrip";

interface CoachingSession {
  id: string;
  session_date: string;
  session_time?: string | null;
  session_type: string;
  custom_session_label?: string | null;
  status?: string;
  observations?: string | null;
  improvements?: string | null;
  roleplay_notes?: string | null;
  action_items?: string[] | null;
  call_recording_link?: string | null;
  notes?: string | null;
  agenda?: string | null;
  overall_rating?: number | null;
  scorecard?: any;
  setter_self_reflection?: string | null;
  setters_profiles?: { full_name: string } | null;
  setter_profile_id?: string;
  manager_user_id?: string;
}

const SDRManagerCoaching = () => {
  const { user } = useAuth();
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showCallReviewModal, setShowCallReviewModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CoachingSession | null>(null);
  const [startInSessionMode, setStartInSessionMode] = useState(false);
  const [filterSetter, setFilterSetter] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const { data: assignedSetters } = useQuery({
    queryKey: ['sdr-manager-setters-for-coaching', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const managedIds = await fetchManagedSetterProfileIds(user.id);
      if (!managedIds.length) return [];
      const { data } = await supabase
        .from('setters_profiles')
        .select('id, full_name, last_coaching_session, department')
        .in('id', managedIds);
      return (data ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        last_coaching_session: p.last_coaching_session,
        department: p.department ?? null,
      }));
    },
    enabled: !!user?.id
  });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sdr-manager-coaching-sessions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('coaching_sessions')
        .select(`*, setters_profiles (id, full_name)`)
        .eq('manager_user_id', user.id)
        .order('session_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id
  });

  const { data: openActionItemsCount } = useQuery({
    queryKey: ['open-action-items-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count } = await supabase
        .from('coaching_action_items')
        .select('id', { count: 'exact', head: true })
        .eq('manager_user_id', user.id)
        .eq('status', 'open');
      return count || 0;
    },
    enabled: !!user?.id
  });

  // Compute stats
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const thisMonthSessions = (sessions || []).filter(s => {
    const d = new Date(s.session_date);
    return d >= monthStart && d <= monthEnd;
  });

  const completedThisMonth = thisMonthSessions.filter(s => s.status === 'completed').length;
  const scheduledThisMonth = thisMonthSessions.filter(s => s.status === 'scheduled').length;

  const ratingsThisMonth = thisMonthSessions
    .filter(s => s.status === 'completed' && s.overall_rating)
    .map(s => s.overall_rating!);
  const averageRating = ratingsThisMonth.length > 0
    ? ratingsThisMonth.reduce((a, b) => a + b, 0) / ratingsThisMonth.length
    : null;

  const settersNeedingAttention = (assignedSetters || [])
    .filter(s => {
      if (!s.last_coaching_session) return true;
      return differenceInDays(now, new Date(s.last_coaching_session)) >= 14;
    })
    .map(s => ({
      name: s.full_name,
      daysSince: s.last_coaching_session
        ? differenceInDays(now, new Date(s.last_coaching_session))
        : 999,
    }));

  // Filters
  const allSessions = sessions || [];
  const filteredSessions = allSessions.filter(s => {
    if (filterSetter !== 'all' && (s.setters_profiles as any)?.id !== filterSetter) return false;
    if (filterType !== 'all' && s.session_type !== filterType) return false;
    return true;
  });

  const scheduledSessions = filteredSessions.filter(s => s.status === 'scheduled');
  const completedSessions = filteredSessions.filter(s => s.status === 'completed');

  const getSessionTypeBadge = (type: string, customLabel?: string | null) => {
    const typeConfig: Record<string, { color: string; label: string }> = {
      'onboarding': { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Onboarding' },
      'weekly_1to1': { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Weekly 1:1' },
      'pip_review': { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'PIP Review' },
      'call_review': { color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', label: 'Call Review' },
      'custom': { color: 'bg-muted text-muted-foreground border-border', label: customLabel || 'Custom' },
    };
    const config = typeConfig[type] || { color: 'bg-muted text-muted-foreground', label: type };
    return <Badge variant="default" className={config.color}>{config.label}</Badge>;
  };

  const handleStartSession = (session: CoachingSession) => {
    setSelectedSession(session);
    setStartInSessionMode(true);
  };

  const handleViewSession = (session: CoachingSession) => {
    setSelectedSession(session);
    setStartInSessionMode(false);
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
      <PageHeader
        title="Training & 1-to-1s"
        subtitle="Schedule and manage training sessions and 1-to-1s with your team"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowNewSessionModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Schedule Session
            </Button>
            {/* The primary action (Marcus's 2 Sep spec): a call review IS the
                training now — mock-call/training framings retired. */}
            <Button onClick={() => setShowCallReviewModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Log a Call Review
            </Button>
          </div>
        }
      />

      {/* Stats Strip */}
      <div className="mb-6">
        <CoachingStatsStrip
          completedThisMonth={completedThisMonth}
          scheduledThisMonth={scheduledThisMonth}
          averageRating={averageRating}
          openActionItems={openActionItemsCount || 0}
          settersNeedingAttention={settersNeedingAttention}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <Select value={filterSetter} onValueChange={setFilterSetter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Setters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Setters</SelectItem>
            {/* Department suffix only when the (already union-shaped,
                assignment-based) roster spans more than one department. */}
            {(assignedSetters || []).map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.full_name}
                {new Set((assignedSetters || []).map(x => x.department).filter(Boolean)).size > 1 && s.department
                  ? ` · ${s.department === "acquisition" ? "Acquisition" : "Fulfilment"}`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="weekly_1to1">Weekly 1:1</SelectItem>
            <SelectItem value="pip_review">PIP Review</SelectItem>
            <SelectItem value="call_review">Call Review</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="scheduled" className="space-y-6">
        <TabsList>
          <TabsTrigger value="scheduled">
            Scheduled ({scheduledSessions.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedSessions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scheduled">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          ) : scheduledSessions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {scheduledSessions.map(session => (
                <CoachingSessionCard
                  key={session.id}
                  session={session}
                  getSessionTypeBadge={getSessionTypeBadge}
                  onClick={() => handleViewSession(session)}
                  onStartSession={() => handleStartSession(session)}
                />
              ))}
            </div>
          ) : (
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No sessions scheduled</p>
                <Button variant="outline" className="mt-4" onClick={() => setShowNewSessionModal(true)}>
                  Schedule a Session
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          ) : completedSessions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {completedSessions.map(session => (
                <CoachingSessionCard
                  key={session.id}
                  session={session}
                  getSessionTypeBadge={getSessionTypeBadge}
                  onClick={() => handleViewSession(session)}
                />
              ))}
            </div>
          ) : (
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No completed sessions yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <CoachingSessionModal
        open={showNewSessionModal}
        onClose={() => setShowNewSessionModal(false)}
        setters={assignedSetters || []}
        managerId={user?.id || ''}
      />

      <LogCallReviewModal
        open={showCallReviewModal}
        onClose={() => setShowCallReviewModal(false)}
        setters={assignedSetters || []}
        managerId={user?.id || ''}
      />

      <CoachingSessionDrawer
        open={!!selectedSession}
        onClose={() => { setSelectedSession(null); setStartInSessionMode(false); }}
        session={selectedSession}
        startInSessionMode={startInSessionMode}
      />
      </PageContainer>
    </DashboardLayout>
  );
};

export default SDRManagerCoaching;
