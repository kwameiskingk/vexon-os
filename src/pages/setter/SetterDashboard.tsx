import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endOfWeek, format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { JAMES_USER_ID } from "@/lib/coldOutbound";
import { Card } from "@/components/ui/card";
import { Avatar, ButtonV2, Panel, Pill, StatStrip, Timeline } from "@/components/ui-v2";
import { useToast } from "@/hooks/use-toast";
import { useGreeting } from "@/hooks/useGreeting";
import { getCommissionCycleDates } from "@/utils/commissionCycle";
import { getUKDateString } from "@/utils/timezoneUtils";

// Setter Overview, rebuilt 12 Oct 2026 (SDR streamline PR 2, acquisition PR A1).
//
// Fulfilment setters get the three things they act on, in the three card
// slots the old leaderboard row used: today's rostered client (with the
// client's own Kronos booking page), today's confirmation calls (the same
// rule as the Needs Confirmation tab on Appointments, answered inline), and
// commission for the current 26th-to-25th cycle. Below them, the rest of the
// week's appointments.
//
// Acquisition setters are not rostered, so their page opens with the
// appointments themselves: confirmation calls today (attendance and the
// testimonial-video question) on the left, the week's discovery calls on the
// right, and the commission strip underneath. Tom, who also owns the leads
// that arrive from the Enquire form on meridiansales.example, gets a third card first.

/** Today's rostered client, plus the Kronos event that books for them. */
export interface TodayRosterClient {
  id: string;
  company_name: string;
  logo: string | null;
  industry?: string | null;
  country?: string | null;
  /** Slug of the client's fulfilment booking event, when one exists. */
  bookingSlug: string | null;
  acceptingBookings: boolean;
}

/** The slice of a meeting the Overview needs. */
export interface OverviewMeeting {
  id: string;
  company_name: string;
  prospect_name: string;
  meeting_date: string;
  meeting_time: string;
  client_name: string | null;
  client_confirmed_attendance: boolean | null;
  /** Acquisition only: has the prospect watched the testimonial video? */
  prospect_watched_video: boolean | null;
}

/** A lead from the Enquire form (or Meta ads) that Tom has not booked or closed off yet. */
export interface OverviewEnquiry {
  id: string;
  name: string | null;
  company_name: string | null;
  revenue_band: string | null;
  qualification: string | null;
  source: string;
  created_at: string;
}

export type ConfirmField = 'client_confirmed_attendance' | 'prospect_watched_video';

export interface SetterDashboardViewProps {
  fullGreeting: string;
  userDepartment: string;
  currentUserId: string;
  commissionEarned: number;
  meetingsSat: number;
  /** Fresh (non-rebook) meetings booked in the current cycle. */
  meetingsBooked: number;
  perMeetingBonus: number;
  todayRosterClient: TodayRosterClient | null;
  todayRosterLoading: boolean;
  /** Today's live meetings (fulfilment): unconfirmed first, then confirmed. */
  todaysMeetings: OverviewMeeting[];
  /** Live meetings after today up to Sunday (fulfilment). */
  weekAhead: OverviewMeeting[];
  /** Null while the week is still loading. */
  weekLoading: boolean;
  onConfirm: (meetingId: string, field: ConfirmField, value: boolean) => Promise<void>;
  /** Tom only: enquiries waiting for him. Empty for everyone else. */
  enquiries: OverviewEnquiry[];
  showEnquiries: boolean;
  onEnquiryOutcome: (id: string, outcome: 'meeting_booked' | 'not_a_fit') => Promise<void>;
  onNavigate: (path: string) => void;
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timeLabel = (t: string) => t.slice(0, 5);

/**
 * Pure view of the setter overview. The live page feeds it from Supabase;
 * the demo surface (/demo/setter) feeds it from fixtures.
 */
export const SetterDashboardView = ({
  fullGreeting,
  userDepartment,
  commissionEarned,
  meetingsSat,
  meetingsBooked,
  perMeetingBonus,
  todayRosterClient,
  todayRosterLoading,
  todaysMeetings,
  weekAhead,
  weekLoading,
  onConfirm,
  enquiries,
  showEnquiries,
  onEnquiryOutcome,
  onNavigate,
}: SetterDashboardViewProps) => {
  const navigate = onNavigate;
  const [saving, setSaving] = useState<string | null>(null);
  const subtitle = format(new Date(), "EEEE d MMMM yyyy");
  const { start, end } = getCommissionCycleDates();
  const cycleLabel = `${format(start, "d MMM")} to ${format(end, "d MMM")}`;
  const isAcquisition = userDepartment === 'acquisition';
  // Acquisition confirmation calls ask two questions; fulfilment one.
  const needsAnswer = (m: OverviewMeeting) =>
    m.client_confirmed_attendance === null || (isAcquisition && m.prospect_watched_video === null);
  const unconfirmed = todaysMeetings.filter(needsAnswer);

  const confirm = async (id: string, field: ConfirmField, value: boolean) => {
    setSaving(`${id}:${field}`);
    try { await onConfirm(id, field, value); } finally { setSaving(null); }
  };

  const toItem = (m: OverviewMeeting, withActions: boolean) => ({
    id: m.id,
    time: timeLabel(m.meeting_time),
    primary: <>{m.prospect_name} <span className="font-normal text-[var(--dim)]">· {m.client_name ?? m.company_name}</span></>,
    secondary: isAcquisition ? 'Discovery call' : 'Client meeting',
    focus: withActions && needsAnswer(m),
    aside: withActions ? (
      <div className="flex flex-col items-end gap-1">
        {m.client_confirmed_attendance === null ? (
          <div className="flex gap-[5px]">
            <ButtonV2 size="sm" disabled={saving === `${m.id}:client_confirmed_attendance`} onClick={() => confirm(m.id, 'client_confirmed_attendance', false)}>No</ButtonV2>
            <ButtonV2 size="sm" variant="primary" disabled={saving === `${m.id}:client_confirmed_attendance`} onClick={() => confirm(m.id, 'client_confirmed_attendance', true)}>Confirmed</ButtonV2>
          </div>
        ) : (
          <Pill variant={m.client_confirmed_attendance ? 'ok' : 'default'}>{m.client_confirmed_attendance ? 'Confirmed' : 'Not confirmed'}</Pill>
        )}
        {isAcquisition && (
          m.prospect_watched_video === null ? (
            <div className="flex items-center gap-[6px] text-[11px] text-[var(--dim)]">
              Watched the video?
              <ButtonV2 size="sm" disabled={saving === `${m.id}:prospect_watched_video`} onClick={() => confirm(m.id, 'prospect_watched_video', false)}>No</ButtonV2>
              <ButtonV2 size="sm" disabled={saving === `${m.id}:prospect_watched_video`} onClick={() => confirm(m.id, 'prospect_watched_video', true)}>Yes</ButtonV2>
            </div>
          ) : (
            <Pill variant={m.prospect_watched_video ? 'ok' : 'default'}>{m.prospect_watched_video ? 'Watched video' : 'Not watched'}</Pill>
          )
        )}
      </div>
    ) : (
      <Pill variant="info">Booked</Pill>
    ),
  });

  // Rest of the week, grouped by day.
  const weekGroups = (() => {
    const byDay = new Map<string, OverviewMeeting[]>();
    for (const m of weekAhead) {
      if (!byDay.has(m.meeting_date)) byDay.set(m.meeting_date, []);
      byDay.get(m.meeting_date)!.push(m);
    }
    return [...byDay.entries()].map(([d, list]) => ({
      label: format(new Date(`${d}T12:00:00`), 'EEE'),
      day: format(new Date(`${d}T12:00:00`), 'd MMM'),
      items: list.map((m) => toItem(m, false)),
    }));
  })();

  const skeleton = (
    <div className="mt-3 space-y-2">
      <div className="h-5 w-full animate-pulse rounded bg-[var(--surf2)]" />
      <div className="h-5 w-3/4 animate-pulse rounded bg-[var(--surf2)]" />
    </div>
  );

  const todayPanel = (
    <Panel
      title="Today"
      meta={format(new Date(), 'EEE d MMM')}
      aside={!weekLoading && (unconfirmed.length > 0
        ? <Pill variant="warn">{unconfirmed.length} to confirm</Pill>
        : <Pill variant={todaysMeetings.length > 0 ? 'ok' : 'default'}>{todaysMeetings.length > 0 ? 'All confirmed' : 'Nothing today'}</Pill>)}
    >
      {weekLoading ? skeleton : (
        <Timeline
          groups={[{ label: '', items: todaysMeetings.map((m) => toItem(m, true)) }]}
          empty={isAcquisition ? 'No calls booked for today.' : 'No meetings booked for today.'}
        />
      )}
      <button type="button" className="mt-2 pt-2 text-left text-[11.5px] text-[var(--dim)] hover:text-[var(--ink)]" onClick={() => navigate('/setter/meetings')}>
        Open Appointments →
      </button>
    </Panel>
  );

  const weekPanel = (
    <Panel title="Rest of this week" meta="After today, to Sunday" aside={!weekLoading && <Pill>{weekAhead.length} booked</Pill>}>
      {weekLoading ? skeleton : (
        <Timeline groups={weekGroups} empty={isAcquisition ? 'No more discovery calls booked this week.' : 'No more appointments booked this week.'} />
      )}
    </Panel>
  );

  const stats = [
    { label: 'Today', value: weekLoading ? '–' : todaysMeetings.length, caption: isAcquisition ? 'discovery calls' : 'client meetings' },
    { label: 'To confirm', value: weekLoading ? '–' : unconfirmed.length, caption: unconfirmed[0] ? `${unconfirmed[0].prospect_name}, ${timeLabel(unconfirmed[0].meeting_time)}` : 'Nothing waiting' },
    { label: 'Rest of this week', value: weekLoading ? '–' : weekAhead.length, caption: 'After today, to Sunday' },
    { label: `Earned · ${cycleLabel}`, value: money(commissionEarned), caption: `${meetingsSat} sat · ${meetingsBooked} booked · $${perMeetingBonus} per sat · projected ${money(meetingsBooked * perMeetingBonus)}` },
  ];

  return (
    <DashboardLayout role="setter">
      <PageContainer>
        <PageHeader title={fullGreeting} subtitle={subtitle} />
        <div className="space-y-6">
          {userDepartment === 'fulfilment' && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[10px] bg-[var(--surf2)] px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">Today's client</span>
              {todayRosterLoading ? (
                <div className="h-5 w-40 animate-pulse rounded bg-[var(--surf3)]" />
              ) : todayRosterClient ? (
                <>
                  <span className="flex items-center gap-[10px] font-head text-[15px] font-medium">
                    {todayRosterClient.logo
                      ? <img src={todayRosterClient.logo} alt="" className="h-6 w-6 rounded object-cover" />
                      : <Avatar name={todayRosterClient.company_name} size={24} />}
                    {todayRosterClient.company_name}
                    <span className="font-body text-[12px] font-normal text-[var(--dim)]">
                      {[todayRosterClient.industry, todayRosterClient.country].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="ml-auto flex gap-[6px]">
                    {todayRosterClient.bookingSlug ? (
                      <ButtonV2
                        size="sm"
                        variant="primary"
                        disabled={!todayRosterClient.acceptingBookings}
                        title={todayRosterClient.acceptingBookings ? "Open this client's booking page" : 'This client is not accepting bookings right now'}
                        onClick={() => window.open(`/bookings/${todayRosterClient.bookingSlug}`, '_blank')}
                      >
                        Book a meeting
                      </ButtonV2>
                    ) : (
                      <ButtonV2 size="sm" onClick={() => window.open('/bookings/fulfilment', '_blank')}>Booking hub</ButtonV2>
                    )}
                    <ButtonV2 size="sm" onClick={() => navigate('/setter/client-responsibility')}>Source materials</ButtonV2>
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[12.5px] text-[var(--dim)]">No client rostered to you today.</span>
                  <span className="ml-auto flex gap-[6px]">
                    <ButtonV2 size="sm" onClick={() => window.open('/bookings/fulfilment', '_blank')}>Booking hub</ButtonV2>
                    <ButtonV2 size="sm" variant="ghost" onClick={() => navigate('/setter/client-responsibility')}>All assignments</ButtonV2>
                  </span>
                </>
              )}
            </div>
          )}

          <div>
            <StatStrip stats={stats} />
            <button type="button" className="mt-2 text-left text-[11.5px] text-[var(--dim)] hover:text-[var(--ink)]" onClick={() => navigate('/setter/meetings')}>
              Full commission breakdown →
            </button>
          </div>

          <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1.2fr_1fr]">
            {todayPanel}
            {weekPanel}
          </div>

          {showEnquiries && (
            <Panel
              title="Website enquiries"
              meta="From the Enquire form and Meta ads, not yet booked or closed off"
              aside={<Pill variant={enquiries.length > 0 ? 'warn' : 'default'}>{enquiries.length > 0 ? `${enquiries.length} waiting` : 'None waiting'}</Pill>}
            >
              {enquiries.length === 0 ? (
                <div className="py-[26px] text-center text-[12px] text-[var(--dim)]">Every enquiry is booked or closed off.</div>
              ) : (
                <Timeline
                  groups={[{ label: '', items: enquiries.map((en) => ({
                    id: en.id,
                    time: format(new Date(en.created_at), 'd MMM'),
                    primary: <>{en.name || 'Unknown'} <span className="font-normal text-[var(--dim)]">· {en.company_name || 'no company'}</span></>,
                    secondary: [format(new Date(en.created_at), 'HH:mm'), en.revenue_band, en.qualification?.replace(/_/g, ' '), en.source === 'meta_ads' ? 'ads' : null].filter(Boolean).join(' · '),
                    aside: (
                      <div className="flex gap-[5px]">
                        <ButtonV2 size="sm" onClick={() => navigate('/marketing/leads')}>Open</ButtonV2>
                        <ButtonV2 size="sm" onClick={() => onEnquiryOutcome(en.id, 'not_a_fit')}>Not a fit</ButtonV2>
                        <ButtonV2 size="sm" variant="primary" onClick={() => onEnquiryOutcome(en.id, 'meeting_booked')}>Booked</ButtonV2>
                      </div>
                    ),
                  })) }]}
                />
              )}
              <button type="button" className="mt-2 pt-2 text-left text-[11.5px] text-[var(--dim)] hover:text-[var(--ink)]" onClick={() => navigate('/marketing/leads')}>
                Open the Marketing Hub →
              </button>
            </Panel>
          )}
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

type WeekRow = {
  id: string; company_name: string; prospect_name: string; meeting_date: string; meeting_time: string;
  status: string; attendance_status: string | null; is_rebook: boolean | null; client_confirmed_attendance: boolean | null;
  prospect_watched_video: boolean | null;
  client_profiles: { id: string; company_name: string } | null;
};

const toOverviewMeeting = (r: WeekRow): OverviewMeeting => ({
  id: r.id,
  company_name: r.company_name,
  prospect_name: r.prospect_name,
  meeting_date: r.meeting_date,
  meeting_time: r.meeting_time,
  client_name: r.client_profiles?.company_name ?? null,
  client_confirmed_attendance: r.client_confirmed_attendance ?? null,
  prospect_watched_video: r.prospect_watched_video ?? null,
});

/** Live meetings only: no rebooks, nothing cancelled or moved. Same rule as Appointments. */
const isLive = (r: WeekRow) =>
  !r.is_rebook && r.status !== 'cancelled' && r.attendance_status !== 'cancelled' && r.attendance_status !== 'rescheduled';

const SetterDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [role, setRole] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userDepartment, setUserDepartment] = useState<string>("");
  const [commissionEarned, setCommissionEarned] = useState<number>(0);
  const [meetingsSat, setMeetingsSat] = useState<number>(0);
  const [meetingsBooked, setMeetingsBooked] = useState<number>(0);
  const [perMeetingBonus, setPerMeetingBonus] = useState<number>(50);
  const [todayRosterClient, setTodayRosterClient] = useState<TodayRosterClient | null>(null);
  const [todayRosterLoading, setTodayRosterLoading] = useState(true);
  const [todaysMeetings, setTodaysMeetings] = useState<OverviewMeeting[]>([]);
  const [weekAhead, setWeekAhead] = useState<OverviewMeeting[]>([]);
  const [weekLoading, setWeekLoading] = useState(true);
  const [enquiries, setEnquiries] = useState<OverviewEnquiry[]>([]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const [{ data: roleData }, { data: setterProfile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id).limit(1).maybeSingle(),
      supabase.from("setters_profiles").select("id, department, per_meeting_bonus").eq("user_id", user.id).maybeSingle(),
    ]);
    if (roleData) setRole(roleData.role);
    const department = setterProfile?.department || "";
    setUserDepartment(department);
    const bonus = setterProfile?.per_meeting_bonus ?? 50;
    setPerMeetingBonus(bonus);

    const isFulfilment = department === "fulfilment";
    await Promise.all([
      loadCommission(user.id, bonus),
      isFulfilment ? loadTodayRosterAssignment(setterProfile?.id) : Promise.resolve(setTodayRosterLoading(false)),
      loadWeek(user.id),
      user.id === JAMES_USER_ID ? loadEnquiries() : Promise.resolve(),
    ]);
  };

  const loadCommission = async (userId: string, bonus: number) => {
    const { start, end } = getCommissionCycleDates();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    // Same rule as the Appointments cards: fresh (non-rebook) sat meetings
    // in the current cycle, matched on the user id.
    const { data } = await supabase
      .from("meetings")
      .select("id, attendance_status, is_rebook")
      .or(`setter_id.eq.${userId},logged_by_setter_id.eq.${userId}`)
      .gte("meeting_date", fmt(start))
      .lte("meeting_date", fmt(end))
      .limit(2000);
    const fresh = (data || []).filter((m) => !m.is_rebook);
    const sat = fresh.filter((m) => m.attendance_status === "sat").length;
    setMeetingsSat(sat);
    setMeetingsBooked(fresh.length);
    setCommissionEarned(sat * bonus);
  };

  const loadTodayRosterAssignment = async (setterProfileId: string | undefined) => {
    setTodayRosterLoading(true);
    try {
      if (!setterProfileId) { setTodayRosterClient(null); return; }
      const today = getUKDateString();
      const { data } = await supabase
        .from("roster_entries")
        .select("client_profile_id, client_profiles!inner(id, company_name, logo, industry, country)")
        .eq("setter_profile_id", setterProfileId)
        .eq("roster_date", today)
        .limit(1)
        .maybeSingle();
      const client = (data as unknown as { client_profiles?: { id: string; company_name: string; logo: string | null; industry: string | null; country: string | null } } | null)?.client_profiles;
      if (!client) { setTodayRosterClient(null); return; }

      // The client's own Kronos event (the fulfilment hub uses the same lookup).
      const { data: event } = await supabase
        .from("booking_event_types")
        .select("slug, accepting_bookings")
        .eq("client_id", client.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      setTodayRosterClient({
        id: client.id,
        company_name: client.company_name,
        logo: client.logo ?? null,
        industry: client.industry,
        country: client.country,
        bookingSlug: event?.slug ?? null,
        acceptingBookings: event ? event.accepting_bookings !== false : false,
      });
    } finally {
      setTodayRosterLoading(false);
    }
  };

  const loadWeek = async (userId: string) => {
    setWeekLoading(true);
    try {
      const today = getUKDateString();
      const sunday = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const { data } = await supabase
        .from("meetings")
        .select("id, company_name, prospect_name, meeting_date, meeting_time, status, attendance_status, is_rebook, client_confirmed_attendance, prospect_watched_video, client_profiles!meetings_client_profile_id_fkey(id, company_name)")
        .or(`setter_id.eq.${userId},logged_by_setter_id.eq.${userId}`)
        .gte("meeting_date", today)
        .lte("meeting_date", sunday)
        .order("meeting_date", { ascending: true })
        .order("meeting_time", { ascending: true })
        .limit(200);
      const rows = ((data || []) as unknown as WeekRow[]).filter(isLive);
      const todays = rows.filter((r) => r.meeting_date === today).map(toOverviewMeeting);
      // Unanswered first so the calls still to make sit at the top.
      const answered = (m: OverviewMeeting) => Number(m.client_confirmed_attendance !== null && m.prospect_watched_video !== null);
      todays.sort((a, b) => answered(a) - answered(b));
      setTodaysMeetings(todays);
      setWeekAhead(rows.filter((r) => r.meeting_date > today).map(toOverviewMeeting));
    } finally {
      setWeekLoading(false);
    }
  };

  const onConfirm = async (meetingId: string, field: ConfirmField, value: boolean) => {
    const { error } = await supabase
      .from("meetings")
      .update({ [field]: value })
      .eq("id", meetingId);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    setTodaysMeetings((prev) => prev.map((m) => (m.id === meetingId ? { ...m, [field]: value } : m)));
    toast({ title: "Saved" });
  };

  // Tom only: leads from the Enquire form (and Meta ads) that nobody has
  // booked or closed off. Same table the Marketing Hub reads.
  const loadEnquiries = async () => {
    const { data } = await supabase
      .from("marketing_leads")
      .select("id, name, company_name, revenue_band, qualification, source, created_at, outcome, actioned_at")
      .is("actioned_at", null)
      .order("created_at", { ascending: false })
      .limit(8);
    setEnquiries(((data || []) as Array<OverviewEnquiry & { outcome: string | null }>).filter((e) => e.outcome !== 'meeting_booked'));
  };

  const onEnquiryOutcome = async (id: string, outcome: 'meeting_booked' | 'not_a_fit') => {
    const patch = outcome === 'meeting_booked'
      ? { outcome: 'meeting_booked', actioned_at: new Date().toISOString() }
      : { outcome: 'no_meeting', actioned_at: new Date().toISOString() };
    const { error } = await supabase.from("marketing_leads").update(patch).eq("id", id);
    if (error) { toast({ title: "Could not save", description: error.message, variant: "destructive" }); return; }
    setEnquiries((prev) => prev.filter((e) => e.id !== id));
    toast({ title: outcome === 'meeting_booked' ? "Marked as booked" : "Closed off" });
  };

  const { fullGreeting } = useGreeting();

  if (role !== "setter" && role !== "admin") {
    return (
      <DashboardLayout role="setter">
        <div className="space-y-6 animate-fade-in">
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No access to internal performance data.</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <SetterDashboardView
      fullGreeting={fullGreeting}
      userDepartment={userDepartment}
      currentUserId={currentUserId}
      commissionEarned={commissionEarned}
      meetingsSat={meetingsSat}
      meetingsBooked={meetingsBooked}
      perMeetingBonus={perMeetingBonus}
      todayRosterClient={todayRosterClient}
      todayRosterLoading={todayRosterLoading}
      todaysMeetings={todaysMeetings}
      weekAhead={weekAhead}
      weekLoading={weekLoading}
      onConfirm={onConfirm}
      enquiries={enquiries}
      showEnquiries={currentUserId === JAMES_USER_ID}
      onEnquiryOutcome={onEnquiryOutcome}
      onNavigate={navigate}
    />
  );
};

export default SetterDashboard;
