import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { endOfWeek, format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  SETTER_DEMO_BASE,
  SETTER_DEMO_PAGES,
  actingSetterDepartment,
  type SetterDepartment,
} from "@/lib/actingAs";
import { getInvoiceCycleStart } from "@/lib/payroll";
import { buildDemoSetter, type DemoSetterBundle } from "@/lib/demoSetterData";
import { SetterDashboardView, type OverviewMeeting } from "@/pages/setter/SetterDashboard";
import { SetterCoachingView, type CoachingSession } from "@/pages/setter/SetterCoaching";
import { SetterClientResponsibilityView } from "@/pages/setter/SetterClientResponsibility";
import {
  SetterMeetingsView,
  useSetterMeetingsUiState,
  applyRebook,
  resetMeetingWizard,
  bucketMeetings,
  toCalendarEvents,
  filterMeetingsToRange,
  meetingEventStyleGetter,
  getMeetingStatusLabel,
  getMeetingStatusBadgeVariant,
  type MeetingRecord,
} from "@/pages/setter/SetterMeetings";
import type { SetterMeetingDetailSheetDemo } from "@/components/setter/SetterMeetingDetailSheet";
import { SetterWarmLeadsView } from "@/pages/setter/SetterWarmLeads";
import { SetterEnrichmentView } from "@/pages/setter/SetterEnrichment";
import { SetterSettingsView, type SetterBankDetails, type SetterSettingsProfile } from "@/pages/setter/SetterSettings";

/**
 * Setter demo surface (3 Sep 2026) — the REAL setter-portal views rendered on
 * fixture data, for "Acting as SDR (Fulfilment)" / "Acting as SDR (Acquisition)".
 *
 * Marcus has no setter identity, so these routes let him audit what a setter
 * sees and can do without a fake login. Same rules as the AE demo portal:
 * every screen is the page's own <PageName>View component (never a copy),
 * no Supabase import is allowed in this file or in src/lib/demoSetterData.ts,
 * and anything that implies persistence is local state only. The department
 * comes from the hat; with no hat on (a dev poking at the URL) it defaults to
 * fulfilment.
 */

/** The warm-lead / enrichment Views take loosely-typed rows; the fixtures are plain objects. */
type DemoRow = Record<string, unknown>;

const useDemoDepartment = (): SetterDepartment => {
  const { actingAs } = useAuth();
  return actingSetterDepartment(actingAs) ?? "fulfilment";
};

const useDemoSetter = (): DemoSetterBundle => {
  const department = useDemoDepartment();
  return useMemo(() => buildDemoSetter(department), [department]);
};

/** Keep every in-page navigation inside the demo (the sidebar is remapped separately). */
const useDemoNavigate = () => {
  const navigate = useNavigate();
  return (path: string) => {
    if (path === "/setter") return navigate(SETTER_DEMO_BASE);
    if (path.startsWith("/setter/")) {
      const rest = path.slice("/setter/".length);
      return navigate(
        (SETTER_DEMO_PAGES as readonly string[]).includes(rest) ? `${SETTER_DEMO_BASE}/${rest}` : SETTER_DEMO_BASE,
      );
    }
    // Shared surfaces (Forms, Tasks) are real pages on the admin's own identity.
    navigate(path);
  };
};

// ── Overview ───────────────────────────────────────────────────────────────

export const DemoSetterDashboard = () => {
  const demo = useDemoSetter();
  const demoNavigate = useDemoNavigate();
  const today = format(new Date(), "yyyy-MM-dd");
  const sunday = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const toOverview = (m: MeetingRecord): OverviewMeeting => ({
    id: m.id,
    company_name: m.company_name,
    prospect_name: m.prospect_name,
    meeting_date: m.meeting_date,
    meeting_time: m.meeting_time,
    client_name: m.client_profiles?.company_name ?? null,
    client_confirmed_attendance: m.client_confirmed_attendance ?? null,
    prospect_watched_video: m.prospect_watched_video ?? null,
  });
  const live = demo.meetings.rows.filter((m) => !m.is_rebook && m.status !== "cancelled" && m.attendance_status !== "cancelled" && m.attendance_status !== "rescheduled");
  const [todays, setTodays] = useState<OverviewMeeting[]>(() =>
    live.filter((m) => m.meeting_date === today).map(toOverview).sort((a, b) => Number(a.client_confirmed_attendance !== null) - Number(b.client_confirmed_attendance !== null)),
  );
  const weekAhead = useMemo(
    () => live.filter((m) => m.meeting_date > today && m.meeting_date <= sunday).map(toOverview),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demo, today, sunday],
  );
  return (
    <SetterDashboardView
      fullGreeting={demo.fullGreeting}
      userDepartment={demo.department}
      currentUserId={demo.identity.userId}
      commissionEarned={demo.dashboard.commissionEarned}
      meetingsSat={demo.dashboard.meetingsSat}
      meetingsBooked={demo.dashboard.meetingsBooked}
      perMeetingBonus={demo.dashboard.perMeetingBonus}
      todayRosterClient={demo.dashboard.todayRosterClient}
      todayRosterLoading={false}
      todaysMeetings={todays}
      weekAhead={weekAhead}
      weekLoading={false}
      onConfirm={async (id, field, value) => setTodays((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)))}
      enquiries={[]}
      showEnquiries={false}
      onEnquiryOutcome={async () => undefined}
      onNavigate={demoNavigate}
    />
  );
};

// ── Coaching ───────────────────────────────────────────────────────────────

export const DemoSetterCoaching = () => {
  const demo = useDemoSetter();
  const [sessions, setSessions] = useState<CoachingSession[]>(demo.coaching.sessions);
  const [submitting, setSubmitting] = useState(false);

  // Reflections stay in local state so the editor behaves like the real one.
  const onSubmitReflection = async (sessionId: string, text: string) => {
    setSubmitting(true);
    setSessions((cur) => cur.map((s) => (s.id === sessionId ? { ...s, setter_self_reflection: text } : s)));
    setSubmitting(false);
    return true;
  };

  return (
    <SetterCoachingView
      setterProfile={demo.coaching.profile}
      activePIP={demo.coaching.activePIP}
      pipLoading={false}
      coachingSessions={sessions}
      sessionsLoading={false}
      onSubmitReflection={onSubmitReflection}
      submittingReflection={submitting}
    />
  );
};

// ── Assigned clients (fulfilment only, same redirect as the real page) ─────

export const DemoSetterClientResponsibility = () => {
  const demo = useDemoSetter();
  if (!demo.clientResponsibility) return <Navigate to={SETTER_DEMO_BASE} replace />;
  const currentUser = {
    id: demo.identity.userId,
    email: demo.identity.email,
    profile: { id: demo.identity.profileId, department: demo.department, full_name: demo.identity.fullName },
  };
  return (
    <SetterClientResponsibilityView
      currentUser={currentUser}
      assignments={demo.clientResponsibility.assignments}
      rosterEntries={demo.clientResponsibility.rosterEntries}
      bookingLinks={demo.clientResponsibility.bookingLinks}
      isLoading={false}
      demoDetails={demo.clientResponsibility.details}
    />
  );
};

// ── Appointments ───────────────────────────────────────────────────────────

export const DemoSetterMeetings = () => {
  const demo = useDemoSetter();
  const { toast } = useToast();
  const ui = useSetterMeetingsUiState();
  const [rows, setRows] = useState<MeetingRecord[]>(demo.meetings.rows);

  const department = demo.department;
  const perMeetingBonus = demo.identity.perMeetingBonus;
  const today = format(new Date(), "yyyy-MM-dd");
  const cycleStart = format(getInvoiceCycleStart(), "yyyy-MM-dd");

  const cycleFresh = rows.filter((m) => m.meeting_date >= cycleStart && !m.is_rebook);
  const meetingsSat = cycleFresh.filter((m) => m.attendance_status === "sat").length;
  const totalMeetingsBooked = cycleFresh.length;
  // The list follows the range picker exactly like the live page; commission
  // above stays on the fixture cycle.
  const visibleRows = useMemo(() => filterMeetingsToRange(rows, ui.meetingsRange), [rows, ui.meetingsRange]);
  const buckets = useMemo(() => bucketMeetings(visibleRows, today, department), [visibleRows, today, department]);
  const calendarEvents = useMemo(() => toCalendarEvents(visibleRows), [visibleRows]);

  // Booking platform, same derivation as the live page: acquisition has a
  // configured discovery event type (Marcus is its host), so assigning him
  // turns step 2 into the live slot picker fed by fixture availability.
  // "Enter date/time manually instead" still works via useManualTime.
  const bookingEventType = department === "acquisition" ? demo.meetings.bookingEventType : null;
  const aeIsBookingHost = !!(
    bookingEventType &&
    ui.assignedAeId &&
    bookingEventType.booking_event_hosts.some((h) => h.host_user_id === ui.assignedAeId)
  );
  const liveBookingActive = department === "acquisition" && !!bookingEventType && !ui.useManualTime;
  const canContinueToBooking =
    !!ui.assignedAeId && !!ui.appointmentSource &&
    !!ui.formData.prospect_name.trim() && !!ui.formData.prospect_email.trim() &&
    !!ui.formData.company_name.trim() &&
    !!ui.formData.revenue_last_12_months && !!ui.formData.sector_over_1000_companies &&
    !!ui.formData.only_decision_maker && !!ui.formData.start_timeline;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ui.isSubmitting) return;
    const f = ui.formData;
    if (department === "acquisition" && !ui.assignedAeId) {
      toast({ title: "Account Executive Required", description: "Please assign an Account Executive.", variant: "destructive" });
      return;
    }
    if (!f.meeting_date || !f.meeting_time) {
      toast({ title: "Time Required", description: "Please set the appointment date and time.", variant: "destructive" });
      return;
    }
    if (department === "acquisition" &&
        (!f.revenue_last_12_months || !f.sector_over_1000_companies || !f.only_decision_maker || !f.start_timeline)) {
      toast({ title: "Qualification Required", description: "Please answer all four qualification questions.", variant: "destructive" });
      return;
    }
    ui.setIsSubmitting(true);
    const isRebook = ui.meetingMode === "rebook" && !!ui.rebookSourceId;
    const created: MeetingRecord = {
      id: `demo-meeting-${Date.now()}`,
      company_name: f.company_name,
      company_website: f.company_website || null,
      meeting_date: f.meeting_date,
      meeting_time: f.meeting_time,
      status: "scheduled",
      attendance_status: "pending",
      prospect_name: f.prospect_name,
      prospect_email: f.prospect_email,
      prospect_mobile: f.prospect_mobile || null,
      prospect_linkedin: f.prospect_linkedin || null,
      prospect_job_title: f.prospect_job_title || null,
      notes: f.notes,
      approved_by_admin: false,
      close_lead_link: f.close_lead_link || null,
      revenue_last_12_months: f.revenue_last_12_months || null,
      sector_over_1000_companies: f.sector_over_1000_companies ? f.sector_over_1000_companies === "yes" : null,
      only_decision_maker: f.only_decision_maker ? f.only_decision_maker === "yes" : null,
      start_timeline: f.start_timeline || null,
      appointment_source: ui.appointmentSource || null,
      is_rebook: isRebook,
      original_meeting_id: isRebook ? ui.rebookSourceId : null,
      created_at: new Date().toISOString(),
      assigned_ae_id: ui.assignedAeId || null,
      client_confirmed_attendance: null,
      prospect_watched_video: null,
      client_profiles: null,
    };
    setRows((cur) => [created, ...cur]);
    resetMeetingWizard(ui);
    ui.setIsSubmitting(false);
    toast({
      title: isRebook ? "Appointment rebooked" : "Appointment logged",
      description: "Demo data only. Nothing was saved.",
    });
  };

  const onConfirmationUpdate = async (
    meetingId: string,
    field: "client_confirmed_attendance" | "prospect_watched_video",
    value: boolean,
  ) => {
    setRows((cur) => cur.map((m) => (m.id === meetingId ? { ...m, [field]: value } : m)));
  };

  // The detail sheet's Edit/Delete run on these rows; the sheet itself makes
  // no queries and toasts "Demo data only" when given this object.
  const detailSheetDemo: SetterMeetingDetailSheetDemo = {
    department,
    clientOptions: demo.meetings.clientProfiles.map((c) => ({ id: c.id, company_name: c.company_name })),
    aeOptions: demo.meetings.accountExecutives,
    onSave: (meetingId, patch) => {
      setRows((cur) =>
        cur.map((m) => {
          if (m.id !== meetingId) return m;
          const next: MeetingRecord = {
            ...m,
            company_name: patch.company_name,
            company_website: patch.company_website,
            prospect_name: patch.prospect_name,
            prospect_email: patch.prospect_email,
            prospect_mobile: patch.prospect_mobile,
            prospect_linkedin: patch.prospect_linkedin,
            prospect_job_title: patch.prospect_job_title,
            meeting_date: patch.meeting_date,
            meeting_time: patch.meeting_time,
            notes: patch.notes ?? undefined,
            company_headcount: patch.company_headcount,
            revenue_last_12_months: patch.revenue_last_12_months,
            next_job_title: patch.next_job_title,
            assigned_ae_id: patch.assigned_ae_id,
            client_profiles: patch.client_profiles ?? null,
          };
          return next;
        }),
      );
      // Keep the open sheet in step with the edited row.
      ui.setSelectedMeeting((cur) => (cur && cur.id === meetingId ? { ...cur, ...patch } as MeetingRecord : cur));
    },
    onDelete: (meetingId) => {
      setRows((cur) => cur.filter((m) => m.id !== meetingId));
      ui.setSelectedMeeting(null);
    },
  };

  return (
    <SetterMeetingsView
      {...ui}
      userProfile={{ userId: demo.identity.userId, profile: demo.meetings.profile }}
      setterDepartment={department}
      clientProfiles={demo.meetings.clientProfiles}
      accountExecutives={demo.meetings.accountExecutives}
      followUpSlug={null}
      bookingEventType={bookingEventType}
      aeIsBookingHost={aeIsBookingHost}
      liveBookingActive={liveBookingActive}
      canContinueToBooking={canContinueToBooking}
      todayRosteredClients={demo.meetings.todayRosteredClients}
      isLoading={false}
      refetchMeetings={() => undefined}
      historicalData={demo.meetings.historical}
      startRebook={(m) => applyRebook(ui, m)}
      releaseInvite={async () => undefined}
      handleSubmit={handleSubmit}
      calendarEvents={calendarEvents}
      eventStyleGetter={meetingEventStyleGetter}
      getStatusLabel={getMeetingStatusLabel}
      getStatusBadgeVariant={getMeetingStatusBadgeVariant}
      perMeetingBonus={perMeetingBonus}
      meetingsSat={meetingsSat}
      commissionEarned={meetingsSat * perMeetingBonus}
      totalMeetingsBooked={totalMeetingsBooked}
      projectedCommission={totalMeetingsBooked * perMeetingBonus}
      pendingMeetings={totalMeetingsBooked - meetingsSat}
      upcomingMeetings={buckets.upcomingMeetings}
      pastMeetings={buckets.pastMeetings}
      rebookedMeetings={buckets.rebookedMeetings}
      supersededMeetingIds={buckets.supersededMeetingIds}
      needsConfirmationMeetings={buckets.needsConfirmationMeetings}
      hasMoreMeetings={false}
      loadMoreMeetings={() => undefined}
      isLoadingMore={false}
      onConfirmationUpdate={onConfirmationUpdate}
      detailSheetDemo={detailSheetDemo}
      demoSlots={department === "acquisition" ? demo.meetings.bookingSlots : undefined}
    />
  );
};

// ── Warm leads / tools ─────────────────────────────────────────────────────

export const DemoSetterWarmLeads = () => {
  const demo = useDemoSetter();
  const [leads, setLeads] = useState<DemoRow[]>(demo.warmLeads.leads);
  const [enrichedLeads, setEnrichedLeads] = useState<DemoRow[]>(demo.warmLeads.enrichedLeads);

  const onSaveLead: React.ComponentProps<typeof SetterWarmLeadsView>["onSaveLead"] = async (payload, editingId) => {
    if (editingId) {
      setLeads((cur) => cur.map((l) => (l.id === editingId ? { ...l, ...payload } : l)));
    } else {
      setLeads((cur) => [
        { id: `demo-lead-${Date.now()}`, status: "new", created_at: new Date().toISOString(), ...payload },
        ...cur,
      ]);
    }
    return true;
  };

  const onDeleteLead: React.ComponentProps<typeof SetterWarmLeadsView>["onDeleteLead"] = async (id, kind) => {
    if (kind === "manual") setLeads((cur) => cur.filter((l) => l.id !== id));
    else setEnrichedLeads((cur) => cur.filter((l) => l.id !== id));
    return true;
  };

  return (
    <SetterWarmLeadsView
      leads={leads}
      enrichedLeads={enrichedLeads}
      onSaveLead={onSaveLead}
      onDeleteLead={onDeleteLead}
    />
  );
};

export const DemoSetterEnrichment = () => {
  const demo = useDemoSetter();
  const { toast } = useToast();
  const [requests, setRequests] = useState<DemoRow[]>(demo.enrichment.requests);
  const [pollingId, setPollingId] = useState<string | null>(null);

  // A demo enrichment "completes" after a moment so the polling state is visible.
  const onEnrich: React.ComponentProps<typeof SetterEnrichmentView>["onEnrich"] = async (fields) => {
    const id = `demo-enr-${Date.now()}`;
    setRequests((cur) => [
      { id, created_at: new Date().toISOString(), status: "enriching", phone_best: null, email: null, source: "Clay", ...fields },
      ...cur,
    ]);
    setPollingId(id);
    window.setTimeout(() => {
      setRequests((cur) =>
        cur.map((r) => (r.id === id ? { ...r, status: "enriched", phone_best: "+44 7700 900654", email: null } : r)),
      );
      setPollingId(null);
    }, 1800);
    return true;
  };

  return (
    <SetterEnrichmentView
      requests={requests}
      isAcquisition={demo.department === "acquisition"}
      usefulLinks={demo.enrichment.usefulLinks}
      pollingId={pollingId}
      isSearching={!!pollingId}
      duplicateData={null}
      onDismissDuplicate={() => undefined}
      onEnrich={onEnrich}
      onUseDuplicate={() => undefined}
      onSendToWarm={async () => {
        toast({ title: "Sent to Warm Leads", description: "Demo data only. Nothing was saved." });
      }}
      onRetry={async () => {
        toast({ title: "Retried", description: "Demo data only. Nothing was sent to Clay." });
      }}
    />
  );
};

// ── Settings ───────────────────────────────────────────────────────────────

export const DemoSetterSettings = () => {
  const demo = useDemoSetter();
  const { toast } = useToast();
  const [profile, setProfile] = useState<SetterSettingsProfile>(demo.settings);
  const [bank, setBank] = useState<SetterBankDetails>({ bank_name: "FNB", account_holder_name: demo.identity.fullName, account_number: "62012345678", sort_code: "250655", iban: "", swift_bic: "", bank_country: "South Africa" });
  return (
    <SetterSettingsView
      userId={demo.identity.userId}
      profile={profile}
      setProfile={setProfile}
      loading={false}
      demo
      bank={bank}
      setBank={setBank}
      onSaveBank={() => toast({ title: "Payout details saved", description: "Demo data only. Nothing was saved." })}
      onSave={() => toast({ title: "Profile updated", description: "Demo data only. Nothing was saved." })}
      onChangePassword={async () => {
        toast({ title: "Password changed", description: "Demo data only. Nothing was saved." });
        return true;
      }}
    />
  );
};
