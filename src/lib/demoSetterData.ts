import {
  addDays,
  subDays,
  subMonths,
  startOfWeek,
  format,
} from "date-fns";
import type { CoachingPip, CoachingSession, SetterCoachingProfile } from "@/pages/setter/SetterCoaching";
import type {
  Assignment,
  ClientBookingLink,
  ClientProfile,
  ClientResponsibilityDemoDetails,
  RosterEntry,
} from "@/pages/setter/SetterClientResponsibility";
import type { CommissionHistoryCycle, MeetingRecord, SetterMeetingsProfile } from "@/pages/setter/SetterMeetings";
import type { BookingSlot } from "@/components/bookings/BookingSlotPicker";
import type { TodayRosterClient } from "@/pages/setter/SetterDashboard";
import type { SetterSettingsProfile } from "@/pages/setter/SetterSettings";
import type { SetterDepartment } from "@/lib/actingAs";

/**
 * Setter demo fixtures (3 Sep 2026) — the ONLY data source for /demo/setter/*.
 *
 * Marcus has no setter identity, so "Acting as SDR (Fulfilment)" and
 * "Acting as SDR (Acquisition)" render the REAL setter-portal View components
 * (extracted from the setter pages, see src/pages/setter/*) with this data.
 * Isolation is structural: nothing here touches the database, no demo route
 * may import @/integrations/supabase, and no real setter data is reachable
 * from the demo surface. Types are imported from the pages themselves so the
 * fixtures cannot drift from what the views expect.
 *
 * Fulfilment and Acquisition differ exactly where the real portal differs by
 * department: roster / assigned clients (fulfilment), AE assignment +
 * qualification wizard + useful links (acquisition), KPI mix on the overview,
 * leaderboard peers, achievement definitions.
 *
 * All dates are computed relative to "now" so the demo always reads current.
 */

const now = () => new Date();
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const todayIso = () => iso(now());
const weekStart = () => startOfWeek(now(), { weekStartsOn: 1 });

/** Commission cycle: 26th of previous month to 25th of current month. */
const cycleBounds = (ref: Date = now()) => {
  const start = ref.getDate() >= 26
    ? new Date(ref.getFullYear(), ref.getMonth(), 26)
    : new Date(ref.getFullYear(), ref.getMonth() - 1, 26);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25);
  return { start, end };
};

/** Small deterministic generator so the numbers are stable across renders. */
const seeded = (seed: number) => {
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
};

// ── Identities ─────────────────────────────────────────────────────────────

export interface DemoSetterIdentity {
  userId: string;
  profileId: string;
  fullName: string;
  firstName: string;
  email: string;
  title: "sdr" | "lead_sdr" | "senior_sdr" | "trainee_sdr";
  perMeetingBonus: number;
  baseSalary: number;
  currency: "USD";
  closeUserId: string;
  department: SetterDepartment;
}

const IDENTITIES: Record<SetterDepartment, DemoSetterIdentity> = {
  fulfilment: {
    userId: "demo-setter-user-fulfilment",
    profileId: "demo-setter-profile-fulfilment",
    fullName: "Amara Osei",
    firstName: "Amara",
    email: "amara.osei@demo.local",
    title: "lead_sdr",
    perMeetingBonus: 50,
    baseSalary: 1500,
    currency: "USD",
    closeUserId: "demo-close-amara",
    department: "fulfilment",
  },
  acquisition: {
    userId: "demo-setter-user-acquisition",
    profileId: "demo-setter-profile-acquisition",
    fullName: "Callum Reid",
    firstName: "Callum",
    email: "callum.reid@demo.local",
    title: "sdr",
    perMeetingBonus: 50,
    baseSalary: 1500,
    currency: "USD",
    closeUserId: "demo-close-callum",
    department: "acquisition",
  },
};

// ── Clients (fulfilment roster) ───────────────────────────────────────────

const DEMO_CLIENTS: ClientProfile[] = [
  { id: "demo-client-harrington", company_name: "Harrington Search Partners", logo: null, industry: "Technology recruitment", website: "https://harringtonsearch.example", country: "United Kingdom", size: "11-50", contact_name: "Sarah Harrington", calendly_link: null },
  { id: "demo-client-northgate", company_name: "Northgate Talent", logo: null, industry: "Finance & accounting recruitment", website: "https://northgatetalent.example", country: "United Kingdom", size: "11-50", contact_name: "Daniel Mensah", calendly_link: null },
  { id: "demo-client-bluewater", company_name: "Bluewater Legal Recruitment", logo: null, industry: "Legal recruitment", website: "https://bluewaterlegal.example", country: "United Kingdom", size: "2-10", contact_name: "Hannah Clarke", calendly_link: null },
];

const rosterEntries = (): RosterEntry[] => {
  const monday = weekStart();
  const plan: Array<ClientProfile | null> = [DEMO_CLIENTS[0], DEMO_CLIENTS[0], DEMO_CLIENTS[1], DEMO_CLIENTS[0], DEMO_CLIENTS[2]];
  return plan.map((client, i) => ({
    id: `demo-roster-${i}`,
    roster_date: iso(addDays(monday, i)),
    client_profile_id: client?.id ?? "",
    client_profiles: client,
  }));
};

/** Which client is rostered today (weekends fall back to Monday's client). */
const todaysRosterClient = (): ClientProfile => {
  const entries = rosterEntries();
  return entries.find((e) => e.roster_date === todayIso())?.client_profiles ?? DEMO_CLIENTS[0];
};

const assignments = (): Assignment[] => [
  {
    id: "demo-assignment-northgate",
    setter_id: IDENTITIES.fulfilment.profileId,
    client_id: DEMO_CLIENTS[1].id,
    meeting_target: 12,
    duration_days: 30,
    meetings_completed: 7,
    started_at: iso(subDays(now(), 16)),
    ends_at: iso(addDays(now(), 14)),
    status: "active",
    client_profiles: DEMO_CLIENTS[1],
  },
];

const clientResponsibilityDetails = (): ClientResponsibilityDemoDetails => {
  const ws = weekStart();
  const meetingsFor = (prefix: string, company: string, days: number[], sat: number[]) =>
    days.map((d, i) => ({
      id: `${prefix}-${i}`,
      company_name: company,
      meeting_date: iso(addDays(ws, d)),
      status: sat.includes(i) ? "sat" : "pending",
    }));
  return {
    roster: {
      [DEMO_CLIENTS[0].id]: {
        myMeetings: meetingsFor("demo-rm-h", "Vantage Cloud Ltd", [0, 1], [0]),
        otherSetterMeetings: meetingsFor("demo-om-h", "Kestrel Analytics", [1, 2, 3], [1]),
        otherRosteredSetters: [
          { setter_id: "demo-peer-marcus", setter_name: "Marcus Vaughn", days_rostered: 2 },
          { setter_id: "demo-peer-priya", setter_name: "Priya Naidoo", days_rostered: 1 },
        ],
      },
      [DEMO_CLIENTS[1].id]: {
        myMeetings: meetingsFor("demo-rm-n", "Ledgerline Accounting", [2], []),
        otherSetterMeetings: meetingsFor("demo-om-n", "Summit FP&A", [0, 4], [0]),
        otherRosteredSetters: [{ setter_id: "demo-peer-dylan", setter_name: "Dylan Okafor", days_rostered: 2 }],
      },
      [DEMO_CLIENTS[2].id]: {
        myMeetings: [],
        otherSetterMeetings: meetingsFor("demo-om-b", "Carrow & Finch LLP", [1], []),
        otherRosteredSetters: [{ setter_id: "demo-peer-sophie", setter_name: "Sophie Bianchi", days_rostered: 3 }],
      },
    },
    assignments: {
      [DEMO_CLIENTS[1].id]: {
        myMeetings: [
          { id: "demo-am-1", company_name: "Ledgerline Accounting", meeting_date: iso(subDays(now(), 2)), status: "sat" },
          { id: "demo-am-2", company_name: "Summit FP&A", meeting_date: iso(subDays(now(), 6)), status: "sat" },
          { id: "demo-am-3", company_name: "Brightwater Tax", meeting_date: iso(subDays(now(), 9)), status: "pending" },
          { id: "demo-am-4", company_name: "Halcyon Wealth", meeting_date: iso(subDays(now(), 12)), status: "sat" },
          { id: "demo-am-5", company_name: "Oakridge Advisory", meeting_date: iso(addDays(now(), 3)), status: "pending" },
          { id: "demo-am-6", company_name: "Lanterne Payroll", meeting_date: iso(addDays(now(), 5)), status: "pending" },
          { id: "demo-am-7", company_name: "Fairview Audit", meeting_date: iso(subDays(now(), 14)), status: "sat" },
        ],
        otherSetterMeetings: [
          { id: "demo-ao-1", company_name: "Northwind Finance", meeting_date: iso(subDays(now(), 4)), status: "sat" },
          { id: "demo-ao-2", company_name: "Cobalt Bookkeeping", meeting_date: iso(subDays(now(), 8)), status: "pending" },
        ],
        otherAssignments: [
          { setter_id: "demo-peer-dylan", setter_name: "Dylan Okafor", meetings_completed: 4, status: "active" },
        ],
      },
    },
    materials: {
      [DEMO_CLIENTS[0].id]: [
        { id: "demo-mat-1", title: "Harrington call sheet (September)", file_path: "demo/harrington-call-sheet.pdf", file_name: "harrington-call-sheet.pdf", category: "call_sheet" },
        { id: "demo-mat-2", title: "Objection handling script", file_path: "demo/harrington-script.pdf", file_name: "harrington-script.pdf", category: "script" },
      ],
      [DEMO_CLIENTS[1].id]: [
        { id: "demo-mat-3", title: "Northgate ICP and target list", file_path: "demo/northgate-icp.pdf", file_name: "northgate-icp.pdf", category: "general" },
      ],
      [DEMO_CLIENTS[2].id]: [],
    },
  };
};

// ── Meetings (per department) ─────────────────────────────────────────────

const DEMO_AE = { id: "demo-ae-marcus", full_name: "Marcus Hale", email: "marcus@meridiansales.example" };

/**
 * Booking platform fixture (acquisition only): the shape the real page reads
 * from booking_event_types + booking_event_hosts. Marcus is the host, so
 * assigning him in the wizard turns the date/time inputs into the live slot
 * picker, exactly as a real acquisition setter sees it.
 */
export interface DemoBookingEventType {
  id: string;
  name: string;
  duration_minutes: number;
  booking_event_hosts: Array<{ host_user_id: string }>;
}
const DEMO_BOOKING_EVENT_TYPE: DemoBookingEventType = {
  id: "demo-booking-event-discovery",
  name: "Discovery Call",
  duration_minutes: 30,
  booking_event_hosts: [{ host_user_id: DEMO_AE.id }],
};

/** UK wall-clock → UTC instant, honouring BST/GMT for that date. */
const londonToUtcIso = (date: string, time: string): string => {
  const naive = new Date(`${date}T${time}:00Z`);
  const label = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" })
    .formatToParts(naive)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = label.match(/([+-])(\d{1,2})/);
  const offsetHours = m ? Number(`${m[1]}${m[2]}`) : 0;
  return new Date(naive.getTime() - offsetHours * 3_600_000).toISOString();
};

/**
 * Two weeks of plausible availability for the demo host: weekdays, 09:30 to
 * 16:30 UK, half-hour steps, with a few "busy" gaps so the picker looks real.
 * Same shape the booking-availability edge function returns.
 */
const demoBookingSlots = (durationMinutes: number): BookingSlot[] => {
  const slots: BookingSlot[] = [];
  const t = now();
  for (let d = 1; d <= 14; d++) {
    const day = addDays(t, d);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;
    const date = iso(day);
    for (let mins = 9 * 60 + 30; mins <= 16 * 60 + 30; mins += 30) {
      // Deterministic gaps: lunch, plus one or two "meetings" per day.
      if (mins >= 12 * 60 + 30 && mins < 13 * 60 + 30) continue;
      if ((d + mins / 30) % 5 === 0) continue;
      const time = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
      const starts_at = londonToUtcIso(date, time);
      const ends_at = new Date(new Date(starts_at).getTime() + durationMinutes * 60_000).toISOString();
      slots.push({ starts_at, ends_at });
    }
  }
  return slots;
};

const meetingsFor = (department: SetterDepartment): MeetingRecord[] => {
  const { start } = cycleBounds();
  const t = now();
  const isAcq = department === "acquisition";
  const client = (i: number) => (isAcq ? null : { id: DEMO_CLIENTS[i % 3].id, company_name: DEMO_CLIENTS[i % 3].company_name });
  const base = (id: string, daysFromNow: number, time: string, extra: Partial<MeetingRecord>): MeetingRecord => {
    const date = addDays(t, daysFromNow);
    return {
      id,
      company_name: "",
      meeting_date: iso(date),
      meeting_time: time,
      status: "pending",
      prospect_name: "",
      prospect_email: "",
      approved_by_admin: true,
      created_at: subDays(date, 3).toISOString(),
      assigned_ae_id: isAcq ? DEMO_AE.id : null,
      appointment_source: isAcq ? "cold_call" : null,
      revenue_last_12_months: isAcq ? "£1 million-£5 million" : null,
      sector_over_1000_companies: isAcq ? true : null,
      only_decision_maker: isAcq ? true : null,
      start_timeline: isAcq ? "Within a month" : null,
      is_rebook: false,
      ...extra,
    };
  };

  const rows: MeetingRecord[] = [
    // Today: two confirmation calls still to do
    base("demo-mtg-today-1", 0, "10:30", { company_name: isAcq ? "Pinnacle Talent Group" : "Vantage Cloud Ltd", prospect_name: isAcq ? "Georgia Lyons" : "Tom Whitaker", prospect_email: isAcq ? "georgia@pinnacletalent.example" : "tom@vantagecloud.example", prospect_job_title: isAcq ? "Managing Director" : "Head of Engineering", client_profiles: client(0), client_confirmed_attendance: null, prospect_watched_video: null }),
    base("demo-mtg-today-2", 0, "15:00", { company_name: isAcq ? "Redwood Recruitment" : "Kestrel Analytics", prospect_name: isAcq ? "Ben Ashworth" : "Nadia Rahman", prospect_email: isAcq ? "ben@redwoodrec.example" : "nadia@kestrel.example", prospect_job_title: isAcq ? "Founder" : "VP Data", client_profiles: client(1), client_confirmed_attendance: true, prospect_watched_video: null }),
    // Upcoming
    base("demo-mtg-up-1", 1, "11:00", { company_name: isAcq ? "Anchor Executive Search" : "Ledgerline Accounting", prospect_name: isAcq ? "Priya Shah" : "Mark Ellison", prospect_email: "prospect1@example.com", client_profiles: client(1), client_confirmed_attendance: true, prospect_watched_video: true }),
    base("demo-mtg-up-2", 2, "14:30", { company_name: isAcq ? "Cobalt People" : "Summit FP&A", prospect_name: isAcq ? "James Okonkwo" : "Ellie Fraser", prospect_email: "prospect2@example.com", client_profiles: client(1) }),
    base("demo-mtg-up-3", 4, "09:30", { company_name: isAcq ? "Lanterne Staffing" : "Carrow & Finch LLP", prospect_name: isAcq ? "Sam Doherty" : "Rachel Adeyemi", prospect_email: "prospect3@example.com", client_profiles: client(2) }),
    base("demo-mtg-up-4", 6, "16:00", { company_name: isAcq ? "Halcyon Hires" : "Brightwater Tax", prospect_name: isAcq ? "Olivia Grant" : "Chris Lam", prospect_email: "prospect4@example.com", client_profiles: client(1) }),
    // Past this cycle
    base("demo-mtg-past-1", -2, "10:00", { company_name: isAcq ? "Sterling Search" : "Halcyon Wealth", prospect_name: "Aisha Bello", prospect_email: "prospect5@example.com", attendance_status: "sat", client_profiles: client(1), client_confirmed_attendance: true, prospect_watched_video: true }),
    base("demo-mtg-past-2", -3, "13:00", { company_name: isAcq ? "Northstar Recruitment" : "Oakridge Advisory", prospect_name: "Liam Hughes", prospect_email: "prospect6@example.com", attendance_status: "sat", client_profiles: client(0), client_confirmed_attendance: true, prospect_watched_video: false }),
    base("demo-mtg-past-3", -5, "11:30", { company_name: isAcq ? "Ridgeway Talent" : "Fairview Audit", prospect_name: "Zoe Martin", prospect_email: "prospect7@example.com", attendance_status: "no_show", client_profiles: client(1), client_confirmed_attendance: false }),
    base("demo-mtg-past-4", -7, "15:30", { company_name: isAcq ? "Ashgrove Partners" : "Lanterne Payroll", prospect_name: "Dev Patel", prospect_email: "prospect8@example.com", attendance_status: "sat", client_profiles: client(1), client_confirmed_attendance: true, prospect_watched_video: true }),
    base("demo-mtg-past-5", -9, "10:00", { company_name: isAcq ? "Lattice Legal Search" : "Cobalt Bookkeeping", prospect_name: "Hannah Price", prospect_email: "prospect9@example.com", attendance_status: "sat", client_profiles: client(2), client_confirmed_attendance: true, prospect_watched_video: true }),
    base("demo-mtg-past-6", -12, "12:00", { company_name: isAcq ? "Beacon Hiring Co" : "Northwind Finance", prospect_name: "Oscar Reed", prospect_email: "prospect10@example.com", attendance_status: "cancelled", client_profiles: client(0) }),
    // A rebook pair (original rescheduled, rebook upcoming)
    base("demo-mtg-orig-1", -4, "09:00", { company_name: isAcq ? "Greyfriars Search" : "Kestrel Analytics", prospect_name: "Isla Murray", prospect_email: "prospect11@example.com", attendance_status: "rescheduled", client_profiles: client(1) }),
    base("demo-mtg-rebook-1", 3, "09:00", { company_name: isAcq ? "Greyfriars Search" : "Kestrel Analytics", prospect_name: "Isla Murray", prospect_email: "prospect11@example.com", is_rebook: true, original_meeting_id: "demo-mtg-orig-1", client_profiles: client(1) }),
  ];

  // Keep everything inside the current cycle window the live page uses.
  return rows.filter((m) => m.meeting_date >= iso(start));
};

const historicalCommission = (department: SetterDepartment): CommissionHistoryCycle[] => {
  const bonus = IDENTITIES[department].perMeetingBonus;
  const sats = department === "fulfilment" ? [9, 11, 8, 12, 10, 7] : [5, 6, 4, 7, 6, 3];
  const current = meetingsFor(department)
    .filter((m) => m.attendance_status === "sat" && !m.is_rebook)
    .map(({ id, company_name, prospect_name, meeting_date, meeting_time }) => ({ id, company_name, prospect_name, meeting_date, meeting_time }));
  const months: CommissionHistoryCycle[] = [];
  for (let i = 0; i < 6; i++) {
    const { start, end } = cycleBounds(subMonths(now(), i));
    const label = `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
    // Only the current cycle has fixture meeting rows; older cycles show the count alone.
    const meetings = i === 0 ? current : [];
    const count = i === 0 ? Math.max(current.length, sats[i]) : sats[i];
    months.push({ month: `${format(start, "MMM")} Cycle`, label, satMeetings: count, commission: count * bonus, meetings });
  }
  return months.reverse();
};

// ── Performance series (dashboard + reporting) ────────────────────────────

interface DemoPerfRow { date: string; dials: number; talk: number; meetings: number; conversations: number }

const performanceSeries = (department: SetterDepartment): DemoPerfRow[] => {
  const rnd = seeded(department === "fulfilment" ? 20260903 : 20260904);
  const rows: DemoPerfRow[] = [];
  for (let i = 45; i >= 0; i--) {
    const d = subDays(now(), i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const scale = i === 0 ? 0.55 : 1; // today is part-way through
    rows.push({
      date: iso(d),
      dials: Math.round((175 + rnd() * 90) * scale),
      talk: Math.round((95 + rnd() * 60) * scale),
      meetings: Math.round(rnd() * 2.6 * scale),
      conversations: Math.round((10 + rnd() * 16) * scale),
    });
  }
  return rows;
};

// ── Coaching ──────────────────────────────────────────────────────────────

const coachingFor = (department: SetterDepartment) => {
  const id = IDENTITIES[department];
  const profile: SetterCoachingProfile = {
    id: id.profileId,
    status: "active",
    current_coaching_focus: department === "acquisition"
      ? "Tighten the price-qualification question so more discovery calls turn into sats."
      : "Open with the client's live vacancy, then earn the meeting. Fewer generic pitches.",
    full_name: id.fullName,
    title: id.title,
    per_meeting_bonus: id.perMeetingBonus,
    department,
  };
  const activePIP: CoachingPip | null = null;
  const sessions: CoachingSession[] = [
    { id: "demo-cs-1", session_date: iso(addDays(now(), 2)), session_time: "09:30", session_type: "one_to_one", custom_session_label: null, status: "scheduled", action_items: null, improvements: null, observations: null, agenda: "Call review: two recorded calls from this week, then next week's targets.", overall_rating: null, setter_self_reflection: null },
    { id: "demo-cs-2", session_date: iso(subDays(now(), 5)), session_time: "10:00", session_type: "one_to_one", custom_session_label: null, status: "completed", action_items: ["Ask the hiring question before the pitch", "Book the follow-up on the call, not by email"], improvements: "Getting to the meeting ask faster", observations: "Strong rapport, tends to over-explain the service before asking about live roles.", agenda: null, overall_rating: 4, setter_self_reflection: "Agreed. I noticed on the second call I spoke for 3 minutes before asking anything. Trying a 30-second opener this week." },
    { id: "demo-cs-3", session_date: iso(subDays(now(), 12)), session_time: "10:00", session_type: "call_review", custom_session_label: null, status: "completed", action_items: ["Use the objection sheet for 'we use an agency already'"], improvements: "Objection handling", observations: "Handled gatekeepers well. Lost two calls on the incumbent-agency objection.", agenda: null, overall_rating: 3, setter_self_reflection: null },
    { id: "demo-cs-4", session_date: iso(subDays(now(), 19)), session_time: "14:00", session_type: "custom", custom_session_label: "Talk track refresh", status: "completed", action_items: ["Record three openers and pick the best"], improvements: "Opener", observations: "New talk track landed well in role-play.", agenda: null, overall_rating: 5, setter_self_reflection: "Really useful. The shorter opener already feels more natural." },
  ];
  return { profile, activePIP, sessions };
};

// ── Warm leads / enrichment ───────────────────────────────────────────────

const warmLeadsFor = (department: SetterDepartment) => {
  const acq = department === "acquisition";
  const leads = [
    { id: "demo-lead-1", company_name: acq ? "Pinnacle Talent Group" : "Vantage Cloud Ltd", contact_name: acq ? "Georgia Lyons" : "Tom Whitaker", prospect_job_title: acq ? "Managing Director" : "Head of Engineering", email: acq ? "georgia@pinnacletalent.example" : "tom@vantagecloud.example", mobile: "+44 7700 900123", linkedin_url: "", company_website: "", callback_date: iso(addDays(now(), 1)), callback_time: "10:00", source: "Cold Call", industry: acq ? "Recruitment" : "Technology", notes: acq ? "Wants to see the ROI numbers before booking." : "Hiring two backend engineers in Q4.", close_lead_id: "lead_demo_001", status: "new", created_at: subDays(now(), 1).toISOString() },
    { id: "demo-lead-2", company_name: acq ? "Redwood Recruitment" : "Kestrel Analytics", contact_name: acq ? "Ben Ashworth" : "Nadia Rahman", prospect_job_title: acq ? "Founder" : "VP Data", email: acq ? "ben@redwoodrec.example" : "nadia@kestrel.example", mobile: "+44 7700 900456", linkedin_url: "", company_website: "", callback_date: iso(addDays(now(), 3)), callback_time: "14:30", source: "Cold Email", industry: acq ? "Recruitment" : "Analytics", notes: "Asked for a case study first.", close_lead_id: "", status: "contacted", created_at: subDays(now(), 2).toISOString() },
    { id: "demo-lead-3", company_name: acq ? "Anchor Executive Search" : "Ledgerline Accounting", contact_name: acq ? "Priya Shah" : "Mark Ellison", prospect_job_title: acq ? "Director" : "Finance Director", email: "", mobile: "+44 7700 900789", linkedin_url: "", company_website: "", callback_date: "", callback_time: "", source: "Cold Call", industry: acq ? "Executive search" : "Accounting", notes: "Call back after month end.", close_lead_id: "lead_demo_003", status: "new", created_at: subDays(now(), 4).toISOString() },
  ];
  const enrichedLeads = [
    { id: "demo-enriched-1", created_at: subDays(now(), 1).toISOString(), linkedin_url: "https://www.linkedin.com/in/georgia-lyons-demo/", phone: "+44 7700 900123", email: "georgia@pinnacletalent.example", source: "Clay" },
    { id: "demo-enriched-2", created_at: subDays(now(), 3).toISOString(), linkedin_url: "https://www.linkedin.com/in/mark-ellison-demo/", phone: "+44 7700 900321", email: null, source: "Clay" },
  ];
  return { leads, enrichedLeads };
};

const enrichmentFor = (department: SetterDepartment) => ({
  requests: [
    { id: "demo-enr-1", created_at: subDays(now(), 0).toISOString(), full_name: "Georgia Lyons", company_name: "Pinnacle Talent Group", linkedin_url: "https://www.linkedin.com/in/georgia-lyons-demo/", status: "enriched", phone_best: "+44 7700 900123", email: "georgia@pinnacletalent.example", source: "Clay", company_domain: "pinnacletalent.example" },
    { id: "demo-enr-2", created_at: subDays(now(), 1).toISOString(), full_name: "Ben Ashworth", company_name: "Redwood Recruitment", linkedin_url: "https://www.linkedin.com/in/ben-ashworth-demo/", status: "enriching", phone_best: null, email: null, source: "Clay", company_domain: "redwoodrec.example" },
    { id: "demo-enr-3", created_at: subDays(now(), 2).toISOString(), full_name: "Priya Shah", company_name: "Anchor Executive Search", linkedin_url: "https://www.linkedin.com/in/priya-shah-demo/", status: "not_found", phone_best: null, email: null, source: "Clay", company_domain: "anchorsearch.example" },
    { id: "demo-enr-4", created_at: subDays(now(), 3).toISOString(), full_name: "Mark Ellison", company_name: "Ledgerline Accounting", linkedin_url: "https://www.linkedin.com/in/mark-ellison-demo/", status: "enriched", phone_best: "+44 7700 900321", email: null, source: "Clay", company_domain: "ledgerline.example" },
  ],
  usefulLinks: department === "acquisition"
    ? [
        { id: "demo-link-1", name: "Discovery call booking page", description: "Send this when the prospect wants to pick their own time.", url: "https://vexon-os.example/bookings/discovery-call-with-recruitment-revenue" },
        { id: "demo-link-2", name: "Follow-up call booking page", description: "Marcus's follow-up calendar.", url: "https://vexon-os.example/bookings/follow-up-call" },
        { id: "demo-link-3", name: "Testimonial video", description: "The three-minute client testimonial to send before the call.", url: "https://meridiansales.example/testimonials" },
      ]
    : [],
});

// ── Bundle ────────────────────────────────────────────────────────────────

export interface DemoSetterBundle {
  department: SetterDepartment;
  identity: DemoSetterIdentity;
  fullGreeting: string;
  dashboard: {
    commissionEarned: number;
    meetingsSat: number;
    meetingsBooked: number;
    perMeetingBonus: number;
    todayRosterClient: TodayRosterClient | null;
  };
  coaching: ReturnType<typeof coachingFor>;
  clientResponsibility: { assignments: Assignment[]; rosterEntries: RosterEntry[]; bookingLinks: Record<string, ClientBookingLink>; details: ClientResponsibilityDemoDetails } | null;
  meetings: {
    profile: SetterMeetingsProfile;
    rows: MeetingRecord[];
    historical: ReturnType<typeof historicalCommission>;
    clientProfiles: Array<{ id: string; company_name: string; contact_name: string | null }>;
    accountExecutives: Array<{ id: string; full_name: string | null; email: string | null }>;
    todayRosteredClients: Array<{ id: string; company_name: string }>;
    /** Acquisition only (null for fulfilment): the configured discovery event type. */
    bookingEventType: DemoBookingEventType | null;
    /** Fixture availability for the slot picker (empty for fulfilment). */
    bookingSlots: BookingSlot[];
  };
  warmLeads: ReturnType<typeof warmLeadsFor>;
  enrichment: ReturnType<typeof enrichmentFor>;
  settings: SetterSettingsProfile;
}

const greetingFor = (firstName: string) => {
  const hour = parseInt(new Date().toLocaleString("en-US", { timeZone: "Europe/London", hour: "numeric", hour12: false }), 10);
  const word = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${word}, ${firstName}`;
};

export const buildDemoSetter = (department: SetterDepartment): DemoSetterBundle => {
  const identity = IDENTITIES[department];
  const series = performanceSeries(department);
  const today = series.find((r) => r.date === todayIso()) ?? { date: todayIso(), dials: 0, talk: 0, meetings: 0, conversations: 0 };
  const rows = meetingsFor(department);
  const sat = rows.filter((m) => m.attendance_status === "sat" && !m.is_rebook).length;
  const isFulfilment = department === "fulfilment";

  return {
    department,
    identity,
    fullGreeting: greetingFor(identity.firstName),
    dashboard: {
      commissionEarned: sat * identity.perMeetingBonus,
      meetingsSat: sat,
      meetingsBooked: rows.filter((m) => !m.is_rebook).length,
      perMeetingBonus: identity.perMeetingBonus,
      todayRosterClient: isFulfilment
        ? (() => { const c = todaysRosterClient(); return { id: c.id, company_name: c.company_name, logo: null, industry: c.industry, country: c.country, bookingSlug: `client-${c.id}`, acceptingBookings: true }; })()
        : null,
    },
    coaching: coachingFor(department),
    clientResponsibility: isFulfilment
      ? {
          assignments: assignments(),
          rosterEntries: rosterEntries(),
          bookingLinks: Object.fromEntries(DEMO_CLIENTS.map((c) => [c.id, { slug: `client-${c.id}`, accepting: true }])),
          details: clientResponsibilityDetails(),
        }
      : null,
    meetings: {
      profile: { id: identity.profileId, user_id: identity.userId, department, per_meeting_bonus: identity.perMeetingBonus, full_name: identity.fullName },
      rows,
      historical: historicalCommission(department),
      clientProfiles: DEMO_CLIENTS.map((c) => ({ id: c.id, company_name: c.company_name, contact_name: c.contact_name ?? null })),
      accountExecutives: [DEMO_AE],
      todayRosteredClients: isFulfilment ? [{ id: todaysRosterClient().id, company_name: todaysRosterClient().company_name }] : [],
      bookingEventType: isFulfilment ? null : DEMO_BOOKING_EVENT_TYPE,
      bookingSlots: isFulfilment ? [] : demoBookingSlots(DEMO_BOOKING_EVENT_TYPE.duration_minutes),
    },
    warmLeads: warmLeadsFor(department),
    enrichment: enrichmentFor(department),
    settings: { full_name: identity.fullName, email: identity.email, phone: "+44 7700 900000", company_name: "Meridian Sales Partners", avatar_url: null },
  };
};

/* ── Setter demo LENS (/setter/demo, sandbox finish card) — small fixture set the
   deck's SetterDemoPortal reads. Kept alongside the acting-as fixtures above. ── */
export const demoSetter = {
  firstName: "Sam",
  department: "fulfilment" as const,
  todayClient: { company_name: "Lanterne Search Partners", logo: null as string | null },
  commissionEarned: 275,
  meetingsSat: 11,
  perMeetingBonus: 25,
};

export const demoSetterToday = {
  calls_made: 86,
  total_call_time: 3 * 3600 + 12 * 60,
  leads_created: 9,
  meetings_booked: 2,
  opps_created: 1,
};

export interface DemoSetterDay {
  day: string;
  calls: number;
  talkSeconds: number;
  conversations: number;
  meetings: number;
}

export const demoSetterWeek: DemoSetterDay[] = [
  { day: "Monday", calls: 92, talkSeconds: 3 * 3600 + 40 * 60, conversations: 11, meetings: 2 },
  { day: "Tuesday", calls: 104, talkSeconds: 4 * 3600 + 5 * 60, conversations: 13, meetings: 3 },
  { day: "Wednesday", calls: 86, talkSeconds: 3 * 3600 + 12 * 60, conversations: 9, meetings: 2 },
];

export interface DemoUpcomingMeeting {
  id: string;
  prospect: string;
  company: string;
  when: string;
  client: string;
}

export const demoSetterUpcoming: DemoUpcomingMeeting[] = [
  { id: "dm1", prospect: "Priya Nair", company: "Halcyon Talent", when: "Tomorrow, 10:30", client: "Lanterne Search Partners" },
  { id: "dm2", prospect: "Tom Whitaker", company: "Northgate Recruitment", when: "Thursday, 14:00", client: "Lanterne Search Partners" },
  { id: "dm3", prospect: "Leila Farouk", company: "Brightside Hiring", when: "Friday, 09:15", client: "Lanterne Search Partners" },
];

export const formatTalkTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
