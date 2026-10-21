import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClientDashboardView } from "@/pages/client/ClientDashboard";
import { ClientMeetingsView } from "@/pages/client/ClientMeetings";
import { ClientWarmLeadsView } from "@/pages/client/ClientWarmLeads";
import { ClientLeadListsView } from "@/pages/client/ClientLeadLists";
import { ClientMetricsView } from "@/pages/client/ClientMetrics";
import { ClientCommunicationsView } from "@/pages/client/ClientCommunications";
import { ClientDocumentsView, type ClientDocument } from "@/pages/client/ClientDocuments";
import { ClientOnboardingView } from "@/pages/client/ClientOnboarding";
import type { ClientJourneyData } from "@/hooks/useClientJourney";
import {
  demoClient,
  demoDashboardMetrics,
  demoCampaignProgress,
  demoWeeklyGoal,
  demoUpcomingMeetings,
  demoPendingMeetings,
  demoSatMeetings,
  demoDeclinedMeetings,
  demoWarmLeads,
  demoLeadLists,
  demoMetricsTotals,
  demoWeeklyData,
  demoMonthlyData,
  demoCsmInfo,
  demoCatchups,
  demoDocuments,
  type DemoMeeting,
  demoJourney,
} from "@/lib/demoPortalData";

/**
 * AE demo portal — the REAL client-portal views rendered with fixture data.
 *
 * These routes are the demoed surface an AE shows live on discovery calls.
 * No Supabase import is allowed anywhere in this file or the fixtures —
 * isolation is structural (AE_DEMO_PORTAL_REV2_DESIGN.md). Interactions
 * that imply persistence are local-state only; nothing fake is "saved".
 */

const DEMO_BASE = "/ae/demo-portal";
const DEMO_PATHS = [
  "dashboard", "meetings", "warm-leads", "lead-lists",
  "onboarding", "metrics", "communications", "documents",
].map((p) => `${DEMO_BASE}/${p}`);

const useDemoNavigate = () => {
  const navigate = useNavigate();
  return (path: string) => {
    const target = path.replace("/client/", `${DEMO_BASE}/`);
    if (DEMO_PATHS.includes(target)) navigate(target);
  };
};

export const DemoDashboard = () => {
  const demoNavigate = useDemoNavigate();
  return (
    <ClientDashboardView
      loading={false}
      clientName={demoClient.contactFirstName}
      clientProfileId={demoClient.profileId}
      metrics={demoDashboardMetrics}
      onNavigate={demoNavigate}
      campaignDemoData={demoCampaignProgress}
      weeklyGoalDemoData={demoWeeklyGoal}
    />
  );
};

export const DemoMeetings = () => {
  // Accept/decline work against local fixture state so the portal feels
  // alive on a call — nothing persists anywhere.
  const [pending, setPending] = useState<DemoMeeting[]>(demoPendingMeetings);
  const [upcoming, setUpcoming] = useState<DemoMeeting[]>(demoUpcomingMeetings);
  const [declined, setDeclined] = useState<DemoMeeting[]>(demoDeclinedMeetings);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedMeeting, setSelectedMeeting] = useState<DemoMeeting | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackMeeting, setFeedbackMeeting] = useState<DemoMeeting | null>(null);

  const allActive = useMemo(
    () => [...upcoming, ...pending, ...demoSatMeetings],
    [upcoming, pending],
  );

  const meetingCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    allActive.forEach((m) => {
      map.set(m.meeting_date, (map.get(m.meeting_date) || 0) + 1);
    });
    return map;
  }, [allActive]);

  const meetingDates = useMemo(
    () => allActive.map((m) => new Date(m.meeting_date)),
    [allActive],
  );

  const selectedDateMeetings = useMemo(() => {
    if (!selectedDate) return [];
    const key = selectedDate.toISOString().slice(0, 10);
    return allActive.filter((m) => m.meeting_date === key);
  }, [selectedDate, allActive]);

  const openMeetingDetail = (meeting: DemoMeeting) => {
    setSelectedMeeting(meeting);
    setShowDetailModal(true);
  };

  return (
    <ClientMeetingsView
      upcomingMeetings={upcoming}
      pendingMeetings={pending}
      satHistoryMeetings={demoSatMeetings}
      declinedMeetings={declined}
      meetingDates={meetingDates}
      meetingCountByDate={meetingCountByDate}
      selectedDate={selectedDate}
      setSelectedDate={setSelectedDate}
      selectedDateMeetings={selectedDateMeetings}
      selectedMeeting={selectedMeeting}
      showDetailModal={showDetailModal}
      setShowDetailModal={setShowDetailModal}
      showFeedbackModal={showFeedbackModal}
      setShowFeedbackModal={setShowFeedbackModal}
      feedbackMeeting={feedbackMeeting}
      setFeedbackMeeting={setFeedbackMeeting}
      openMeetingDetail={openMeetingDetail}
      handleDownloadJobSpec={async () => undefined}
      loadMeetings={async () => undefined}
    />
  );
};

export const DemoWarmLeads = () => (
  <ClientWarmLeadsView loading={false} leads={demoWarmLeads} />
);

export const DemoLeadLists = () => {
  // Upload-form state is local so the fields type normally; submitting is inert.
  const [newListName, setNewListName] = useState("");
  const [newListNotes, setNewListNotes] = useState("");

  return (
    <ClientLeadListsView
      loading={false}
      uploading={false}
      leadLists={demoLeadLists}
      newListName={newListName}
      setNewListName={setNewListName}
      newListNotes={newListNotes}
      setNewListNotes={setNewListNotes}
      setSelectedFile={() => undefined}
      handleUploadLeadList={() => undefined}
    />
  );
};

export const DemoMetrics = () => {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  return (
    <ClientMetricsView
      loading={false}
      metrics={demoMetricsTotals}
      weeklyData={demoWeeklyData}
      monthlyData={demoMonthlyData}
      formatCurrency={formatCurrency}
    />
  );
};

export const DemoCommunications = () => (
  <ClientCommunicationsView
    loading={false}
    csmInfo={demoCsmInfo}
    catchups={demoCatchups}
    demo
  />
);

export const DemoDocuments = () => {
  const [previewDoc, setPreviewDoc] = useState<ClientDocument | null>(null);

  return (
    <ClientDocumentsView
      loading={false}
      documents={demoDocuments}
      previewDoc={previewDoc}
      previewUrl={null}
      previewLoading={false}
      onPreview={setPreviewDoc}
      onDownload={() => undefined}
      onClosePreview={() => setPreviewDoc(null)}
    />
  );
};

// Preview-only for now: `demo` makes the deck inert (cards cannot be completed,
// no Reset, no edit) so nothing here can reach Supabase. The completable,
// resettable version is the deck's sandbox mode, which lands with PR #226
// (ClientOnboardingSandbox + JourneySteps `sandbox`); once merged, point this
// at that mode with local step state so "Acting as Client" gets the full deck.
export const DemoOnboarding = () => {
  const navigate = useDemoNavigate();
  return (
    <ClientOnboardingView
      data={demoJourney as unknown as ClientJourneyData}
      completingStep={null}
      onCompleteStep={() => undefined}
      onOpenPortal={() => navigate("/client/dashboard")}
      demo
    />
  );
};
