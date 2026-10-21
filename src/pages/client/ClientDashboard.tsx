import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Panel, Row, RowList, RowName, StatStrip } from "@/components/ui-v2";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CampaignProgressTimeline,
  type CampaignProgressDemoData,
} from "@/components/client/CampaignProgressTimeline";
import { WeeklyGoalCard, type WeeklyGoalDemoData } from "@/components/client/WeeklyGoalCard";
import { CalendarReconnectBanner } from "@/components/client/CalendarReconnectBanner";
import { useGreeting } from "@/hooks/useGreeting";

export interface ClientDashboardMetrics {
  upcomingMeetings: number;
  meetingsSat: number;
  termsSent: number;
  vacanciesTakenOn: number;
  potentialPlacementFeeValue: number;
}

export interface ClientDashboardViewProps {
  loading: boolean;
  clientName: string | null;
  clientProfileId: string | null;
  metrics: ClientDashboardMetrics;
  onNavigate: (path: string) => void;
  campaignDemoData?: CampaignProgressDemoData;
  weeklyGoalDemoData?: WeeklyGoalDemoData;
}

export const ClientDashboardView = ({
  loading,
  clientName,
  clientProfileId,
  metrics,
  onNavigate,
  campaignDemoData,
  weeklyGoalDemoData,
}: ClientDashboardViewProps) => {
  const { greeting } = useGreeting();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <DashboardLayout role="client">
      <PageContainer>
        <PageHeader eyebrow="Client portal" title={`${greeting}, ${clientName || 'there'}`} subtitle="Your performance overview at a glance" />

        {/* 11 Sep: a broken calendar connection is raised here, not discovered at the next booking. */}
        <CalendarReconnectBanner clientProfileId={clientProfileId} enabled={!campaignDemoData} />

        <div className="space-y-6">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <StatStrip
              stats={[
                { label: "Pending meetings", value: <button type="button" className="hover:text-[var(--accent)]" onClick={() => onNavigate("/client/meetings")}>{metrics.upcomingMeetings}</button>, caption: "Upcoming and awaiting feedback" },
                { label: "Meetings sat", value: metrics.meetingsSat, caption: "Completed meetings" },
                { label: "Terms sent", value: metrics.termsSent, caption: "Terms documents sent" },
                { label: "Potential vacancies", value: metrics.vacanciesTakenOn, caption: "Vacancies in play" },
                { label: "Potential fees", value: formatCurrency(metrics.potentialPlacementFeeValue), caption: "Estimated revenue" },
              ]}
            />
          )}

          {/* Campaign Progress + Weekly Goal side by side */}
          {clientProfileId && (
            <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
              <CampaignProgressTimeline clientProfileId={clientProfileId} demoData={campaignDemoData} />
              <WeeklyGoalCard clientProfileId={clientProfileId} demoData={weeklyGoalDemoData} />
            </div>
          )}

          <Panel title="Go to">
            <RowList columns="1fr auto">
              <Row onClick={() => onNavigate("/client/meetings")}>
                <RowName primary="Meetings" secondary="Manage your meetings and feedback" />
                <span className="text-[11.5px] text-[var(--dim)]">Open →</span>
              </Row>
              <Row onClick={() => onNavigate("/client/resources")}>
                <RowName primary="Resources" secondary="Documents and materials" />
                <span className="text-[11.5px] text-[var(--dim)]">Open →</span>
              </Row>
            </RowList>
          </Panel>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

const ClientDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clientProfileId, setClientProfileId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    upcomingMeetings: 0,
    meetingsSat: 0,
    termsSent: 0,
    vacanciesTakenOn: 0,
    potentialPlacementFeeValue: 0
  });

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get client profile IDs linked to this user
      const { data: linkedProfiles } = await supabase
        .from("client_profile_users")
        .select("client_profile_id")
        .eq("user_id", user.id);

      const { data: directProfile } = await supabase
        .from("client_profiles")
        .select("id, contact_name, company_name, kpi_meetings_sat, terms_sent, vacancies_taken_on, potential_placement_fee_value")
        .eq("user_id", user.id)
        .maybeSingle();

      // Collect all profile IDs
      const allProfileIds = new Set<string>();
      linkedProfiles?.forEach(p => allProfileIds.add(p.client_profile_id));
      if (directProfile) allProfileIds.add(directProfile.id);

      const profileIdsArray = Array.from(allProfileIds);

      if (profileIdsArray.length === 0) {
        setLoading(false);
        return;
      }

      // Set the first client profile ID for the timeline
      setClientProfileId(profileIdsArray[0]);

      // Fetch the client's name from the profile
      const { data: profileForName } = await supabase
        .from("client_profiles")
        .select("contact_name, company_name")
        .eq("id", profileIdsArray[0])
        .maybeSingle();

      if (profileForName) {
        // Use contact_name if available, otherwise use company_name
        const name = profileForName.contact_name?.split(' ')[0] || profileForName.company_name;
        setClientName(name || null);
      }

      // Fetch CSM-managed metrics from client_profiles
      const { data: profileData } = await supabase
        .from("client_profiles")
        .select("kpi_meetings_sat, terms_sent, vacancies_taken_on, potential_placement_fee_value")
        .in("id", profileIdsArray);

      // Aggregate metrics across all linked profiles
      let meetingsSat = 0;
      let termsSent = 0;
      let vacanciesTakenOn = 0;
      let potentialPlacementFeeValue = 0;

      profileData?.forEach(profile => {
        meetingsSat += (profile as any).kpi_meetings_sat || 0;
        termsSent += (profile as any).terms_sent || 0;
        vacanciesTakenOn += (profile as any).vacancies_taken_on || 0;
        potentialPlacementFeeValue += (profile as any).potential_placement_fee_value || 0;
      });

      // Fetch upcoming meetings count. This tile mirrors the ClientMeetings
      // page's "upcoming" + "pending" buckets: approved by admin, not sat or
      // cancelled, not rejected by the client, and no feedback submitted yet.
      // NULL-safe: .neq() would silently drop rows where the column is NULL.
      const { data: meetingsData } = await supabase
        .from("meetings")
        .select("id")
        .in("client_profile_id", profileIdsArray)
        .eq("approved_by_admin", true)
        .or("attendance_status.is.null,attendance_status.not.in.(sat,cancelled)")
        .or("status.is.null,status.neq.client_rejected")
        .is("client_feedback_submitted_at", null);

      setMetrics({
        upcomingMeetings: meetingsData?.length || 0,
        meetingsSat,
        termsSent,
        vacanciesTakenOn,
        potentialPlacementFeeValue
      });
    } catch (error) {
      console.error("Failed to load metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ClientDashboardView
      loading={loading}
      clientName={clientName}
      clientProfileId={clientProfileId}
      metrics={metrics}
      onNavigate={navigate}
    />
  );
};

export default ClientDashboard;
