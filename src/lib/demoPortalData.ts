import { addDays, subDays, subWeeks, addWeeks, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";
import type { CampaignProgressDemoData } from "@/components/client/CampaignProgressTimeline";
import type { WeeklyGoalDemoData } from "@/components/client/WeeklyGoalCard";
import type { WeeklyGoal } from "@/lib/campaignGoals";
import type { ClientDashboardMetrics } from "@/pages/client/ClientDashboard";
import type { Lead } from "@/pages/client/ClientWarmLeads";
import type { LeadList } from "@/pages/client/ClientLeadLists";
import type { PeriodData } from "@/pages/client/ClientMetrics";
import type { CSMInfo, Catchup } from "@/pages/client/ClientCommunications";
import type { ClientDocument } from "@/pages/client/ClientDocuments";

/**
 * AE demo-portal fixtures — the ONLY data source for /ae/demo-portal/*.
 *
 * The demo renders the REAL client-portal view components (extracted from
 * the client pages) with this data, so it is always pixel-identical to the
 * live portal. Isolation is structural: nothing here touches the database,
 * no demo route may import @/integrations/supabase, and no real client
 * data is reachable from the demo surface. Do not add queries to this
 * feature — that is the entire design (AE_DEMO_PORTAL_REV2_DESIGN.md).
 *
 * All dates are computed relative to "now" so the demo always reads
 * current on a live discovery call.
 */

const now = () => new Date();
const iso = (d: Date) => format(d, "yyyy-MM-dd");

export const demoClient = {
  companyName: "Harrington Search Partners",
  contactFirstName: "Sarah",
  profileId: "demo-client-profile",
};

// ── Dashboard ────────────────────────────────────────────────────────────

export const demoDashboardMetrics: ClientDashboardMetrics = {
  upcomingMeetings: 7,
  meetingsSat: 47,
  termsSent: 24,
  vacanciesTakenOn: 19,
  potentialPlacementFeeValue: 275000,
};

export const demoCampaignProgress: CampaignProgressDemoData = {
  campaign: {
    id: "demo-campaign",
    name: "Core Outbound Campaign",
    status: "active",
    start_date: iso(subWeeks(now(), 14)),
    end_date: iso(addWeeks(now(), 12)),
    client_id: demoClient.profileId,
  },
  milestones: [
    { id: "dm1", type: "terms_signed", title: "Terms signed", description: null, milestone_date: iso(subWeeks(now(), 15)), value: null, position: 4 },
    { id: "dm2", type: "campaign_started", title: "Campaign launched", description: "Outbound live", milestone_date: iso(subWeeks(now(), 14)), value: null, position: 8 },
    { id: "dm3", type: "meeting_booked", title: "First meeting booked", description: null, milestone_date: iso(subWeeks(now(), 13)), value: null, position: 14 },
    { id: "dm4", type: "meeting_sat", title: "First meeting sat", description: null, milestone_date: iso(subWeeks(now(), 12)), value: null, position: 19 },
    { id: "dm5", type: "vacancy", title: "First vacancy taken on", description: "Senior DevOps Engineer", milestone_date: iso(subWeeks(now(), 10)), value: null, position: 28 },
    { id: "dm6", type: "custom", title: "First placement made", description: "Staff Engineer @ Pinewood Robotics", milestone_date: iso(subWeeks(now(), 6)), value: null, position: 42 },
    { id: "dm7", type: "fee_value", title: "Fee banked", description: null, milestone_date: iso(subWeeks(now(), 5)), value: 12500, position: 48 },
  ],
  profileDates: {
    terms_signed_date: iso(subWeeks(now(), 15)),
    campaign_start_date: iso(subWeeks(now(), 14)),
  },
};

const goalWeek = (weekNumber: number, target: number, achieved: number): WeeklyGoal => {
  const weekStart = startOfWeek(subWeeks(now(), 15 - weekNumber), { weekStartsOn: 1 });
  return {
    id: `demo-goal-${weekNumber}`,
    campaign_id: "demo-campaign",
    client_id: demoClient.profileId,
    week_number: weekNumber,
    week_start: iso(weekStart),
    week_end: iso(endOfWeek(weekStart, { weekStartsOn: 1 })),
    target,
    achieved,
    goal_met: achieved >= target,
  };
};

const demoGoals: WeeklyGoal[] = [
  goalWeek(1, 3, 2),
  goalWeek(2, 3, 3),
  goalWeek(3, 3, 4),
  goalWeek(4, 3, 3),
  goalWeek(5, 4, 3),
  goalWeek(6, 4, 4),
  goalWeek(7, 4, 5),
  goalWeek(8, 4, 4),
  goalWeek(9, 4, 4),
  goalWeek(10, 4, 6),
  goalWeek(11, 4, 4),
  goalWeek(12, 4, 5),
  goalWeek(13, 4, 4),
  goalWeek(14, 4, 5),
  goalWeek(15, 4, 3), // current week, in progress
];

const completedGoals = demoGoals.slice(0, 14);
const metWeeks = completedGoals.filter((g) => g.goal_met).length;

export const demoWeeklyGoal: WeeklyGoalDemoData = {
  campaignName: "Core Outbound Campaign",
  campaignStartDate: iso(subWeeks(now(), 14)),
  campaignEndDate: iso(addWeeks(now(), 12)),
  totalWeeks: 26,
  currentWeek: 15,
  currentGoal: demoGoals[14],
  streak: 5,
  hitRate: {
    met: metWeeks,
    total: completedGoals.length,
    rate: Math.round((metWeeks / completedGoals.length) * 100),
  },
  goals: demoGoals,
  completedWeeksCount: completedGoals.length,
  totalAchieved: completedGoals.reduce((s, g) => s + g.achieved, 0),
  totalTarget: completedGoals.reduce((s, g) => s + g.target, 0),
  weeksHit: metWeeks,
  weeksExceeded: completedGoals.filter((g) => g.achieved > g.target).length,
};

// ── Meetings ─────────────────────────────────────────────────────────────

export interface DemoMeeting {
  id: string;
  prospect_name: string;
  prospect_job_title: string | null;
  prospect_email: string;
  prospect_mobile: string | null;
  company_name: string;
  company_website: string | null;
  meeting_date: string;
  meeting_time: string;
  status: string;
  attendance_status: string;
  client_accepted: boolean;
  created_at: string;
  lead_type: string;
  currently_hiring: string | null;
  next_job_title: string | null;
  terms_fees: string | null;
  job_specs: { type: string; content?: string; file_name?: string; file_url?: string }[] | null;
  client_feedback_sat?: boolean | null;
  client_feedback_submitted_at?: string | null;
}

const meeting = (
  id: string,
  overrides: Partial<DemoMeeting> & Pick<DemoMeeting, "prospect_name" | "company_name" | "meeting_date" | "meeting_time">,
): DemoMeeting => ({
  id,
  prospect_job_title: null,
  prospect_email: `${overrides.prospect_name.split(" ")[0].toLowerCase()}@${overrides.company_name.toLowerCase().replace(/[^a-z]/g, "")}.com`,
  prospect_mobile: null,
  company_website: `https://${overrides.company_name.toLowerCase().replace(/[^a-z]/g, "")}.com`,
  status: "client_accepted",
  attendance_status: "pending",
  client_accepted: true,
  created_at: subDays(now(), 20).toISOString(),
  lead_type: "video_call",
  currently_hiring: "Yes",
  next_job_title: null,
  terms_fees: null,
  job_specs: null,
  ...overrides,
});

export const demoUpcomingMeetings: DemoMeeting[] = [
  meeting("dmu1", {
    prospect_name: "James Whitfield", company_name: "Northgate Digital",
    prospect_job_title: "Head of Engineering", meeting_date: iso(addDays(now(), 1)),
    meeting_time: "10:30", next_job_title: "Senior Platform Engineer",
  }),
  meeting("dmu2", {
    prospect_name: "Priya Anand", company_name: "Cobalt Systems",
    prospect_job_title: "VP People", meeting_date: iso(addDays(now(), 2)),
    meeting_time: "14:00", prospect_mobile: "+44 7700 900123",
    lead_type: "mobile_phone_call",
    job_specs: [{ type: "text", content: "Two engineering-manager openings, remote-first, £95–110k. Ideal profile: scaled a platform team 5→15." }],
  }),
  meeting("dmu3", {
    prospect_name: "Marcus Reid", company_name: "Fairline Group",
    prospect_job_title: "CTO", meeting_date: iso(addDays(now(), 6)), meeting_time: "11:15",
  }),
  meeting("dmu4", {
    prospect_name: "Elena Kovács", company_name: "Bridgepoint Labs",
    prospect_job_title: "Engineering Director", meeting_date: iso(addDays(now(), 9)), meeting_time: "15:30",
  }),
  meeting("dmu5", {
    prospect_name: "Sofia Lindqvist", company_name: "Meadowbrook Software",
    prospect_job_title: "VP Engineering", meeting_date: iso(addDays(now(), 3)),
    meeting_time: "09:45", next_job_title: "Staff Backend Engineer",
  }),
  meeting("dmu6", {
    prospect_name: "Adam Osei", company_name: "Crestline Payments",
    prospect_job_title: "Head of Talent", meeting_date: iso(addDays(now(), 5)), meeting_time: "13:30",
  }),
  meeting("dmu7", {
    prospect_name: "Rachel Donnelly", company_name: "Wavecrest Health",
    prospect_job_title: "COO", meeting_date: iso(addDays(now(), 8)), meeting_time: "10:00",
    job_specs: [{ type: "text", content: "Scaling clinical-platform team; three senior hires signed off for this quarter." }],
  }),
];

export const demoPendingMeetings: DemoMeeting[] = [
  meeting("dmp1", {
    prospect_name: "Oliver Grant", company_name: "Silverbeck Consulting",
    prospect_job_title: "Managing Director", meeting_date: iso(addDays(now(), 4)),
    meeting_time: "09:30", status: "pending", client_accepted: false,
  }),
  meeting("dmp2", {
    prospect_name: "Freya Nilsson", company_name: "Arcadia Health Tech",
    prospect_job_title: "Head of People", meeting_date: iso(addDays(now(), 7)),
    meeting_time: "13:00", status: "pending", client_accepted: false,
  }),
  meeting("dmp3", {
    prospect_name: "Hugo Betancourt", company_name: "Longford Systems",
    prospect_job_title: "Engineering Manager", meeting_date: iso(addDays(now(), 5)),
    meeting_time: "16:00", status: "pending", client_accepted: false,
  }),
  meeting("dmp4", {
    prospect_name: "Imogen Clarke", company_name: "Statler & Mayes",
    prospect_job_title: "Operations Director", meeting_date: iso(addDays(now(), 8)),
    meeting_time: "11:30", status: "pending", client_accepted: false,
  }),
];

export const demoSatMeetings: DemoMeeting[] = [
  meeting("dms1", { prospect_name: "Daniel Okafor", company_name: "Vantage Analytics", prospect_job_title: "Head of Data", meeting_date: iso(subDays(now(), 2)), meeting_time: "09:30", attendance_status: "sat", client_feedback_sat: true, next_job_title: "Analytics Engineer" }),
  meeting("dms2", { prospect_name: "Lucy Harmon", company_name: "Ashworth Tech", prospect_job_title: "Talent Director", meeting_date: iso(subDays(now(), 4)), meeting_time: "13:00", attendance_status: "sat", client_feedback_sat: true, terms_fees: "20% of first-year salary" }),
  meeting("dms3", { prospect_name: "Tom Bergstrom", company_name: "Halcyon Cloud", prospect_job_title: "VP Engineering", meeting_date: iso(subDays(now(), 7)), meeting_time: "10:00", attendance_status: "sat", client_feedback_sat: true, next_job_title: "Senior DevOps Engineer" }),
  meeting("dms4", { prospect_name: "Chris Delaney", company_name: "Orbital Fintech", prospect_job_title: "Head of Platform", meeting_date: iso(subDays(now(), 11)), meeting_time: "11:30", attendance_status: "sat", client_feedback_sat: true }),
  meeting("dms5", { prospect_name: "Megan Foss", company_name: "TrueNorth Media", prospect_job_title: "People Lead", meeting_date: iso(subDays(now(), 14)), meeting_time: "14:30", attendance_status: "sat", client_feedback_sat: true }),
  meeting("dms6", { prospect_name: "Rob Castellano", company_name: "Pinewood Robotics", prospect_job_title: "CTO", meeting_date: iso(subDays(now(), 16)), meeting_time: "09:00", attendance_status: "sat", client_feedback_sat: true, terms_fees: "£12,500 fixed placement fee" }),
  meeting("dms7", { prospect_name: "Hannah Liu", company_name: "Brightwater AI", prospect_job_title: "VP Talent", meeting_date: iso(subDays(now(), 18)), meeting_time: "15:00", attendance_status: "sat", client_feedback_sat: true }),
  meeting("dms8", { prospect_name: "Aisha Rahman", company_name: "Kestrel Software", prospect_job_title: "COO", meeting_date: iso(subDays(now(), 21)), meeting_time: "16:00", attendance_status: "sat", client_feedback_sat: true }),
  meeting("dms9", { prospect_name: "Felix Braun", company_name: "Amberside Data", prospect_job_title: "CTO", meeting_date: iso(subDays(now(), 1)), meeting_time: "10:30", attendance_status: "sat", client_feedback_sat: true, next_job_title: "Lead Data Engineer" }),
  meeting("dms10", { prospect_name: "Naomi Ashcroft", company_name: "Pillarstone Group", prospect_job_title: "Head of People", meeting_date: iso(subDays(now(), 5)), meeting_time: "14:00", attendance_status: "sat", client_feedback_sat: true, terms_fees: "18% of first-year salary" }),
];

export const demoDeclinedMeetings: DemoMeeting[] = [
  meeting("dmd1", {
    prospect_name: "Victor Sable", company_name: "Greyline Partners",
    prospect_job_title: "Director", meeting_date: iso(subDays(now(), 9)),
    meeting_time: "12:00", status: "client_rejected", client_accepted: false,
  }),
];

// ── Warm leads ───────────────────────────────────────────────────────────

const warmLead = (
  id: string, full_name: string, company_name: string, prospect_job_title: string,
  lead_status: string, daysAgo: number,
): Lead => ({
  id,
  company_name,
  full_name,
  prospect_job_title,
  email: `${full_name.split(" ")[0].toLowerCase()}@${company_name.toLowerCase().replace(/[^a-z]/g, "")}.com`,
  linkedin_url: `https://www.linkedin.com/in/${full_name.toLowerCase().replace(/[^a-z]/g, "-")}`,
  company_domain: `${company_name.toLowerCase().replace(/[^a-z]/g, "")}.com`,
  source: "outbound",
  lead_status,
  last_status_update: subDays(now(), daysAgo).toISOString(),
});

export const demoWarmLeads: Lead[] = [
  warmLead("dwl1", "Nathan Brooks", "Coastline Energy", "Engineering Manager", "meeting_booked", 1),
  warmLead("dwl2", "Grace Adeyemi", "Stonebridge Legal", "Practice Manager", "interested", 1),
  warmLead("dwl3", "Leo Marchetti", "Quayside Ventures", "Partner", "interested", 2),
  warmLead("dwl4", "Charlotte Vane", "Hexagon Studios", "Head of Production", "connected", 3),
  warmLead("dwl5", "Dev Patel", "Lattice Biotech", "VP Research Ops", "meeting_booked", 3),
  warmLead("dwl6", "Amy Sørensen", "Foxglove Retail", "People Partner", "connected", 4),
  warmLead("dwl7", "Ben Callaghan", "Ironside Security", "CTO", "callback_scheduled", 5),
  warmLead("dwl8", "Rosa Jiménez", "Palmhouse Hospitality", "Operations Director", "2nd_attempt", 6),
  warmLead("dwl9", "Sam Whitmore", "Redgrave Capital", "COO", "connected", 7),
  warmLead("dwl10", "Isabelle Faure", "Lanterne Logistics", "HR Director", "1st_attempt", 8),
  warmLead("dwl11", "Jonah Kim", "Alderwood Systems", "Head of Talent", "new", 9),
  warmLead("dwl12", "Tessa Bright", "Copperfield Media", "Managing Director", "interested", 10),
];

// ── Lead lists ───────────────────────────────────────────────────────────

export const demoLeadLists: LeadList[] = [
  { id: "dll1", name: "UK SaaS scale-ups — Q3", file_url: null, file_name: "uk-saas-scaleups-q3.csv", status: "approved", client_notes: "Priority list", admin_notes: null, created_at: subDays(now(), 24).toISOString() },
  { id: "dll2", name: "Fintech engineering leaders", file_url: null, file_name: "fintech-eng-leaders.csv", status: "approved", client_notes: null, admin_notes: null, created_at: subDays(now(), 12).toISOString() },
  { id: "dll3", name: "Health-tech expansion targets", file_url: null, file_name: "healthtech-targets.csv", status: "submitted", client_notes: "New vertical test", admin_notes: null, created_at: subDays(now(), 3).toISOString() },
];

// ── Metrics ──────────────────────────────────────────────────────────────

export const demoMetricsTotals = {
  meetingsSat: 47,
  termsSent: 24,
  vacanciesTakenOn: 19,
  potentialPlacementFeeValue: 275000,
  contractValue: 6000,
  warmLeadsCreated: 26,
};

const weekPeriod = (weeksAgo: number, meetingsSat: number, termsSent: number, vacanciesTakenOn: number): PeriodData => {
  const start = startOfWeek(subWeeks(now(), weeksAgo), { weekStartsOn: 1 });
  return {
    label: `w/c ${format(start, "d MMM")}`,
    startDate: start,
    endDate: endOfWeek(start, { weekStartsOn: 1 }),
    meetingsSat,
    termsSent,
    vacanciesTakenOn,
  };
};

const monthPeriod = (monthsAgo: number, meetingsSat: number, termsSent: number, vacanciesTakenOn: number): PeriodData => {
  const start = startOfMonth(subMonths(now(), monthsAgo));
  return {
    label: format(start, "MMMM yyyy"),
    startDate: start,
    endDate: endOfMonth(start),
    meetingsSat,
    termsSent,
    vacanciesTakenOn,
  };
};

export const demoWeeklyData: PeriodData[] = [
  weekPeriod(5, 3, 1, 1),
  weekPeriod(4, 4, 2, 1),
  weekPeriod(3, 4, 2, 2),
  weekPeriod(2, 5, 3, 2),
  weekPeriod(1, 6, 3, 3),
  weekPeriod(0, 4, 2, 2),
];

export const demoMonthlyData: PeriodData[] = [
  monthPeriod(3, 9, 4, 3),
  monthPeriod(2, 12, 6, 5),
  monthPeriod(1, 15, 8, 6),
  monthPeriod(0, 11, 6, 5),
];

// ── Communications ───────────────────────────────────────────────────────

export const demoCsmInfo: CSMInfo = {
  name: "Daniel",
  email: "daniel@meridiansales.example",
  phone: "+44 7700 900456",
};

export const demoCatchups: Catchup[] = [
  { id: "dcu1", scheduled_date: iso(addDays(now(), 2)), scheduled_time: "10:00:00", status: "scheduled" },
  { id: "dcu2", scheduled_date: iso(addDays(now(), 9)), scheduled_time: "10:00:00", status: "scheduled" },
];

// ── Documents ────────────────────────────────────────────────────────────

export const demoDocuments: ClientDocument[] = [
  { id: "ddoc1", title: "Service agreement", description: "Signed campaign agreement", file_path: "demo/agreement.pdf", file_name: "service-agreement.pdf", document_category: "contract", created_at: subWeeks(now(), 15).toISOString() },
  { id: "ddoc2", title: "Campaign invoice — month 1", description: null, file_path: "demo/invoice-1.pdf", file_name: "invoice-001.pdf", document_category: "invoice", created_at: subWeeks(now(), 13).toISOString() },
  { id: "ddoc3", title: "Payment confirmation", description: "Month 1 payment received", file_path: "demo/receipt-1.pdf", file_name: "receipt-001.pdf", document_category: "proof_of_payment", created_at: subWeeks(now(), 12).toISOString() },
  { id: "ddoc4", title: "Placement fee invoice", description: "Staff Engineer placement", file_path: "demo/invoice-2.pdf", file_name: "invoice-002.pdf", document_category: "invoice", created_at: subWeeks(now(), 5).toISOString() },
];

// ── Onboarding journey (mid-flight: form done, call booking active) ──────

export const demoJourney = {
  journey: { status: "active", campaign_live_at: null, released_at: null },
  client: {
    client_profile_id: "demo-profile",
    company_name: "Lanterne Search Partners",
    contact_name: "Craig Bennett",
    email: "craig@lanternesearch.example",
    phone: "+44 7700 900123",
  },
  progress_pct: 25,
  calendar_connection: null,
  stages: [
    { stage_key: "account_setup", title: "Welcome", subtitle: "Your login is ready", order: 10, state: "complete" as const,
      tasks: [{ id: "dj1", step_key: "create_login", label: "Create your login", description: "Welcome to Meridian. This first step is completed automatically the moment you sign in, so you are already under way.", step_type: "confirm", config: { auto: "first_sign_in" }, video_url: null, document_path: null, link_url: null, sort_order: 1, is_completed: true, waived_at: null, answers: null, file_path: null, booking_id: null }] },
    { stage_key: "onboarding_form", title: "About your business", subtitle: "The foundation of your whole campaign", order: 20, state: "complete" as const,
      tasks: [{ id: "dj2", step_key: "onboarding_form", label: "Tell us about your business", description: "Please complete the onboarding form. It is the single most important step in this process: every list we build, every call we make and every message we send begins with these answers.", step_type: "form", config: { questions: [{ key: "company_name", label: "Your Company Name", type: "text", required: true, section: "Business details" }, { key: "elevator_pitch", label: "What's your elevator pitch?", type: "textarea", required: true, section: "Business development" }], sections: ["Business details", "Business development"] }, video_url: null, document_path: null, link_url: null, sort_order: 1, is_completed: true, waived_at: null, answers: { company_name: "Lanterne Search Partners", elevator_pitch: "We place senior finance leaders into PE-backed businesses." }, file_path: null, booking_id: null }] },
    { stage_key: "workspace", title: "Your team@ mailbox", subtitle: "So replies land with you", order: 30, state: "complete" as const,
      tasks: [{ id: "dj3", step_key: "google_workspace", label: "Set up your team@ mailbox", description: 'Campaign emails are sent from an address on your own domain, so that every reply reaches you. Please create team@ followed by your domain in Google Workspace, then enter the address here.', step_type: "form", config: { questions: [{ key: "team_mailbox", label: "The address you created", type: "email", required: true, section: "Mailbox" }], sections: ["Mailbox"], inline: true }, video_url: null, document_path: null, link_url: null, sort_order: 1, is_completed: true, waived_at: null, answers: { team_mailbox: "team@lanternesearch.example" }, file_path: null, booking_id: null }] },
    { stage_key: "book_call", title: "Your onboarding call", subtitle: "Sixty minutes with your Customer Success Manager", order: 40, state: "active" as const,
      tasks: [{ id: "dj4", step_key: "book_onboarding_call", label: "Book your onboarding call", description: "Please choose a time for your sixty-minute onboarding call. The times shown are live availability in UK time, and a calendar invitation with a video link will be sent to you the moment you confirm.", step_type: "booking", config: { event_slug: "onboarding-call-msp-a7w3k" }, video_url: null, document_path: null, link_url: null, sort_order: 1, is_completed: false, waived_at: null, answers: null, file_path: null, booking_id: null }] },
    { stage_key: "calendar", title: "Connect your calendar", subtitle: "Meetings straight into your diary", order: 50, state: "locked" as const,
      tasks: [{ id: "dj5", step_key: "connect_calendar", label: "Connect your calendar to Vexon OS", description: 'Every meeting we book on your behalf should appear in your diary automatically. Please connect your Google or Microsoft calendar here.', step_type: "calendar_connect", config: {}, video_url: null, document_path: null, link_url: null, sort_order: 1, is_completed: false, waived_at: null, answers: null, file_path: null, booking_id: null }] },
    { stage_key: "prepare", title: "Preparing to win", subtitle: "A few things that make the first weeks count", order: 60, state: "locked" as const,
      tasks: [
        { id: "dj6", step_key: "pitch_deck", label: "Your pitch deck", description: 'Please upload your pitch deck or sales one-pager so that our team presents your business exactly as you would.', step_type: "yes_no", config: { question: "Do you have a pitch deck or sales one-pager?", on_yes: "upload", multiple: true }, video_url: null, document_path: null, link_url: null, sort_order: 1, is_completed: false, waived_at: null, answers: null, file_path: null, booking_id: null },
        { id: "dj7", step_key: "target_companies", label: "Companies to prioritise", description: "If there are specific companies or warm prospects you would like us to approach first, please share them here.", step_type: "yes_no", config: { question: "Do you have a list of companies or warm prospects you would like us to prioritise?", on_yes: "upload_or_list", multiple: true }, video_url: null, document_path: null, link_url: null, sort_order: 1, is_completed: false, waived_at: null, answers: null, file_path: null, booking_id: null },
        { id: "dj8", step_key: "reengage", label: "Relationships worth re-engaging", description: "Past clients, opportunities that went quiet and conversations that never converted. Share them here and we will pick them up in the first week.", step_type: "yes_no", config: { question: "Are there past clients, dormant opportunities or previous conversations we should re-engage on your behalf?", on_yes: "upload_or_list", multiple: true }, video_url: null, document_path: null, link_url: null, sort_order: 1, is_completed: false, waived_at: null, answers: null, file_path: null, booking_id: null },
        { id: "dj9", step_key: "do_not_contact", label: "Do not contact list", description: 'Please tell us about any companies or individuals we should never approach. They will be excluded from every campaign list.', step_type: "yes_no", config: { question: "Are there any companies or individuals we must not contact?", on_yes: "upload_or_list", multiple: true, no_label: "No, nobody" }, video_url: null, document_path: null, link_url: null, sort_order: 1, is_completed: false, waived_at: null, answers: null, file_path: null, booking_id: null },
        { id: "dj10", step_key: "fee_plans", label: "Standardised terms", description: 'If you have documented fee structures or service tiers, please upload them here so that we describe your terms exactly as you would.', step_type: "yes_no", config: { question: "Do you have documented fee structures or service tiers?", on_yes: "upload", multiple: true, done_label: "Standardised terms provided" }, video_url: null, document_path: null, link_url: null, sort_order: 1, is_completed: false, waived_at: null, answers: null, file_path: null, booking_id: null },
        { id: "dj11", step_key: "anything_else", label: "Anything else that helps us represent you", description: 'Case studies, testimonials, brand guidelines, live job specifications. If nothing comes to mind, mark this card as complete.', step_type: "yes_no", config: { question: "Is there anything else that would help us represent you well?", on_yes: "upload", multiple: true, no_label: "Nothing for now" }, video_url: null, document_path: null, link_url: null, sort_order: 1, is_completed: false, waived_at: null, answers: null, file_path: null, booking_id: null },
      ] },
  ],
};
