import { useState, useEffect, useRef } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, subMonths } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ButtonV2, Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Plus, TrendingUp, ArrowUpRight, CheckCircle2, History, Upload, X, CalendarPlus, NotebookPen, ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as BigCalendar, momentLocalizer, Views } from "react-big-calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { SetterMeetingDetailSheet, type SetterMeetingDetailSheetDemo } from "@/components/setter/SetterMeetingDetailSheet";
import { BookingSlotPicker, utcToLondonParts, type BookingSlot } from "@/components/bookings/BookingSlotPicker";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";
import { convertTrialLead, formatProposedTime, usePushedTrialLeads, type TrialLead } from "@/hooks/useTrialDay";
import { Calendar as CalendarIcon, Inbox } from "lucide-react";
import { isCallbackBooking } from "../../../supabase/functions/_shared/callback.ts";


const localizer = momentLocalizer(moment);

export interface MeetingRecord {
  id: string;
  company_name: string;
  company_website?: string | null;
  meeting_date: string;
  meeting_time: string;
  status: string;
  attendance_status?: string;
  prospect_name: string;
  prospect_email: string;
  prospect_mobile?: string | null;
  prospect_linkedin?: string | null;
  prospect_job_title?: string | null;
  notes?: string;
  approved_by_admin?: boolean;
  close_lead_link?: string | null;
  currently_hiring?: boolean | null;
  next_job_title?: string | null;
  worked_with_agencies?: boolean | null;
  follow_up_sent?: boolean | null;
  reminder_sent?: boolean | null;
  client_accepted?: boolean | null;
  company_headcount?: string | null;
  revenue_last_12_months?: string | null;
  worked_with_lead_gen_agency?: string | null;
  sector_over_1000_companies?: boolean | null;
  capacity_5_10?: boolean | null;
  agency_led?: string | null;
  vacancies_from_new_clients_last_month?: string | null;
  bd_bottleneck?: string | null;
  target_job_titles?: string | null;
  only_decision_maker?: boolean | null;
  start_timeline?: string | null;
  appointment_source?: string | null;
  is_rebook?: boolean | null;
  original_meeting_id?: string | null;
  created_at?: string | null;
  assigned_ae_id?: string | null;
  client_confirmed_attendance?: boolean | null;
  prospect_watched_video?: boolean | null;
  client_profile_id?: string | null;
  lead_type?: string | null;
  open_to_receiving_cvs?: boolean | null;
  cv_candidate_titles?: string | null;
  cv_candidate_level?: string | null;
  other_decision_makers?: boolean | null;
  decision_maker_status?: string | null;
  decision_maker_email?: string | null;
  job_roles?: JobRole[] | null;
  job_spec_provided?: boolean | null;
  client_profiles?: { id: string; company_name: string } | null;
}

/** One past commission cycle with the sat meetings that earned it (Commission History tab). */
export interface CommissionHistoryCycle {
  /** e.g. "Sep Cycle" */
  month: string;
  /** e.g. "26 Aug – 25 Sep 2026" */
  label: string;
  satMeetings: number;
  commission: number;
  meetings: Array<Pick<MeetingRecord, 'id' | 'company_name' | 'prospect_name' | 'meeting_date' | 'meeting_time'>>;
}

/** Light row for the current-cycle commission query (counts + invoice ids only). */
type CycleMeetingRow = Pick<MeetingRecord, 'id' | 'attendance_status' | 'is_rebook' | 'meeting_date'>;

export type JobRole = { title: string; salary: number | null; currency: 'GBP' | 'USD' | 'EUR' | 'ZAR' };

export const EMPTY_MEETING_FORM = {
  prospect_name: "",
  prospect_email: "",
  prospect_mobile: "",
  prospect_linkedin: "",
  prospect_job_title: "",
  company_name: "",
  company_website: "",
  meeting_date: "",
  meeting_time: "",
  notes: "",
  close_lead_link: "",
  google_meet_link: "",
  currently_hiring: false,
  next_job_title: "",
  worked_with_agencies: false,
  follow_up_sent: false,
  reminder_sent: false,
  client_accepted: false,
  client_profile_id: "",
  company_headcount: "",
  revenue_last_12_months: "",
  worked_with_lead_gen_agency: "",
  hiring_frequency: "",
  sector_over_1000_companies: "",
  only_decision_maker: "",
  start_timeline: "",
  // 17 Sep (Marcus): capacity for 5–10 more vacancies per month — "no" disqualifies.
  capacity_5_10: "",
  // 22 Sep (Marcus): industry led vs candidate led, plus three questions that
  // gather context and disqualify nobody. The 1,000-companies and start-timeline
  // questions were dropped the same morning.
  agency_led: "",
  vacancies_from_new_clients_last_month: "",
  bd_bottleneck: "",
  target_job_titles: "",
};
export type MeetingFormData = typeof EMPTY_MEETING_FORM;

// ── Pure presentation helpers (shared by the live controller and the demo) ──

export const getMeetingStatusColor = (meeting: MeetingRecord) => {
  if (meeting.attendance_status === 'sat') return "hsl(142, 71%, 45%)";
  if (meeting.attendance_status === 'cancelled') return "hsl(0, 84%, 60%)";
  if (meeting.attendance_status === 'rescheduled') return "hsl(38, 92%, 50%)";
  if (meeting.attendance_status === 'no_show') return "hsl(0, 84%, 60%)";
  if (meeting.approved_by_admin) return "hsl(217, 91%, 60%)";
  if (meeting.status === "rejected") return "hsl(0, 84%, 60%)";
  return "hsl(262, 83%, 58%)";
};

export const getMeetingStatusLabel = (meeting: MeetingRecord) => {
  const s = meeting.attendance_status;
  if (s === 'sat') return 'Sat';
  if (s === 'cancelled') return 'Cancelled';
  if (s === 'rescheduled') return 'Rescheduled';
  if (s === 'no_show') return 'No Show';
  return 'Pending';
};

export const getMeetingStatusBadgeVariant = (meeting: MeetingRecord): "success" | "destructive" | "secondary" | "outline" => {
  const s = meeting.attendance_status;
  if (s === 'sat') return 'success';
  if (s === 'cancelled' || s === 'no_show') return 'destructive';
  if (s === 'rescheduled') return 'secondary';
  return 'outline';
};

export const meetingEventStyleGetter = (event: { resource: MeetingRecord }) => ({
  style: {
    backgroundColor: getMeetingStatusColor(event.resource),
    borderRadius: "4px",
    opacity: 0.9,
    color: "white",
    border: "none",
    display: "block",
  },
});

export const toCalendarEvents = (meetings: MeetingRecord[]) =>
  meetings.map((meeting) => {
    const startDate = new Date(`${meeting.meeting_date}T${meeting.meeting_time}`);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    return { title: meeting.company_name, start: startDate, end: endDate, resource: meeting };
  });

/**
 * Split a setter's meetings into the tab buckets. Both departments confirm
 * attendance (Marcus, 21 Aug); the testimonial-video question is
 * acquisition-only.
 */
export const bucketMeetings = (meetings: MeetingRecord[], today: string, department: string) => {
  const upcomingMeetings = meetings.filter(m => m.meeting_date >= today && !m.is_rebook);
  const pastMeetings = meetings.filter(m => m.meeting_date < today && !m.is_rebook);
  const rebookedMeetings = meetings.filter(m => m.is_rebook);
  // Originals that have been rebooked — their invite may still be live and
  // cancellable from the detail sheet (rebooks no longer auto-cancel them)
  const supersededMeetingIds = new Set(
    meetings.filter(m => m.is_rebook && m.original_meeting_id).map(m => m.original_meeting_id as string)
  );
  const needsConfirmationMeetings = meetings.filter(m =>
    m.meeting_date === today &&
    !m.is_rebook &&
    m.status !== 'cancelled' &&
    m.attendance_status !== 'cancelled' &&
    m.attendance_status !== 'rescheduled' &&
    (m.client_confirmed_attendance === null || m.client_confirmed_attendance === undefined ||
     (department === 'acquisition' &&
      (m.prospect_watched_video === null || m.prospect_watched_video === undefined)))
  );
  return { upcomingMeetings, pastMeetings, rebookedMeetings, supersededMeetingIds, needsConfirmationMeetings };
};

// ── Commission cycles (26th → 25th) ─────────────────────────────────────────
// One source of truth for the cycle maths that used to be inlined three times
// on this page. `offset` 0 is the cycle containing `now`, 1 the one before, …

export interface CommissionCycle {
  offset: number;
  start: Date;
  end: Date;
  startStr: string;
  endStr: string;
  /** e.g. "26 Jul – 25 Aug 2026" (both years shown when the cycle straddles New Year). */
  label: string;
}

export const getCommissionCycle = (offset = 0, now: Date = new Date()): CommissionCycle => {
  const baseStart = now.getDate() >= 26
    ? new Date(now.getFullYear(), now.getMonth(), 26)
    : new Date(now.getFullYear(), now.getMonth() - 1, 26);
  const start = subMonths(baseStart, offset);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25);
  const label = start.getFullYear() === end.getFullYear()
    ? `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
    : `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
  return {
    offset,
    start,
    end,
    startStr: format(start, 'yyyy-MM-dd'),
    endStr: format(end, 'yyyy-MM-dd'),
    label,
  };
};

/**
 * Range picker for the appointments list (13 Sep). Setters "lost" their
 * history on the 26th because the list was hard-scoped to the current cycle.
 * Value: "0" = this cycle, "1".."12" = previous cycles, "all" = all time.
 * Commission cards are NOT driven by this — they always use the current cycle.
 */
export type MeetingsRangeValue = string;
export const CURRENT_CYCLE_RANGE: MeetingsRangeValue = '0';
export const ALL_TIME_RANGE: MeetingsRangeValue = 'all';
export const PREVIOUS_CYCLES_SHOWN = 12;
/** "All time" page size — the list grows by this much per "Load more". */
export const ALL_TIME_PAGE_SIZE = 100;
/** Safety cap on a single cycle-scoped fetch (a setter never nears this in one cycle). */
export const CYCLE_ROW_CAP = 1000;

export const buildMeetingsRangeOptions = (now: Date = new Date()): Array<{ value: MeetingsRangeValue; label: string }> => [
  { value: CURRENT_CYCLE_RANGE, label: `This cycle (${getCommissionCycle(0, now).label})` },
  ...Array.from({ length: PREVIOUS_CYCLES_SHOWN }, (_, i) => {
    const cycle = getCommissionCycle(i + 1, now);
    return { value: String(cycle.offset), label: cycle.label };
  }),
  { value: ALL_TIME_RANGE, label: 'All time' },
];

/**
 * Date window for a picker value. `null` = no bounds (all time). The current
 * cycle keeps an open upper bound so appointments booked for future dates
 * always appear, exactly as before.
 */
export const rangeToWindow = (
  value: MeetingsRangeValue,
  now: Date = new Date(),
): { startStr: string; endStr: string | null } | null => {
  if (value === ALL_TIME_RANGE) return null;
  const offset = Math.max(0, Number(value) || 0);
  const cycle = getCommissionCycle(offset, now);
  return { startStr: cycle.startStr, endStr: offset === 0 ? null : cycle.endStr };
};

/** Short, human description of a picker value for headings ("this cycle", "26 Jul – 25 Aug 2026", "all time"). */
export const describeMeetingsRange = (value: MeetingsRangeValue, now: Date = new Date()): string => {
  if (value === ALL_TIME_RANGE) return 'all time';
  if (value === CURRENT_CYCLE_RANGE) return 'this cycle';
  return getCommissionCycle(Math.max(0, Number(value) || 0), now).label;
};

/** Client-side twin of the list query's date filter (demo surface). */
export const filterMeetingsToRange = (rows: MeetingRecord[], value: MeetingsRangeValue, now: Date = new Date()) => {
  const window = rangeToWindow(value, now);
  if (!window) return rows;
  return rows.filter(m =>
    m.meeting_date >= window.startStr && (window.endStr === null || m.meeting_date <= window.endStr)
  );
};

/** The slice of setters_profiles this page reads. */
export interface SetterMeetingsProfile {
  id: string;
  user_id?: string | null;
  department?: string | null;
  per_meeting_bonus?: number | null;
  full_name?: string | null;
}

/**
 * Wizard/dialog state (3 Sep split). Shared by the live controller and the
 * setter demo surface so the demo's "Log Appointment" form types and steps
 * exactly like the real one, without duplicating fifty useStates.
 */
export const useSetterMeetingsUiState = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [meetingMode, setMeetingMode] = useState<'fresh' | 'rebook'>('fresh');
  const [leadType, setLeadType] = useState<'video_conference' | 'mobile_phone_call' | 'terms_sent'>('video_conference');
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [redirectClient, setRedirectClient] = useState(false);
  const [assignedAeId, setAssignedAeId] = useState("");
  // Cold call is the default source (Marcus 2026-08-20); setters can change it
  const [appointmentSource, setAppointmentSource] = useState("cold_call");
  // Booking platform (acquisition): the chosen live slot, or manual fallback
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [useManualTime, setUseManualTime] = useState(false);
  // Acquisition two-step wizard: 1 = details + qualification, 2 = pick a time
  const [formStep, setFormStep] = useState<1 | 2>(1);
  // Rebook: the original meeting this booking replaces (prefill + retire-old)
  const [rebookSourceId, setRebookSourceId] = useState<string | null>(null);
  // Rebooks keep the original calendar invite alive (Marcus, 21 Aug) — this
  // drives the manual "cancel invite" prompt/action for either side of a pair
  const [inviteRelease, setInviteRelease] = useState<{ meetingId: string; kind: 'original' | 'rebook' } | null>(null);
  const [releasingInvite, setReleasingInvite] = useState(false);
  // Trial Day (15 Sep): the trialist lead this appointment converts, if any.
  const [trialLeadId, setTrialLeadId] = useState<string | null>(null);
  // Job Spec fields (acquisition mobile_phone_call flow)
  const [jobSpecs, setJobSpecs] = useState<Array<{ type: 'text' | 'file'; content: string; file_name?: string; file?: File }>>([]);
  // Terms fees field
  const [termsFees, setTermsFees] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fulfilment-only: dynamic job roles list and inline entry inputs
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [roleDraft, setRoleDraft] = useState<{ title: string; salary: string; currency: JobRole['currency'] }>({
    title: "",
    salary: "",
    currency: 'GBP',
  });

  // Fulfilment-only: job spec provided + payload
  const [jobSpecProvided, setJobSpecProvided] = useState<'yes' | 'no' | null>(null);
  const [jobSpecText, setJobSpecText] = useState("");
  const [jobSpecFile, setJobSpecFile] = useState<File | null>(null);
  // Fulfilment manual log (12 Oct): the same qualification tree as the client
  // booking page, so a meeting logged by hand carries the same answers.
  const [fqHiring, setFqHiring] = useState<'' | 'yes' | 'no'>('');
  const [fqOpenCvs, setFqOpenCvs] = useState<'' | 'yes' | 'no'>('');
  const [fqCvTitles, setFqCvTitles] = useState("");
  const [fqCvLevel, setFqCvLevel] = useState("");
  const [fqDm, setFqDm] = useState<'' | 'yes' | 'no'>('');
  const [fqDmStatus, setFqDmStatus] = useState<'' | 'joining' | 'briefed_by_prospect' | 'email_pending'>('');
  const [fqDmEmail, setFqDmEmail] = useState("");
  const [fqOverride, setFqOverride] = useState(false);
  const [fqOverrideReason, setFqOverrideReason] = useState("");
  const [closeLookup, setCloseLookup] = useState<{ status: 'idle' | 'looking' | 'found' | 'failed'; error?: string }>({ status: 'idle' });
  const [kronosSend, setKronosSend] = useState<MeetingRecord | null>(null);
  const [moveMeeting, setMoveMeeting] = useState<MeetingRecord | null>(null);
  const jobSpecFileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<MeetingFormData>(EMPTY_MEETING_FORM);

  // Appointments list range (picker above the tabs). Changing the range
  // resets the "All time" page so a fresh pick never starts deep in a list.
  const [meetingsRange, setMeetingsRangeRaw] = useState<MeetingsRangeValue>(CURRENT_CYCLE_RANGE);
  const [allTimeLimit, setAllTimeLimit] = useState(ALL_TIME_PAGE_SIZE);
  const setMeetingsRange = (value: MeetingsRangeValue) => {
    setMeetingsRangeRaw(value);
    setAllTimeLimit(ALL_TIME_PAGE_SIZE);
  };

  return {
    isOpen, setIsOpen,
    isSubmitting, setIsSubmitting,
    meetingMode, setMeetingMode,
    leadType, setLeadType,
    showCalendar, setShowCalendar,
    selectedMeeting, setSelectedMeeting,
    isDetailOpen, setIsDetailOpen,
    clientSearch, setClientSearch,
    showClientDropdown, setShowClientDropdown,
    redirectClient, setRedirectClient,
    assignedAeId, setAssignedAeId,
    appointmentSource, setAppointmentSource,
    bookingSlot, setBookingSlot,
    useManualTime, setUseManualTime,
    formStep, setFormStep,
    rebookSourceId, setRebookSourceId,
    inviteRelease, setInviteRelease,
    releasingInvite, setReleasingInvite,
    trialLeadId, setTrialLeadId,
    jobSpecs, setJobSpecs,
    termsFees, setTermsFees,
    fileInputRef,
    jobRoles, setJobRoles,
    roleDraft, setRoleDraft,
    jobSpecProvided, setJobSpecProvided,
    jobSpecText, setJobSpecText,
    jobSpecFile, setJobSpecFile,
    jobSpecFileInputRef,
    fqHiring, setFqHiring,
    fqOpenCvs, setFqOpenCvs,
    fqCvTitles, setFqCvTitles,
    fqCvLevel, setFqCvLevel,
    fqDm, setFqDm,
    fqDmStatus, setFqDmStatus,
    fqDmEmail, setFqDmEmail,
    fqOverride, setFqOverride,
    fqOverrideReason, setFqOverrideReason,
    closeLookup, setCloseLookup,
    kronosSend, setKronosSend,
    moveMeeting, setMoveMeeting,
    formData, setFormData,
    meetingsRange, setMeetingsRange,
    allTimeLimit, setAllTimeLimit,
  };
};

export type SetterMeetingsUiState = ReturnType<typeof useSetterMeetingsUiState>;

/**
 * Rebook from the detail sheet: prefill everything from the original meeting
 * so the setter never re-types — they only pick the new time. Shared by the
 * live controller and the demo surface.
 */
export const applyRebook = (ui: SetterMeetingsUiState, m: MeetingRecord) => {
  ui.setFormData((f) => ({
    ...f,
    prospect_name: m.prospect_name || "",
    prospect_email: m.prospect_email || "",
    prospect_mobile: m.prospect_mobile || "",
    prospect_linkedin: m.prospect_linkedin || "",
    prospect_job_title: m.prospect_job_title || "",
    company_name: m.company_name || "",
    company_website: m.company_website || "",
    notes: m.notes || "",
    close_lead_link: m.close_lead_link || "",
    meeting_date: "",
    meeting_time: "",
    revenue_last_12_months: m.revenue_last_12_months || "",
    sector_over_1000_companies:
      m.sector_over_1000_companies == null ? "" : m.sector_over_1000_companies ? "yes" : "no",
    only_decision_maker:
      m.only_decision_maker == null ? "" : m.only_decision_maker ? "yes" : "no",
    start_timeline: m.start_timeline || "",
    capacity_5_10: m.capacity_5_10 == null ? "" : m.capacity_5_10 ? "yes" : "no",
    agency_led: m.agency_led || "",
    vacancies_from_new_clients_last_month: m.vacancies_from_new_clients_last_month || "",
    bd_bottleneck: m.bd_bottleneck || "",
    target_job_titles: m.target_job_titles || "",
  }));
  ui.setAssignedAeId(m.assigned_ae_id || "");
  ui.setAppointmentSource(m.appointment_source || "cold_call");
  ui.setMeetingMode('rebook');
  ui.setRebookSourceId(m.id);
  ui.setBookingSlot(null);
  ui.setUseManualTime(false);
  ui.setFormStep(1);
  ui.setIsDetailOpen(false);
  ui.setIsOpen(true);
};

/**
 * Trial Day (15 Sep): "Book appointment" on a lead Daniel pushed. Prefill
 * everything the trialist gathered so the setter only confirms the time.
 * The twin of applyRebook.
 */
export const applyPushedLead = (ui: SetterMeetingsUiState, lead: TrialLead) => {
  ui.setFormData((f) => ({
    ...f,
    prospect_name: lead.contact_name || "",
    prospect_email: lead.contact_email || "",
    prospect_mobile: lead.contact_mobile || "",
    prospect_linkedin: lead.linkedin_url || "",
    prospect_job_title: lead.contact_title || "",
    company_name: lead.company_name || "",
    company_website: lead.company_website || "",
    close_lead_link: lead.close_lead_link || "",
    client_profile_id: lead.client_profile_id || "",
    currently_hiring: lead.currently_hiring === true,
    meeting_date: "",
    meeting_time: "",
    notes: [
      lead.review_notes ? `From Daniel: ${lead.review_notes}` : "",
      lead.trialist_notes ? `Trialist: ${lead.trialist_notes}` : "",
      lead.proposed_times.length ? `Times offered: ${lead.proposed_times.map(formatProposedTime).join(", ")}` : "",
    ].filter(Boolean).join("\n"),
  }));
  ui.setJobRoles(lead.job_roles ?? []);
  ui.setJobSpecProvided(lead.job_spec_provided == null ? null : lead.job_spec_provided ? 'yes' : 'no');
  ui.setLeadType('video_conference');
  ui.setMeetingMode('fresh');
  ui.setRebookSourceId(null);
  ui.setTrialLeadId(lead.id);
  ui.setBookingSlot(null);
  ui.setUseManualTime(false);
  ui.setFormStep(1);
  ui.setIsDetailOpen(false);
  ui.setIsOpen(true);
};

/** Reset the wizard after a successful log/rebook. Shared with the demo surface. */
export const resetMeetingWizard = (ui: SetterMeetingsUiState) => {
  ui.setIsOpen(false);
  ui.setTrialLeadId(null);
  ui.setMeetingMode('fresh');
  ui.setLeadType('video_conference');
  ui.setJobSpecs([]);
  ui.setTermsFees("");
  ui.setFormData(EMPTY_MEETING_FORM);
  ui.setClientSearch("");
  ui.setRedirectClient(false);
  ui.setAssignedAeId("");
  ui.setAppointmentSource("cold_call");
  ui.setBookingSlot(null);
  ui.setUseManualTime(false);
  ui.setFormStep(1);
  ui.setRebookSourceId(null);
  ui.setJobRoles([]);
  ui.setRoleDraft({ title: "", salary: "", currency: 'GBP' });
  ui.setJobSpecProvided(null);
  ui.setJobSpecText("");
  ui.setJobSpecFile(null);
  ui.setFqHiring('');
  ui.setFqOpenCvs('');
  ui.setFqCvTitles("");
  ui.setFqCvLevel("");
  ui.setFqDm('');
  ui.setFqDmStatus('');
  ui.setFqDmEmail("");
  ui.setFqOverride(false);
  ui.setFqOverrideReason("");
  ui.setCloseLookup({ status: 'idle' });
};

/** Everything the View needs beyond the UI state: data, derived values, effectful handlers. */
export interface SetterMeetingsData {
  userProfile: { userId: string; profile: SetterMeetingsProfile | null } | null | undefined;
  setterDepartment: string;
  clientProfiles: Array<{ id: string; company_name: string; contact_name: string | null }> | undefined;
  accountExecutives: Array<{ id: string; full_name: string | null; email: string | null }> | undefined;
  followUpSlug: string | null | undefined;
  bookingEventType: any;
  aeIsBookingHost: boolean;
  liveBookingActive: boolean;
  canContinueToBooking: boolean;
  todayRosteredClients: Array<{ id: string; company_name: string }> | undefined;
  isLoading: boolean;
  refetchMeetings: () => void;
  historicalData: CommissionHistoryCycle[] | undefined;
  startRebook: (m: MeetingRecord) => void;
  releaseInvite: (meetingId: string, kind: 'original' | 'rebook') => Promise<void>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  calendarEvents: Array<{ title: string; start: Date; end: Date; resource: MeetingRecord }>;
  eventStyleGetter: (event: { resource: MeetingRecord }) => { style: Record<string, string | number> };
  getStatusLabel: (meeting: MeetingRecord) => string;
  getStatusBadgeVariant: (meeting: MeetingRecord) => "success" | "destructive" | "secondary" | "outline";
  perMeetingBonus: number;
  meetingsSat: number;
  commissionEarned: number;
  totalMeetingsBooked: number;
  projectedCommission: number;
  pendingMeetings: number;
  upcomingMeetings: MeetingRecord[];
  pastMeetings: MeetingRecord[];
  rebookedMeetings: MeetingRecord[];
  supersededMeetingIds: Set<string>;
  needsConfirmationMeetings: MeetingRecord[];
  /** "All time" paging: another page exists beyond what is listed. */
  hasMoreMeetings: boolean;
  loadMoreMeetings: () => void;
  isLoadingMore: boolean;
  /** Demo surface only: answer a confirmation question without touching the DB. */
  onConfirmationUpdate?: (meetingId: string, field: 'client_confirmed_attendance' | 'prospect_watched_video', value: boolean) => Promise<void>;
  /** Demo surface only: the detail sheet's Edit/Delete work on local rows, no queries. */
  detailSheetDemo?: SetterMeetingDetailSheetDemo;
  /** Demo surface only: fixture availability for the live slot picker (no edge function call). */
  demoSlots?: BookingSlot[];
}

export type SetterMeetingsViewProps = SetterMeetingsUiState & SetterMeetingsData;

const useSetterMeetingsController = (): SetterMeetingsViewProps => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const ui = useSetterMeetingsUiState();
  const {
    isOpen, setIsOpen,
    isSubmitting, setIsSubmitting,
    meetingMode, setMeetingMode,
    leadType, setLeadType,
    setSelectedMeeting,
    setIsDetailOpen,
    setClientSearch,
    redirectClient, setRedirectClient,
    assignedAeId, setAssignedAeId,
    appointmentSource, setAppointmentSource,
    bookingSlot, setBookingSlot,
    useManualTime, setUseManualTime,
    setFormStep,
    rebookSourceId, setRebookSourceId,
    setInviteRelease,
    setReleasingInvite,
    trialLeadId,
    jobSpecs, setJobSpecs,
    termsFees, setTermsFees,
    jobRoles, setJobRoles,
    setRoleDraft,
    jobSpecProvided, setJobSpecProvided,
    jobSpecText, setJobSpecText,
    jobSpecFile, setJobSpecFile,
    fqHiring, fqOpenCvs, fqCvTitles, fqCvLevel, fqDm, fqDmStatus, fqDmEmail, fqOverride, fqOverrideReason,
    formData, setFormData,
    meetingsRange,
    allTimeLimit, setAllTimeLimit,
  } = ui;

  // Get current user profile with commission info
  const { data: userProfile } = useQuery({
    queryKey: ['setter-meetings-profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data: profile } = await supabase
        .from('setters_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      return { userId: user.id, profile: profile as SetterMeetingsProfile | null };
    }
  });

  const setterDepartment = userProfile?.profile?.department || 'fulfilment';

  // Fetch client profiles for assignment (fulfilment only)
  const { data: clientProfiles } = useQuery({
    queryKey: ['client-profiles-for-meetings'],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_profiles")
        .select("id, company_name, contact_name")
        .eq("status", "active")
        .order("company_name", { ascending: true });
      
      return data || [];
    },
    enabled: setterDepartment !== 'acquisition',
  });

  // Fetch account executives for AE assignment (acquisition setters only)
  // Assignable = users with the account_executive role, plus a small allowlist
  // of non-AE users who are explicitly allowed to take discovery calls
  // (currently only Marcus Hale).
  const EXTRA_ASSIGNABLE_USER_IDS = ['a59995b2-0ecd-4aa0-8698-a8399d4423dd']; // Marcus Hale
  const { data: accountExecutives } = useQuery({
    queryKey: ['account-executives-for-assignment'],
    queryFn: async () => {
      const [{ data: aeRoles }, offboarded] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "account_executive"),
        fetchOffboardedUserIds(),
      ]);
      const aeUserIds = Array.from(
        new Set([...(aeRoles || []).map(r => r.user_id), ...EXTRA_ASSIGNABLE_USER_IDS])
      ).filter(id => !offboarded.has(id));
      if (!aeUserIds.length) return [];
      const aeIdSet = new Set((aeRoles || []).map(r => r.user_id));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", aeUserIds);
      return (profiles || []).sort((a, b) => {
        // AEs first, then extra assignees
        const ra = aeIdSet.has(a.id) ? 0 : 1;
        const rb = aeIdSet.has(b.id) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '');
      });
    },
    enabled: setterDepartment === 'acquisition',
  });

  // Follow-up booking page for the header chooser (Marcus, 1 Sep): resolved
  // by purpose rather than a hardcoded slug so a host change (Oliver →
  // Marcus → whoever's next) needs no code edit. Prefetched so the click
  // opens the tab synchronously — an awaited open gets popup-blocked.
  const { data: followUpSlug } = useQuery({
    queryKey: ["acq-follow-up-page-slug"],
    enabled: setterDepartment === "acquisition",
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("booking_event_types")
        .select("slug")
        .eq("side", "acquisition")
        .eq("event_purpose", "follow_up")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data?.slug ?? null;
    },
  });

  // Booking platform: the single active acquisition event type (one test event
  // for the pilot). When present and the assigned AE is one of its hosts, the
  // date/time inputs become a live slot picker.
  const { data: bookingEventType } = useQuery({
    queryKey: ["acq-booking-event-type"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("booking_event_types")
        .select("id, name, duration_minutes, booking_event_hosts(host_user_id)")
        .eq("side", "acquisition")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data || null;
    },
    enabled: setterDepartment === 'acquisition',
  });
  const aeIsBookingHost = !!(
    bookingEventType &&
    assignedAeId &&
    (bookingEventType.booking_event_hosts || []).some((h: any) => h.host_user_id === assignedAeId)
  );
  const liveBookingActive =
    setterDepartment === 'acquisition' && !!bookingEventType && !useManualTime;

  // Step-1 gate: everything must be answered before times are shown (qual-first).
  const canContinueToBooking =
    !!assignedAeId && !!appointmentSource &&
    !!formData.prospect_name.trim() && !!formData.prospect_email.trim() &&
    !!formData.company_name.trim() &&
    !!formData.revenue_last_12_months &&
    !!formData.only_decision_maker && !!formData.agency_led &&
    formData.capacity_5_10 === "yes";

  // Fetch today's rostered client(s) for fulfilment setters (a setter can have multiple)
  const { data: todayRosteredClients } = useQuery({
    queryKey: ['today-rostered-clients-meetings', userProfile?.profile?.id],
    queryFn: async (): Promise<Array<{ id: string; company_name: string }>> => {
      if (!userProfile?.profile?.id) return [];
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const { data: rows } = await (supabase
        .from('roster_entries')
        .select('client_profile_id')
        .eq('setter_profile_id', userProfile.profile.id) as any)
        .eq('roster_date', todayStr);
      const ids = Array.from(
        new Set((rows || []).map((r: any) => r.client_profile_id).filter(Boolean))
      ) as string[];
      if (ids.length === 0) return [];
      const { data: clientData } = await supabase
        .from('client_profiles')
        .select('id, company_name')
        .in('id', ids);
      return (clientData || []) as Array<{ id: string; company_name: string }>;
    },
    enabled: !!userProfile?.profile?.id && setterDepartment !== 'acquisition',
  });

  // Backwards-compatible single primary rostered client (first one)
  const todayRosteredClient = todayRosteredClients && todayRosteredClients.length > 0
    ? todayRosteredClients[0]
    : null;
  const hasMultipleRosteredClients = (todayRosteredClients?.length || 0) > 1;

  // When the meeting modal opens, default the selection to the first rostered client
  // so even setters with multiple roster entries start with one pre-selected.
  useEffect(() => {
    if (!isOpen) return;
    if (setterDepartment === 'acquisition') return;
    if (formData.client_profile_id) return;
    if (redirectClient) return;
    const first = todayRosteredClients?.[0];
    if (first) {
      setFormData((prev) => ({ ...prev, client_profile_id: first.id }));
    }
  }, [isOpen, todayRosteredClients, setterDepartment, redirectClient]);

  // Commission cycle boundaries (26th → 25th). Commission cards and the
  // invoice submission ALWAYS use the current cycle; only the appointments
  // list below follows the range picker.
  const currentCycle = getCommissionCycle(0);
  const cycleStart = currentCycle.start;
  const cycleEnd = currentCycle.end;
  const cycleStartStr = currentCycle.startStr;
  const cycleEndStr = currentCycle.endStr;

  const rangeWindow = rangeToWindow(meetingsRange);
  const isAllTime = rangeWindow === null;

  // Appointments LIST — scoped by the picker. Key prefix stays
  // 'setter-meetings-data' so existing invalidations (confirmation modal)
  // still hit it.
  const {
    data: meetingsList,
    isLoading: isListLoading,
    isFetching: isListFetching,
    isPlaceholderData: isListPlaceholder,
    refetch: refetchMeetingsList,
  } = useQuery({
    queryKey: ['setter-meetings-data', userProfile?.userId, meetingsRange, isAllTime ? allTimeLimit : null],
    queryFn: async (): Promise<{ meetings: MeetingRecord[]; hasMore: boolean }> => {
      if (!userProfile?.userId) return { meetings: [], hasMore: false };

      let query = supabase
        .from("meetings")
        .select(`
          id, company_name, company_website, meeting_date, meeting_time, status, attendance_status, 
          prospect_name, prospect_email, prospect_mobile, prospect_linkedin, prospect_job_title,
          notes, approved_by_admin, close_lead_link, google_meet_link, currently_hiring, next_job_title, 
          worked_with_agencies, follow_up_sent, reminder_sent, client_accepted,
          company_headcount, revenue_last_12_months, worked_with_lead_gen_agency,
          sector_over_1000_companies, only_decision_maker, start_timeline, appointment_source,
          capacity_5_10, agency_led, vacancies_from_new_clients_last_month, bd_bottleneck, target_job_titles,
          is_rebook, original_meeting_id, edited_at, edited_by, created_at, assigned_ae_id,
          client_confirmed_attendance, prospect_watched_video,
          client_profile_id, lead_type, open_to_receiving_cvs, cv_candidate_titles, cv_candidate_level,
          other_decision_makers, decision_maker_status, decision_maker_email, job_roles, job_spec_provided,
          client_profiles!meetings_client_profile_id_fkey(id, company_name)
        `)
        .or(`setter_id.eq.${userProfile.userId},logged_by_setter_id.eq.${userProfile.userId}`)
        .order("meeting_date", { ascending: false })
        .order("meeting_time", { ascending: false });

      if (rangeWindow) {
        // A single cycle: lower bound always; upper bound only for past
        // cycles (the current cycle stays open so future bookings show).
        query = query.gte("meeting_date", rangeWindow.startStr);
        if (rangeWindow.endStr) query = query.lte("meeting_date", rangeWindow.endStr);
        query = query.limit(CYCLE_ROW_CAP);
      } else {
        // All time: newest first, one page at a time. Ask for one row past
        // the page so we know whether "Load more" has anything to load.
        query = query.range(0, allTimeLimit);
      }

      const { data: meetings, error } = await query;

      if (error) {
        console.error("[SetterMeetings] query error:", error);
      }

      const rows = (meetings || []) as unknown as MeetingRecord[];
      if (!rangeWindow && rows.length > allTimeLimit) {
        return { meetings: rows.slice(0, allTimeLimit), hasMore: true };
      }
      return { meetings: rows, hasMore: false };
    },
    enabled: !!userProfile?.userId,
    // Keep the rows on screen while a "Load more" page arrives.
    placeholderData: keepPreviousData,
  });

  // "Load more" (all time only) grows the page; while the bigger page loads
  // the previous rows stay visible instead of flashing a skeleton.
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    if (!isListFetching) setLoadingMore(false);
  }, [isListFetching]);
  const loadMoreMeetings = () => {
    if (!isAllTime || !meetingsList?.hasMore) return;
    setLoadingMore(true);
    setAllTimeLimit((limit) => limit + ALL_TIME_PAGE_SIZE);
  };
  // Switching range shows the skeleton (placeholder rows are the old range);
  // paging keeps the rows and just marks the button busy.
  const isLoading = isListLoading || (isListPlaceholder && !loadingMore);
  const isLoadingMore = loadingMore && isListFetching;

  // Commission for the CURRENT cycle — independent of the picker, so the
  // earnings cards never move when a setter browses older appointments.
  const { data: commissionData, refetch: refetchCommission } = useQuery({
    queryKey: ['setter-meetings-data', userProfile?.userId, 'current-cycle-commission', cycleStartStr],
    queryFn: async () => {
      if (!userProfile?.userId) return { cycleMeetings: [] as CycleMeetingRow[], satCount: 0, totalBooked: 0 };

      const { data, error } = await supabase
        .from("meetings")
        .select("id, attendance_status, is_rebook, meeting_date")
        .or(`setter_id.eq.${userProfile.userId},logged_by_setter_id.eq.${userProfile.userId}`)
        .gte("meeting_date", cycleStartStr)
        .lte("meeting_date", cycleEndStr)
        .limit(CYCLE_ROW_CAP);

      if (error) {
        console.error("[SetterMeetings] commission query error:", error);
      }

      const cycleMeetings = (data || []) as CycleMeetingRow[];
      const freshCycleMeetings = cycleMeetings.filter(m => !m.is_rebook);
      const satCount = freshCycleMeetings.filter(m => m.attendance_status === 'sat').length;
      const totalBooked = freshCycleMeetings.length;

      return { cycleMeetings, satCount, totalBooked };
    },
    enabled: !!userProfile?.userId
  });

  const refetchMeetings = () => Promise.all([refetchMeetingsList(), refetchCommission()]);

  // Commission History: the last six cycles in ONE query, bucketed by cycle.
  // Rebooks are excluded, the same rule as the cards above, so a cycle's
  // history total always equals what the cards showed during that cycle.
  const { data: historicalData } = useQuery({
    queryKey: ['setter-commission-history', userProfile?.userId],
    queryFn: async (): Promise<CommissionHistoryCycle[]> => {
      if (!userProfile?.userId) return [];
      const cycles = Array.from({ length: 6 }, (_, i) => getCommissionCycle(i));
      const oldest = cycles[cycles.length - 1];
      const newest = cycles[0];
      const { data } = await supabase
        .from("meetings")
        .select("id, company_name, prospect_name, meeting_date, meeting_time, attendance_status, is_rebook")
        .or(`setter_id.eq.${userProfile.userId},logged_by_setter_id.eq.${userProfile.userId}`)
        .eq("attendance_status", "sat")
        .gte("meeting_date", oldest.startStr)
        .lte("meeting_date", newest.endStr)
        .order("meeting_date", { ascending: true })
        .order("meeting_time", { ascending: true })
        .limit(CYCLE_ROW_CAP);
      const sat = (data || []).filter((m) => !m.is_rebook);
      const bonus = userProfile.profile?.per_meeting_bonus || 50;
      return cycles
        .map((c) => {
          const rows = sat
            .filter((m) => m.meeting_date >= c.startStr && m.meeting_date <= c.endStr)
            .map(({ id, company_name, prospect_name, meeting_date, meeting_time }) => ({ id, company_name, prospect_name, meeting_date, meeting_time }));
          return { month: format(c.start, 'MMM') + ' Cycle', label: c.label, satMeetings: rows.length, commission: rows.length * bonus, meetings: rows };
        })
        .reverse();
    },
    enabled: !!userProfile?.userId
  });

  // Rebook from the detail sheet: prefill everything from the original meeting
  // so the setter never re-types — they only pick the new time.
  const startRebook = (m: MeetingRecord) => applyRebook(ui, m);

  // Cancels one side of a rebook pair: the original invite once the new time
  // sticks, or the rebook's invite if the prospect reverts to the original.
  // booking-cancel deletes the Google event (Google emails the cancellation)
  // and retires the meeting row accordingly.
  const releaseInvite = async (meetingId: string, kind: 'original' | 'rebook') => {
    setReleasingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke("booking-cancel", {
        body: {
          meeting_id: meetingId,
          reason: kind === 'original'
            ? "rebooked — original invite released by setter"
            : "reverted to the original time — rebook invite released by setter",
          mark_meeting_status: kind === 'original' ? 'rescheduled' : 'cancelled',
        },
      });
      const failMsg = error?.message || data?.error;
      if (failMsg) {
        toast({ title: "Couldn't cancel the invite", description: failMsg, variant: "destructive" });
      } else {
        toast({
          title: "Calendar invite cancelled",
          description: "The prospect has been sent the cancellation from Google Calendar.",
        });
      }
      refetchMeetings();
    } finally {
      setReleasingInvite(false);
      setInviteRelease(null);
      setIsDetailOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validate required fields for lead types
    const dept = setterDepartment || 'fulfilment';
    const currentLeadType = dept !== 'acquisition' ? leadType : 'video_conference';
    
    // Fulfilment manual log: the booking page's qualification rules, checked
    // here exactly as booking-public checks them, so a fallback log never
    // carries less than a Kronos booking.
    if (dept !== 'acquisition' && meetingMode === 'fresh') {
      const fail = (description: string) => toast({ title: "Qualification needed", description, variant: "destructive" });
      if (!fqHiring) { fail("Say whether they are hiring in the next 3 months."); return; }
      if (fqHiring === 'yes') {
        if (jobRoles.length === 0) { fail("Add at least one role they're hiring for."); return; }
        if (jobSpecProvided === null) { fail("Answer the job-spec question."); return; }
      } else {
        if (!fqOpenCvs) { fail("Answer whether they're open to receiving CVs."); return; }
        if (fqOpenCvs === 'yes') {
          if (!fqCvTitles.trim()) { fail("What kind of candidates would they want to see?"); return; }
          if (!fqCvLevel.trim()) { fail("What level are those candidates?"); return; }
        } else if (!fqOverride || !fqOverrideReason.trim()) {
          fail("Not qualified: not hiring and not open to CVs. Tick 'book it anyway' and give the reason."); return;
        }
      }
      if (!fqDm) { fail("Say whether there are other decision makers."); return; }
      if (fqDm === 'yes') {
        if (!fqDmStatus) { fail("Say how the other decision maker is involved."); return; }
        if (fqDmStatus === 'joining' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fqDmEmail.trim())) { fail("Add the decision maker's email; they're joining the meeting."); return; }
      }
    }

    if (dept === 'acquisition' && !assignedAeId) {
      toast({ title: "Account Executive Required", description: "Please assign an Account Executive.", variant: "destructive" });
      return;
    }
    if (dept === 'acquisition' && !appointmentSource) {
      toast({ title: "Source Required", description: "Please select the source of appointment.", variant: "destructive" });
      return;
    }
    if (!formData.meeting_date || !formData.meeting_time) {
      toast({
        title: "Time Required",
        description: liveBookingActive
          ? "Pick an available time slot, or switch to manual date/time entry."
          : "Please set the appointment date and time.",
        variant: "destructive",
      });
      return;
    }
    if (dept === 'acquisition' &&
        (!formData.revenue_last_12_months ||
         !formData.only_decision_maker || !formData.agency_led || !formData.capacity_5_10)) {
      toast({
        title: "Qualification Required",
        description: "Please answer all five qualification questions.",
        variant: "destructive",
      });
      return;
    }
    if (dept === 'acquisition' && formData.capacity_5_10 === "no") {
      toast({
        title: "This prospect is disqualified based on the criteria",
        description: "No capacity for an extra 5–10 vacancies per month. Don't book the call.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsSubmitting(false); return; }

    // Get setter profile ID
    const { data: setterProfile } = await supabase
      .from("setters_profiles")
      .select("id, department")
      .eq("user_id", user.id)
      .maybeSingle();

    const dept = setterProfile?.department || 'fulfilment';

    // For fulfilment setters: prefer an explicit selection, otherwise default to the
    // first rostered client (UI also auto-defaults so this just mirrors what the user sees).
    const resolvedClientProfileId = dept !== 'acquisition'
      ? (formData.client_profile_id || (!redirectClient ? todayRosteredClient?.id : null) || null)
      : null;

    // Prepare submission data based on department
    const submissionData: any = {
      prospect_name: formData.prospect_name,
      prospect_email: formData.prospect_email,
      prospect_mobile: formData.prospect_mobile,
      prospect_linkedin: formData.prospect_linkedin,
      prospect_job_title: formData.prospect_job_title,
      company_name: formData.company_name,
      company_website: formData.company_website,
      meeting_date: formData.meeting_date,
      meeting_time: formData.meeting_time,
      notes: formData.notes,
      close_lead_link: formData.close_lead_link,
      google_meet_link: formData.google_meet_link || null,
      follow_up_sent: formData.follow_up_sent,
      reminder_sent: formData.reminder_sent,
      client_accepted: formData.client_accepted,
      accepted_by_client: formData.client_accepted || false,
      setter_id: user.id,
      setter_profile_id: setterProfile?.id,
      logged_by_setter_id: user.id,
      status: "pending",
      client_profile_id: resolvedClientProfileId,
      department: dept,
      is_rebook: meetingMode === 'rebook',
      original_meeting_id: meetingMode === 'rebook' ? rebookSourceId : null,
      lead_type: dept !== 'acquisition' ? leadType : 'video_conference',
      assigned_ae_id: dept === 'acquisition' && assignedAeId ? assignedAeId : null,
      // Fulfilment: a hand-logged meeting is the fallback for when the booking
      // page is down; 'manual_fallback' is what "Send through Kronos" looks for.
      appointment_source: dept === 'acquisition' ? (appointmentSource || null) : 'manual_fallback',
      // Trial Day (15 Sep): the pushed trialist lead this converts.
      trial_lead_id: trialLeadId,
    };

    // Add department-specific fields
    if (dept === 'acquisition') {
      submissionData.company_headcount = formData.company_headcount || null;
      submissionData.revenue_last_12_months = formData.revenue_last_12_months || null;
      submissionData.worked_with_lead_gen_agency = formData.worked_with_lead_gen_agency || null;
      submissionData.only_decision_maker =
        formData.only_decision_maker ? formData.only_decision_maker === "yes" : null;
      submissionData.capacity_5_10 =
        formData.capacity_5_10 ? formData.capacity_5_10 === "yes" : null;
      submissionData.agency_led = formData.agency_led || null;
      submissionData.vacancies_from_new_clients_last_month =
        formData.vacancies_from_new_clients_last_month.trim() || null;
      submissionData.bd_bottleneck = formData.bd_bottleneck.trim() || null;
      submissionData.target_job_titles = formData.target_job_titles.trim() || null;
      submissionData.currently_hiring = null;
      submissionData.next_job_title = null;
      submissionData.worked_with_agencies = null;
    } else {
      // Same columns booking-public writes for a Kronos client booking.
      const hiring = fqHiring === 'yes';
      submissionData.currently_hiring = fqHiring ? hiring : formData.currently_hiring;
      submissionData.next_job_title = jobRoles[0]?.title || null;
      submissionData.worked_with_agencies = null;
      submissionData.hiring_frequency = null;
      submissionData.company_headcount = null;
      submissionData.revenue_last_12_months = null;
      submissionData.worked_with_lead_gen_agency = null;
      submissionData.job_roles = hiring && jobRoles.length > 0 ? jobRoles : null;
      submissionData.job_spec_provided = hiring && jobSpecProvided !== null ? jobSpecProvided === 'yes' : null;
      submissionData.job_spec_text = hiring && jobSpecProvided === 'yes' && jobSpecText.trim() ? jobSpecText.trim() : null;
      submissionData.open_to_receiving_cvs = !hiring && fqOpenCvs ? fqOpenCvs === 'yes' : null;
      submissionData.cv_candidate_titles = !hiring && fqOpenCvs === 'yes' ? fqCvTitles.trim() : null;
      submissionData.cv_candidate_level = !hiring && fqOpenCvs === 'yes' ? fqCvLevel.trim() : null;
      submissionData.other_decision_makers = fqDm ? fqDm === 'yes' : null;
      submissionData.decision_maker_status = fqDm === 'yes' ? fqDmStatus || null : null;
      submissionData.decision_maker_email = fqDm === 'yes' && fqDmEmail.trim() ? fqDmEmail.trim() : null;
      if (!hiring && fqOpenCvs === 'no' && fqOverrideReason.trim()) {
        submissionData.notes = [`⚠ Not qualified — pushed through: ${fqOverrideReason.trim()}`, formData.notes].filter(Boolean).join("\n");
      }
      // job_spec_file_url is set after insert (needs appointment id for path)
    }

    const { data: insertedMeeting, error } = await supabase
      .from("meetings")
      .insert(submissionData as any)
      .select("id")
      .single();

    if (error) {
      console.error("[SetterMeetings] insert error:", error);
      toast({ title: "Error logging appointment", description: error.message || "Please try again or contact your manager.", variant: "destructive" });
      return;
    }

    // Trial Day (15 Sep): flip the pushed lead to converted and link it.
    if (trialLeadId && insertedMeeting?.id) {
      try {
        await convertTrialLead(trialLeadId, String(insertedMeeting.id));
        queryClient.invalidateQueries({ queryKey: ["trial-leads"] });
      } catch (e) {
        toast({ title: "Logged, but the pushed lead wasn't marked as booked", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      }
    }

    // Fulfilment: upload job spec file (if any) using the new appointment id and patch the row
    if (dept !== 'acquisition' && jobSpecProvided === 'yes' && jobSpecFile && insertedMeeting?.id) {
      const safeName = jobSpecFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const objectPath = `${insertedMeeting.id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('job-specs')
        .upload(objectPath, jobSpecFile, { upsert: false });
      if (upErr) {
        console.error('Job spec upload error:', upErr);
        toast({ title: "Job spec upload failed", description: upErr.message, variant: "destructive" });
      } else {
        const { data: signed } = await supabase.storage.from('job-specs').createSignedUrl(objectPath, 60 * 60 * 24 * 365);
        const fileUrl = signed?.signedUrl || objectPath;
        await supabase.from('meetings').update({ job_spec_file_url: fileUrl } as any).eq('id', insertedMeeting.id);
      }
    }


    // If fulfilment setter logged without client assignment, notify SDR managers and CSMs
    if (dept !== 'acquisition' && !resolvedClientProfileId) {
      const setterName = userProfile?.profile?.full_name || 'A setter';
      const { data: managers } = await (supabase as any)
        .from('profiles')
        .select('id, role')
        .in('role', ['sdr_manager', 'csm']);
      if (managers?.length) {
        const notifications = managers.map((m: any) => ({
          recipient_id: m.id,
          recipient_role: m.role,
          title: 'Meeting Logged Without Client',
          message: `${setterName} logged a meeting for "${formData.company_name}" without a client assignment. Please assign and approve.`,
          category: 'meeting',
          link_url: '/admin/meetings',
          triggered_by: user.id,
        }));
        await supabase.from('notifications').insert(notifications as any);
      }
    }

    // Booking platform: turn the chosen slot into a real booking — calendar
    // event on the AE's Google Calendar (Google emails the invite + Meet link),
    // confirmation email/SMS, reminder scheduling. The meeting row above is
    // already saved with the slot's date/time, so a booking failure never
    // loses the logged appointment.
    let bookingSummary = "";
    if (bookingSlot && liveBookingActive && aeIsBookingHost && insertedMeeting?.id) {
      const { data: bookingRes, error: bookingErr } = await supabase.functions.invoke(
        "booking-create",
        {
          body: {
            event_type_id: bookingEventType.id,
            host_user_id: assignedAeId,
            starts_at: bookingSlot,
            prospect_name: formData.prospect_name,
            prospect_email: formData.prospect_email,
            prospect_mobile: formData.prospect_mobile,
            meeting_id: insertedMeeting.id,
            rebook_of_meeting_id: meetingMode === 'rebook' ? rebookSourceId : null,
            source: "setter",
            answers: {
              "Company": formData.company_name,
              "Revenue (last 12 months)": formData.revenue_last_12_months,
              "Only decision maker": formData.only_decision_maker,
              "Capacity for 5–10 more vacancies per month": formData.capacity_5_10 === "yes" ? "Yes" : "No",
              "Candidate or industry led": formData.agency_led,
              "Vacancies from new clients last month": formData.vacancies_from_new_clients_last_month,
              "Biggest BD bottleneck": formData.bd_bottleneck,
              "Job titles they want": formData.target_job_titles,
            },
          },
        }
      );
      const failMsg = bookingErr?.message || bookingRes?.error;
      if (failMsg) {
        toast({
          title: "Appointment logged — calendar booking failed",
          description: `${failMsg}. The meeting kept its time; invite the prospect manually or rebook the slot.`,
          variant: "destructive",
        });
      } else if (bookingRes) {
        const bits = [
          bookingRes.calendar_created ? "calendar invite sent" : "calendar pending (Google not connected)",
          bookingRes.email_sent ? "email sent" : null,
          bookingRes.sms_sent ? "SMS sent" : null,
        ].filter(Boolean);
        bookingSummary = ` Booked: ${bits.join(", ")}.`;
        // The original invite is deliberately NOT auto-cancelled — offer the
        // manual call now (they can also do it later from the meeting sheet).
        if (bookingRes.old_booking_id && meetingMode === 'rebook' && rebookSourceId) {
          setInviteRelease({ meetingId: rebookSourceId, kind: 'original' });
        }
      }
    }

    // A logged meeting changes booked (and later sat) instantly — refresh the
    // RAG pill and Nadia's board without waiting for the 5-min global tick.
    queryClient.invalidateQueries({ queryKey: ["own-setter-rag"] });
    queryClient.invalidateQueries({ queryKey: ["fulfilment-rag-board"] });

    toast({ title: "Success", description: (meetingMode === 'rebook' ? "Appointment rebooked successfully!" : "Appointment logged successfully!") + bookingSummary });
    resetMeetingWizard(ui);
    // Await refetch to ensure new meeting appears immediately
    await refetchMeetings();
    } catch (err) {
      console.error("[SetterMeetings] submission error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calendar event formatting
  const calendarEvents = toCalendarEvents(meetingsList?.meetings || []);

  // Calculations
  const perMeetingBonus = userProfile?.profile?.per_meeting_bonus || 50;
  const meetingsSat = commissionData?.satCount || 0;
  const commissionEarned = meetingsSat * perMeetingBonus;
  const totalMeetingsBooked = commissionData?.totalBooked || 0;
  const projectedCommission = totalMeetingsBooked * perMeetingBonus;
  const pendingMeetings = totalMeetingsBooked - meetingsSat;
  // setterDepartment already defined above

  // Split meetings into upcoming, past, and rebooked (rebooks get their own tab)
  const today = format(new Date(), 'yyyy-MM-dd');
  const { upcomingMeetings, pastMeetings, rebookedMeetings, supersededMeetingIds, needsConfirmationMeetings } =
    bucketMeetings(meetingsList?.meetings || [], today, setterDepartment);



  return {
    ...ui,
    userProfile,
    setterDepartment,
    clientProfiles,
    accountExecutives,
    followUpSlug,
    bookingEventType,
    aeIsBookingHost,
    liveBookingActive,
    canContinueToBooking,
    todayRosteredClients,
    isLoading,
    refetchMeetings: () => { void refetchMeetings(); },
    historicalData,
    startRebook,
    releaseInvite,
    handleSubmit,
    calendarEvents,
    eventStyleGetter: meetingEventStyleGetter,
    getStatusLabel: getMeetingStatusLabel,
    getStatusBadgeVariant: getMeetingStatusBadgeVariant,
    perMeetingBonus,
    meetingsSat,
    commissionEarned,
    totalMeetingsBooked,
    projectedCommission,
    pendingMeetings,
    upcomingMeetings,
    pastMeetings,
    rebookedMeetings,
    supersededMeetingIds,
    needsConfirmationMeetings,
    hasMoreMeetings: isAllTime && !!meetingsList?.hasMore,
    loadMoreMeetings,
    isLoadingMore,
  };
};

/**
 * Pure rendering (3 Sep): shared by the live page and the setter demo
 * surface (acting-as SDR on fixtures). Every byte of the appointments UI
 * lives here once; the controller above and the demo fixtures both feed it.
 */
export const SetterMeetingsView = (props: SetterMeetingsViewProps) => {
  const {
    isOpen, setIsOpen,
    isSubmitting,
    meetingMode, setMeetingMode,
    leadType, setLeadType,
    showCalendar, setShowCalendar,
    selectedMeeting, setSelectedMeeting,
    isDetailOpen, setIsDetailOpen,
    clientSearch, setClientSearch,
    showClientDropdown, setShowClientDropdown,
    redirectClient, setRedirectClient,
    assignedAeId, setAssignedAeId,
    appointmentSource, setAppointmentSource,
    bookingSlot, setBookingSlot,
    setUseManualTime,
    formStep, setFormStep,
    inviteRelease, setInviteRelease,
    releasingInvite,
    jobSpecs, setJobSpecs,
    termsFees, setTermsFees,
    fileInputRef,
    jobRoles, setJobRoles,
    roleDraft, setRoleDraft,
    jobSpecProvided, setJobSpecProvided,
    jobSpecText, setJobSpecText,
    jobSpecFile, setJobSpecFile,
    jobSpecFileInputRef,
    fqHiring, setFqHiring,
    fqOpenCvs, setFqOpenCvs,
    fqCvTitles, setFqCvTitles,
    fqCvLevel, setFqCvLevel,
    fqDm, setFqDm,
    fqDmStatus, setFqDmStatus,
    fqDmEmail, setFqDmEmail,
    fqOverride, setFqOverride,
    fqOverrideReason, setFqOverrideReason,
    closeLookup, setCloseLookup,
    kronosSend, setKronosSend,
    moveMeeting, setMoveMeeting,
    formData, setFormData,
    userProfile,
    setterDepartment,
    clientProfiles,
    accountExecutives,
    followUpSlug,
    bookingEventType,
    aeIsBookingHost,
    liveBookingActive,
    canContinueToBooking,
    todayRosteredClients,
    isLoading,
    refetchMeetings,
    historicalData,
    releaseInvite,
    handleSubmit,
    calendarEvents,
    eventStyleGetter,
    getStatusLabel,
    getStatusBadgeVariant,
    perMeetingBonus,
    meetingsSat,
    commissionEarned,
    totalMeetingsBooked,
    projectedCommission,
    pendingMeetings,
    upcomingMeetings,
    pastMeetings,
    rebookedMeetings,
    supersededMeetingIds,
    needsConfirmationMeetings,
    hasMoreMeetings,
    loadMoreMeetings,
    isLoadingMore,
    meetingsRange, setMeetingsRange,
    onConfirmationUpdate,
    detailSheetDemo,
    demoSlots,
  } = props;

  const rangeOptions = buildMeetingsRangeOptions();
  const currentCycleLabel = getCommissionCycle(0).label;
  const today = format(new Date(), 'yyyy-MM-dd');
  const rangeDescription = describeMeetingsRange(meetingsRange);
  const listedCount = upcomingMeetings.length + pastMeetings.length + rebookedMeetings.length;
  // Outcome pill: the badge variants map onto the kit's pill tones.
  const outcomePill = (meeting: MeetingRecord) => {
    const v = getStatusBadgeVariant(meeting);
    const tone = v === 'success' ? 'ok' : v === 'destructive' ? 'bad' : 'default';
    return <Pill variant={tone}>{meeting.attendance_status === 'sat' ? `+$${perMeetingBonus}` : getStatusLabel(meeting)}</Pill>;
  };

  const appointmentRow = (meeting: MeetingRecord, withTime: boolean) => (
    <Row
      key={meeting.id}
      onClick={() => { setSelectedMeeting(meeting); setIsDetailOpen(true); }}
    >
      <RowNum className="text-[var(--dim)]">
        {format(new Date(meeting.meeting_date), 'd MMM')}{withTime ? ` · ${meeting.meeting_time.slice(0, 5)}` : ''}
      </RowNum>
      <RowName
        primary={<span className="flex flex-wrap items-center gap-2">{meeting.company_name}{meeting.is_rebook && <Pill variant="warn">Rebook</Pill>}{meeting.appointment_source === 'manual_fallback' && <Pill variant="warn">Logged by hand</Pill>}</span>}
        secondary={<>{meeting.prospect_name}{meeting.created_at ? <span className="opacity-70"> · logged {format(new Date(meeting.created_at), 'd MMM')}</span> : null}</>}
      />
      <div className="text-right">{outcomePill(meeting)}</div>
    </Row>
  );

  const loadMoreRow = hasMoreMeetings ? (
    <div className="flex justify-center pt-2">
      <ButtonV2 size="sm" onClick={loadMoreMeetings} disabled={isLoadingMore}>
        {isLoadingMore ? 'Loading…' : 'Load more'}
      </ButtonV2>
    </div>
  ) : null;

  if (!userProfile?.profile) {
    return (
      <DashboardLayout role="setter">
        <PageContainer>
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Loading...</p>
          </Card>
        </PageContainer>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="setter">
      <PageContainer>
        <PageHeader 
          title="Appointments"
          subtitle={`Cycle ${currentCycleLabel}`}
          actions={
            // 12 Oct: the booking page is the primary action and the only coloured
            // button for both departments. Manual logging is an icon that explains
            // itself on hover. For acquisition the Log dialog IS the Kronos path
            // (it books live on Marcus's calendar), so its icon says so.
            <TooltipProvider delayDuration={200}>
              <div className="flex gap-2 items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showCalendar ? "default" : "outline"}
                      size="icon"
                      className="h-9 w-9"
                      aria-label="Calendar view"
                      onClick={() => setShowCalendar(!showCalendar)}
                    >
                      <CalendarDays className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Calendar view</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      aria-label={setterDepartment === 'acquisition' ? "Log an appointment" : "Log an appointment manually"}
                      onClick={() => setIsOpen(true)}
                    >
                      <NotebookPen className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {setterDepartment === 'acquisition'
                      ? "Log an appointment here (books on the AE's calendar when they are a Kronos host)"
                      : "Log manually (only if the booking page is down)"}
                  </TooltipContent>
                </Tooltip>
                {setterDepartment === 'acquisition' ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="shadow-glow" title="Open a booking page">
                        <CalendarPlus className="h-4 w-4 mr-1" />
                        Book appointment
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => window.open('/bookings/discovery-call-with-recruitment-revenue', '_blank')}>
                        Discovery call
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!followUpSlug}
                        onClick={() => followUpSlug && window.open(`/bookings/${followUpSlug}`, '_blank')}
                      >
                        Follow-up call
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    size="sm"
                    className="shadow-glow"
                    title="Open the booking page"
                    onClick={() => window.open('/bookings/fulfilment', '_blank')}
                  >
                    <CalendarPlus className="h-4 w-4 mr-1" />
                    Book appointment
                  </Button>
                )}
              </div>
            </TooltipProvider>
          }
        />

        <div className="space-y-6 animate-fade-in">
          {/* Commission, always the CURRENT cycle: one strip (12 Oct, both departments). */}
          <div>
            <StatStrip
              stats={[
                { label: 'Earned', value: `$${commissionEarned.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, caption: `$${perMeetingBonus.toFixed(0)} per sat meeting` },
                { label: 'Sat', value: meetingsSat },
                { label: 'Booked', value: totalMeetingsBooked, caption: pendingMeetings > 0 ? `${pendingMeetings} still to sit (+$${(pendingMeetings * perMeetingBonus).toLocaleString('en-US')})` : undefined },
                { label: 'Projected', value: `$${projectedCommission.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
              ]}
            />
            <p className="mt-2 text-[11.5px] text-[var(--dim)]">Current cycle, {currentCycleLabel}. Older cycles are under Commission History.</p>
          </div>

          {/* Calendar View (toggle) */}
          {showCalendar && (
            <Card className="p-6">
              <div style={{ height: "500px" }}>
                <BigCalendar
                  localizer={localizer}
                  events={calendarEvents}
                  startAccessor="start"
                  endAccessor="end"
                  style={{ height: "100%" }}
                  eventPropGetter={eventStyleGetter}
                  views={[Views.MONTH, Views.WEEK, Views.DAY]}
                  defaultView={Views.MONTH}
                  onSelectEvent={(event) => {
                    setSelectedMeeting(event.resource);
                    setIsDetailOpen(true);
                  }}
                />
              </div>
            </Card>
          )}

          <Separator />

          {/* Range picker (13 Sep): the appointments list used to be scoped to
              the current commission cycle, so every setter "lost" their
              history on the 26th. The LIST follows this picker; the earnings
              cards above stay on the current cycle. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <History className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground whitespace-nowrap">Showing</span>
              <Select value={meetingsRange} onValueChange={setMeetingsRange}>
                <SelectTrigger className="w-full sm:w-[280px]" aria-label="Appointments range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rangeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {meetingsRange === ALL_TIME_RANGE
                ? `${listedCount} appointment${listedCount === 1 ? '' : 's'} loaded${hasMoreMeetings ? ' — load more below' : ''}`
                : 'Commission cards stay on the current cycle'}
            </p>
          </div>

          {/* Trial Day (15 Sep): leads Daniel pushed to this setter. Renders
              only when there is something to book; "Book appointment" opens
              the Log Appointment dialog pre-filled from the lead. */}
          <PushedToYouPanel onBook={(lead) => applyPushedLead(props, lead)} />

          {/* Tabs for Appointments and History */}
          <Tabs defaultValue={needsConfirmationMeetings.length > 0 ? 'needs-confirmation' : 'upcoming'}>
            <TabsList>
              <TabsTrigger value="needs-confirmation">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Needs Confirmation ({needsConfirmationMeetings.length})
              </TabsTrigger>
              <TabsTrigger value="upcoming">
                <CalendarIcon className="h-4 w-4 mr-2" />
                Upcoming Appointments
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-2" />
                Appointment History
              </TabsTrigger>
              <TabsTrigger value="commissions">
                <TrendingUp className="h-4 w-4 mr-2" />
                Commission History
              </TabsTrigger>
            </TabsList>

            {/* Needs Confirmation Tab (both departments; video question is
                acquisition-only — Marcus, 21 Aug) */}
            <TabsContent value="needs-confirmation" className="mt-4">
              <Panel
                title="Today's confirmation calls"
                meta={setterDepartment === 'acquisition'
                  ? 'After the call, mark attendance and whether they watched the testimonial video'
                  : "After the call, mark whether the prospect confirmed they'll attend"}
                aside={<Pill variant={needsConfirmationMeetings.length > 0 ? 'warn' : 'ok'}>{needsConfirmationMeetings.length > 0 ? `${needsConfirmationMeetings.length} pending` : 'All done'}</Pill>}
              >
              {needsConfirmationMeetings.length === 0 ? (
                <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">All today's meetings have been confirmed.</p>
              ) : (
                <div>
                  {needsConfirmationMeetings.map((meeting) => (
                    <NeedsConfirmationCard
                      key={meeting.id}
                      meeting={meeting}
                      showVideoQuestion={setterDepartment === 'acquisition'}
                      onSaved={refetchMeetings}
                      onUpdate={onConfirmationUpdate}
                    />
                  ))}
                </div>
              )}
              </Panel>
            </TabsContent>


            {/* Upcoming Appointments Tab */}
            <TabsContent value="upcoming" className="mt-4">
              <Panel title="Upcoming appointments" aside={<Pill>{upcomingMeetings.length} scheduled</Pill>}>
              {isLoading ? (
                <div className="space-y-2 pt-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-9 animate-pulse rounded bg-[var(--surf2)]" />
                  ))}
                </div>
              ) : upcomingMeetings.length === 0 ? (
                <div className="py-[26px] text-center">
                  <p className="text-[12px] text-[var(--dim)]">No upcoming appointments scheduled.</p>
                  {setterDepartment === 'fulfilment' ? (
                    <ButtonV2 variant="primary" size="sm" className="mt-3" onClick={() => window.open('/bookings/fulfilment', '_blank')}>Book an appointment</ButtonV2>
                  ) : (
                    <ButtonV2 variant="primary" size="sm" className="mt-3" onClick={() => setIsOpen(true)}>Book an appointment</ButtonV2>
                  )}
                </div>
              ) : (
                <>
                  <RowList columns="120px 1fr 140px" head={['When', 'Appointment', <span key="o" className="text-right">Outcome</span>]}>
                    {upcomingMeetings.map((meeting) => appointmentRow(meeting, true))}
                  </RowList>
                  {loadMoreRow}
                </>
              )}
              </Panel>
            </TabsContent>

            {/* Appointment History Tab */}
            <TabsContent value="history" className="mt-4">
              <Panel title="Past appointments" meta={rangeDescription} aside={<Pill>{pastMeetings.length} completed</Pill>}>
              {isLoading ? (
                <div className="space-y-2 pt-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-9 animate-pulse rounded bg-[var(--surf2)]" />
                  ))}
                </div>
              ) : pastMeetings.length === 0 ? (
                <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No past appointments for {rangeDescription}.</p>
              ) : (
                <>
                  <RowList columns="120px 1fr 140px" head={['When', 'Appointment', <span key="o" className="text-right">Outcome</span>]}>
                    {pastMeetings.map((meeting) => appointmentRow(meeting, false))}
                  </RowList>
                  {loadMoreRow}
                </>
              )}
              </Panel>
            </TabsContent>

            {/* Rebooked Appointments Tab */}
            {/* Commission History Tab: each cycle opens to show the sat meetings that earned it */}
            <TabsContent value="commissions" className="mt-4">
              <Panel title="Commission history" meta="Last six cycles, each opens to the sat appointments that earned it">
              {historicalData && historicalData.length > 0 ? (
                <div>
                  {historicalData.map((cycle) => (
                    <Collapsible key={cycle.label}>
                      <div className="border-b border-[var(--line)]">
                        <CollapsibleTrigger asChild>
                          <button type="button" className="group flex w-full items-center justify-between px-[14px] py-[10px] text-left hover:[&_.rr-name]:text-[var(--accent)]">
                            <div>
                              <p className="rr-name text-[13px] font-semibold">{cycle.month}</p>
                              <p className="text-[11.5px] text-[var(--dim)]">{cycle.label} · {cycle.satMeetings} sat appointment{cycle.satMeetings === 1 ? '' : 's'}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <p className="font-head text-[22px] font-[450] tracking-[-0.02em]">
                                ${cycle.commission.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </p>
                              <ChevronDown className="h-4 w-4 text-[var(--dim)] transition-transform group-data-[state=open]:rotate-180" />
                            </div>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-[14px] pb-3">
                            {cycle.meetings.length === 0 ? (
                              <p className="text-[12px] text-[var(--dim)]">No sat appointments in this cycle.</p>
                            ) : (
                              <RowList columns="120px 1fr 90px">
                                {cycle.meetings.map((m) => (
                                  <Row key={m.id}>
                                    <RowNum className="text-[var(--dim)]">{format(new Date(`${m.meeting_date}T12:00:00`), 'd MMM')} · {m.meeting_time.slice(0, 5)}</RowNum>
                                    <RowName primary={m.company_name} secondary={m.prospect_name} />
                                    <div className="text-right"><Pill variant="ok">+${perMeetingBonus}</Pill></div>
                                  </Row>
                                ))}
                              </RowList>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </div>
              ) : (
                <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No commission history yet.</p>
              )}
              </Panel>
            </TabsContent>

          </Tabs>

        </div>

        {/* Log Meeting Dialog */}
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); setFormStep(1); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {setterDepartment === 'acquisition' && formStep === 2 ? 'Book a Time' : 'Lead Profile'}
              </DialogTitle>
            </DialogHeader>
            {/* Appointment type, fulfilment only (12 Oct): Video or Phone, the same
                choice the client booking page offers. */}
            {setterDepartment !== 'acquisition' && (
              <div className="mb-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Appointment Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'video_conference' as const, label: 'Video meet', icon: '📹' },
                    { value: 'mobile_phone_call' as const, label: 'Phone call', icon: '📱' },
                  ]).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                        leadType === option.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/50 hover:bg-muted/40'
                      }`}
                      onClick={() => setLeadType(option.value)}
                    >
                      <span className="text-lg">{option.icon}</span>
                      <span className="text-xs">{option.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Logging by hand does not put the meeting on the client's calendar or message the prospect.
                  Once the booking page is back, open the appointment and choose Send through Kronos.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Acquisition wizard step 1: details + qualification (times come after) */}
              {(setterDepartment !== 'acquisition' || formStep === 1) && (<>
              {/* Assign to AE - right after Fresh/Rebook, only for acquisition setters */}
              {setterDepartment === 'acquisition' && (
                <div className="space-y-2">
                  <Label>Assign to Account Executive *</Label>
                  <Select
                    value={assignedAeId}
                    onValueChange={(v) => {
                      setAssignedAeId(v);
                      // A different AE means different availability — clear any picked slot
                      setBookingSlot(null);
                      setFormData((f) => ({ ...f, meeting_date: "", meeting_time: "" }));
                    }}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Account Executive" />
                    </SelectTrigger>
                    <SelectContent>
                      {(accountExecutives || []).map((ae) => (
                        <SelectItem key={ae.id} value={ae.id}>
                          {ae.full_name || ae.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {setterDepartment === 'acquisition' && (
                <div className="space-y-2">
                  <Label>Source of Appointment *</Label>
                  <Select
                    value={appointmentSource}
                    onValueChange={setAppointmentSource}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source of appointment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cold_call">Cold Call</SelectItem>
                      <SelectItem value="cold_email">Cold Email</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="ads">Ads</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Close lead link first (fulfilment, 12 Oct): fills the prospect and
                  company from Close, same lookup the booking page uses. Email is never
                  filled: Close emails are unreliable and the invite depends on it. */}
              {setterDepartment !== 'acquisition' && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <Label>Close lead link</Label>
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      value={formData.close_lead_link}
                      onChange={(e) => { setFormData({ ...formData, close_lead_link: e.target.value }); setCloseLookup({ status: 'idle' }); }}
                      placeholder="https://app.close.com/lead/..."
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!formData.close_lead_link.trim() || closeLookup.status === 'looking'}
                      onClick={async () => {
                        if (detailSheetDemo) { setCloseLookup({ status: 'found' }); return; }
                        setCloseLookup({ status: 'looking' });
                        const { data, error } = await supabase.functions.invoke("booking-public", {
                          body: { action: "close_lead", close_lead_link: formData.close_lead_link.trim() },
                        });
                        if (error || data?.error) { setCloseLookup({ status: 'failed', error: data?.error || error?.message }); return; }
                        setFormData((f) => ({
                          ...f,
                          prospect_name: data.contact_name || f.prospect_name,
                          prospect_job_title: data.contact_title || f.prospect_job_title,
                          prospect_mobile: data.mobile || f.prospect_mobile,
                          prospect_linkedin: data.linkedin_url || f.prospect_linkedin,
                          company_name: data.company_name || f.company_name,
                          company_website: data.company_website || f.company_website,
                        }));
                        setCloseLookup({ status: 'found' });
                      }}
                    >
                      {closeLookup.status === 'looking' ? 'Looking…' : 'Fill from Close'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {closeLookup.status === 'found' && 'Filled from Close. Check the spelling and type the email yourself.'}
                    {closeLookup.status === 'failed' && (closeLookup.error || 'Lead not found.')}
                    {(closeLookup.status === 'idle' || closeLookup.status === 'looking') && 'Paste the lead from Close to fill the prospect and company below.'}
                  </p>
                </div>
              )}

              {/* Section 1: Prospect Details */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Prospect Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Prospect Name *</Label>
                    <Input
                      required
                      value={formData.prospect_name}
                      onChange={(e) => setFormData({ ...formData, prospect_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Prospect Job Title</Label>
                    <Input
                      value={formData.prospect_job_title}
                      onChange={(e) => setFormData({ ...formData, prospect_job_title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Prospect Email *</Label>
                    <Input
                      type="email"
                      required
                      value={formData.prospect_email}
                      onChange={(e) => setFormData({ ...formData, prospect_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Prospect Mobile</Label>
                    <Input
                      value={formData.prospect_mobile}
                      onChange={(e) => setFormData({ ...formData, prospect_mobile: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Prospect LinkedIn</Label>
                    <Input
                      value={formData.prospect_linkedin}
                      onChange={(e) => setFormData({ ...formData, prospect_linkedin: e.target.value })}
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Company Details */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Company Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Company Name *</Label>
                    <Input
                      required
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Company Website</Label>
                    <Input
                      value={formData.company_website}
                      onChange={(e) => setFormData({ ...formData, company_website: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              </>)}

              {/* Acquisition wizard step 2: pick a time (fulfilment sees this inline) */}
              {(setterDepartment !== 'acquisition' || formStep === 2) && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Appointment Details</h3>
                {liveBookingActive ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Pick a time — live availability *</Label>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline hover:text-primary"
                        onClick={() => { setUseManualTime(true); setBookingSlot(null); }}
                      >
                        Enter date/time manually instead
                      </button>
                    </div>
                    {!assignedAeId && (
                      <p className="text-sm text-muted-foreground border border-border rounded-lg p-3">
                        Go back and assign an Account Executive to see their live availability.
                      </p>
                    )}
                    {assignedAeId && !aeIsBookingHost && (
                      <p className="text-sm text-muted-foreground border border-border rounded-lg p-3">
                        This Account Executive isn't set up as a host on "{bookingEventType?.name}"
                        yet — add them in Dev Center → Bookings, or enter the date/time manually.
                      </p>
                    )}
                    {assignedAeId && aeIsBookingHost && (
                      <BookingSlotPicker
                        eventTypeId={bookingEventType.id}
                        hostUserId={assignedAeId}
                        demoSlots={demoSlots}
                        value={bookingSlot}
                        onSelect={(startsAt) => {
                          setBookingSlot(startsAt);
                          if (startsAt) {
                            const { date, time } = utcToLondonParts(startsAt);
                            setFormData((f) => ({ ...f, meeting_date: date, meeting_time: time }));
                          } else {
                            setFormData((f) => ({ ...f, meeting_date: "", meeting_time: "" }));
                          }
                        }}
                      />
                    )}
                    {bookingSlot && (
                      <p className="text-sm text-primary font-medium">
                        Selected: {new Date(bookingSlot).toLocaleString("en-GB", {
                          timeZone: "Europe/London", weekday: "long", day: "numeric",
                          month: "long", hour: "2-digit", minute: "2-digit",
                        })} (UK)
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {setterDepartment === 'acquisition' && bookingEventType && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline hover:text-primary"
                        onClick={() => setUseManualTime(false)}
                      >
                        Use live availability instead
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Appointment Date *</Label>
                        <Input
                          type="date"
                          required
                          className="[color-scheme:dark]"
                          value={formData.meeting_date}
                          onChange={(e) => setFormData({ ...formData, meeting_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Appointment Time *</Label>
                        <Input
                          type="time"
                          required
                          className="[color-scheme:dark]"
                          value={formData.meeting_time}
                          onChange={(e) => setFormData({ ...formData, meeting_time: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional appointment notes..."
                  />
                </div>
                {/* Assign to Client - only for fulfilment setters */}
                {setterDepartment !== 'acquisition' && (() => {
                  const rostered = todayRosteredClients || [];
                  const hasRoster = rostered.length > 0;
                  const selectedClient = (clientProfiles || []).find(c => c.id === formData.client_profile_id);
                  const selectedIsRostered = !!selectedClient && rostered.some(rc => rc.id === selectedClient.id);
                  const showOverride = redirectClient || (!hasRoster);

                  return (
                    <div>
                      <Label>Assign to Client {hasRoster ? '' : '(Optional)'}</Label>

                      {hasRoster && !showOverride && (
                        <div className="mt-1 space-y-2">
                          {/* Chip row: one per rostered client; the active one is highlighted */}
                          <div className="flex flex-wrap gap-2">
                            {rostered.map((rc) => {
                              const active = formData.client_profile_id === rc.id;
                              return (
                                <Button
                                  key={rc.id}
                                  type="button"
                                  variant={active ? "default" : "outline"}
                                  size="sm"
                                  className="text-xs h-8"
                                  onClick={() => {
                                    setFormData({ ...formData, client_profile_id: rc.id });
                                    setClientSearch(rc.company_name);
                                  }}
                                >
                                  {rc.company_name}
                                </Button>
                              );
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {rostered.length > 1
                              ? "Auto-assigned from today's roster — tap another client to switch."
                              : "Auto-assigned from today's roster."}
                          </p>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            onClick={() => {
                              setRedirectClient(true);
                              setFormData({ ...formData, client_profile_id: "" });
                              setClientSearch("");
                            }}
                          >
                            Not for any of these clients?
                          </Button>
                        </div>
                      )}

                      {showOverride && (
                        <div className="mt-1 space-y-2">
                          {selectedClient && !selectedIsRostered && (
                            <div className="p-2 bg-muted/40 rounded-md border border-border flex items-center justify-between gap-2">
                              <span className="text-sm">{selectedClient.company_name}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => {
                                  setFormData({ ...formData, client_profile_id: "" });
                                  setClientSearch("");
                                }}
                              >
                                Clear
                              </Button>
                            </div>
                          )}

                          <div className="relative">
                            <Input
                              placeholder="Search any other client..."
                              value={clientSearch}
                              onChange={(e) => {
                                setClientSearch(e.target.value);
                                setShowClientDropdown(true);
                              }}
                              onFocus={() => setShowClientDropdown(true)}
                            />
                            {showClientDropdown && clientSearch && (
                              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                                {(clientProfiles || [])
                                  .filter(c =>
                                    c.company_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                                    (c.contact_name && c.contact_name.toLowerCase().includes(clientSearch.toLowerCase()))
                                  )
                                  .map((client) => (
                                    <div
                                      key={client.id}
                                      className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                                      onClick={() => {
                                        setFormData({ ...formData, client_profile_id: client.id });
                                        setClientSearch(client.company_name);
                                        setShowClientDropdown(false);
                                      }}
                                    >
                                      {client.company_name} {client.contact_name ? `(${client.contact_name})` : ''}
                                    </div>
                                  ))}
                                {(clientProfiles || []).filter(c =>
                                  c.company_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                                  (c.contact_name && c.contact_name.toLowerCase().includes(clientSearch.toLowerCase()))
                                ).length === 0 && (
                                  <div className="px-3 py-2 text-sm text-muted-foreground">
                                    No clients found
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {hasRoster && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={() => {
                                setRedirectClient(false);
                                setFormData({ ...formData, client_profile_id: rostered[0].id });
                                setClientSearch(rostered[0].company_name);
                              }}
                            >
                              ← Back to my rostered clients
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              )}

              {/* Section 4: Department-Specific Fields (step 1 for acquisition) */}
              {(setterDepartment !== 'acquisition' || formStep === 1) && (setterDepartment === 'acquisition' ? (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Company Qualification</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="revenue_last_12_months">Roughly what was your revenue in the last 12 months? *</Label>
                      <Select
                        value={formData.revenue_last_12_months}
                        onValueChange={(value) => setFormData({ ...formData, revenue_last_12_months: value })}
                      >
                        <SelectTrigger id="revenue_last_12_months">
                          <SelectValue placeholder="Select revenue range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Under £300,000">Under £300,000</SelectItem>
                          <SelectItem value="£300,000-£1 million">£300,000-£1 million</SelectItem>
                          <SelectItem value="£1 million-£5 million">£1 million-£5 million</SelectItem>
                          <SelectItem value="£5 million-£10 million">£5 million-£10 million</SelectItem>
                          <SelectItem value="£10 million+">£10 million+</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Below £300k → price qualify them.</p>
                    </div>

                    <div>
                      <Label htmlFor="only_decision_maker">Are you the only decision maker in the company? *</Label>
                      <Select
                        value={formData.only_decision_maker}
                        onValueChange={(value) => setFormData({ ...formData, only_decision_maker: value })}
                      >
                        <SelectTrigger id="only_decision_maker">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-2">
                      <Label htmlFor="capacity_5_10">Do you have capacity to take on an additional 5 to 10 workable vacancies per month at the moment? *</Label>
                      <Select
                        value={formData.capacity_5_10}
                        onValueChange={(value) => setFormData({ ...formData, capacity_5_10: value })}
                      >
                        <SelectTrigger id="capacity_5_10">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                      {formData.capacity_5_10 === "no" ? (
                        <p className="text-xs font-semibold mt-1 text-destructive">This prospect is disqualified based on the criteria — no capacity for an extra 5–10 vacancies per month. Don't book the call.</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">No → disqualified. This one has no push-through (Marcus, 17 Sep).</p>
                      )}
                    </div>

                    <div className="col-span-2">
                      <Label htmlFor="agency_led">Do you place all types of roles within one industry, or one type of role across lots of industries? *</Label>
                      <Select
                        value={formData.agency_led}
                        onValueChange={(value) => setFormData({ ...formData, agency_led: value })}
                      >
                        <SelectTrigger id="agency_led">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All types of roles within one industry">All types of roles within one industry</SelectItem>
                          <SelectItem value="One type of role across lots of industries">One type of role across lots of industries</SelectItem>
                          <SelectItem value="Both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Industry led or candidate led. Nobody is disqualified on this.</p>
                    </div>
                  </div>

                  {/* 22 Sep (Marcus): information gathering. None of it stops
                      a booking — it is what the AE reads before the call. */}
                  <div className="space-y-4 rounded-lg border border-dashed p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Good to know — none of these disqualify
                    </h4>
                    <div>
                      <Label htmlFor="vacancies_last_month">How many vacancies from new clients did you get last month?</Label>
                      <Input
                        id="vacancies_last_month"
                        value={formData.vacancies_from_new_clients_last_month}
                        onChange={(e) => setFormData({ ...formData, vacancies_from_new_clients_last_month: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="bd_bottleneck">What, in your opinion, is your biggest bottleneck with business development currently?</Label>
                      <Textarea
                        id="bd_bottleneck"
                        rows={2}
                        value={formData.bd_bottleneck}
                        onChange={(e) => setFormData({ ...formData, bd_bottleneck: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="target_job_titles">What type of job titles would you like to get vacancies for?</Label>
                      <Input
                        id="target_job_titles"
                        value={formData.target_job_titles}
                        onChange={(e) => setFormData({ ...formData, target_job_titles: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

              ) : (
              <div className="space-y-5 border-t pt-5">
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Qualification</h3>
                  <p className="text-xs text-muted-foreground -mt-3">The same questions as the client booking page.</p>

                  <div className="space-y-1.5">
                    <Label htmlFor="fq_hiring">Are they currently hiring, or looking to start in the next 3 months? *</Label>
                    <Select value={fqHiring} onValueChange={(v) => { setFqHiring(v as 'yes' | 'no'); setFqOpenCvs(''); setFqOverride(false); setFqOverrideReason(""); }}>
                      <SelectTrigger id="fq_hiring"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {fqHiring === 'yes' && (<>
                  {/* Dynamic Job Roles */}
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-baseline justify-between">
                      <Label className="text-sm font-medium">Which roles are they hiring for?</Label>
                      <span className="text-[11px] text-muted-foreground">{jobRoles.length} added</span>
                    </div>
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 md:col-span-5 space-y-1">
                        <Label className="text-xs text-muted-foreground">Job title</Label>
                        <Input
                          value={roleDraft.title}
                          onChange={(e) => setRoleDraft({ ...roleDraft, title: e.target.value })}
                          placeholder="e.g., Software Engineer"
                        />
                      </div>
                      <div className="col-span-7 md:col-span-3 space-y-1">
                        <Label className="text-xs text-muted-foreground">Salary</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={roleDraft.salary}
                          onChange={(e) => setRoleDraft({ ...roleDraft, salary: e.target.value })}
                          placeholder="60000"
                        />
                      </div>
                      <div className="col-span-5 md:col-span-2 space-y-1">
                        <Label className="text-xs text-muted-foreground">Currency</Label>
                        <Select
                          value={roleDraft.currency}
                          onValueChange={(v) => setRoleDraft({ ...roleDraft, currency: v as JobRole['currency'] })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GBP">GBP</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="ZAR">ZAR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-12 md:col-span-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          onClick={() => {
                            const title = roleDraft.title.trim();
                            if (!title) return;
                            const salaryNum = roleDraft.salary.trim() === "" ? null : Number(roleDraft.salary);
                            setJobRoles([...jobRoles, { title, salary: Number.isFinite(salaryNum as number) ? (salaryNum as number) : null, currency: roleDraft.currency }]);
                            setRoleDraft({ title: "", salary: "", currency: roleDraft.currency });
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Add
                        </Button>
                      </div>
                    </div>
                    {jobRoles.length > 0 && (
                      <ul className="space-y-1.5 pt-1">
                        {jobRoles.map((r, i) => (
                          <li key={i} className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium truncate">{r.title}</span>
                              {r.salary !== null && (
                                <span className="text-muted-foreground text-xs">· {r.currency} {r.salary.toLocaleString()}</span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              onClick={() => setJobRoles(jobRoles.filter((_, idx) => idx !== i))}
                              aria-label="Remove role"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label>Do they have a job spec they can send across? *</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={jobSpecProvided === 'yes' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setJobSpecProvided('yes')}
                      >Yes</Button>
                      <Button
                        type="button"
                        variant={jobSpecProvided === 'no' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { setJobSpecProvided('no'); setJobSpecText(""); setJobSpecFile(null); }}
                      >No</Button>
                    </div>
                    {jobSpecProvided === 'yes' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Upload file</Label>
                          <input
                            ref={jobSpecFileInputRef}
                            type="file"
                            className="hidden"
                            onChange={(e) => setJobSpecFile(e.target.files?.[0] || null)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() => jobSpecFileInputRef.current?.click()}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {jobSpecFile ? jobSpecFile.name : "Choose file"}
                          </Button>
                          {jobSpecFile && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => setJobSpecFile(null)}
                            >Remove file</button>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Or paste the spec</Label>
                          <Textarea
                            value={jobSpecText}
                            onChange={(e) => setJobSpecText(e.target.value)}
                            placeholder="Paste the job spec text here..."
                            rows={5}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  </>)}

                  {fqHiring === 'no' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="fq_open_cvs">Would they be open to receiving strong candidate CVs over the next 3 months? *</Label>
                      <Select value={fqOpenCvs} onValueChange={(v) => { setFqOpenCvs(v as 'yes' | 'no'); setFqOverride(false); setFqOverrideReason(""); }}>
                        <SelectTrigger id="fq_open_cvs"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {fqHiring === 'no' && fqOpenCvs === 'yes' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>What kind of candidates / job titles would they want to see? *</Label>
                        <Input value={fqCvTitles} onChange={(e) => setFqCvTitles(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>What level are those candidates? *</Label>
                        <Input placeholder="e.g. junior, mid, senior, head-of" value={fqCvLevel} onChange={(e) => setFqCvLevel(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {fqHiring === 'no' && fqOpenCvs === 'no' && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                      <p className="text-sm font-medium text-destructive">Not qualified: not hiring and not open to CVs. Don't book unless there's a real reason.</p>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="fq_override" checked={fqOverride} onCheckedChange={(c) => setFqOverride(c === true)} />
                        <Label htmlFor="fq_override" className="cursor-pointer text-sm">Book it anyway, there's a good reason</Label>
                      </div>
                      {fqOverride && (
                        <Textarea rows={2} placeholder="Why is this meeting being pushed through? The client and Daniel will see this." value={fqOverrideReason} onChange={(e) => setFqOverrideReason(e.target.value)} />
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="fq_dm">Are there any other decision makers on hiring? *</Label>
                    <Select value={fqDm} onValueChange={(v) => { setFqDm(v as 'yes' | 'no'); setFqDmStatus(''); setFqDmEmail(""); }}>
                      <SelectTrigger id="fq_dm"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {fqDm === 'yes' && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      {([
                        ['joining', "They'll join the meeting, I have their email"],
                        ['briefed_by_prospect', "They can't attend, the prospect will brief them"],
                        ['email_pending', 'No email yet, to be collected'],
                      ] as const).map(([value, label]) => (
                        <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" name="fq_dm_status" checked={fqDmStatus === value} onChange={() => setFqDmStatus(value)} className="accent-primary" />
                          {label}
                        </label>
                      ))}
                      {fqDmStatus === 'joining' && (
                        <Input type="email" placeholder="Decision maker's email, they'll be added to the invite" value={fqDmEmail} onChange={(e) => setFqDmEmail(e.target.value)} />
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Acquisition step 1 → step 2 gate: times only after qualification */}
              {setterDepartment === 'acquisition' && formStep === 1 && (
                <div className="space-y-2">
                  {!canContinueToBooking && (
                    <p className="text-xs text-muted-foreground">
                      Fill in the AE, source, prospect name &amp; email, company name, and all four
                      qualification questions to continue.
                    </p>
                  )}
                  <Button
                    type="button"
                    className="w-full shadow-glow"
                    disabled={!canContinueToBooking}
                    onClick={() => setFormStep(2)}
                  >
                    Continue to booking →
                  </Button>
                </div>
              )}

              {/* Internal Information Section (step 2 for acquisition) */}
              {(setterDepartment !== 'acquisition' || formStep === 2) && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Internal Information</h3>
                {setterDepartment === 'acquisition' && (
                <div>
                  <Label>Close Lead Link</Label>
                  <Input
                    type="url"
                    value={formData.close_lead_link}
                    onChange={(e) => setFormData({ ...formData, close_lead_link: e.target.value })}
                    placeholder="https://app.close.com/lead/..."
                  />
                </div>
                )}
                {setterDepartment !== 'acquisition' && (<>
                <div>
                  <Label>Google Meet Link</Label>
                  <Input
                    type="url"
                    value={formData.google_meet_link}
                    onChange={(e) => setFormData({ ...formData, google_meet_link: e.target.value })}
                    placeholder="https://meet.google.com/..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">Saved with the appointment so you can copy it later.</p>
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Follow-up Status</h4>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="reminder"
                      checked={formData.reminder_sent}
                      onCheckedChange={(checked) => setFormData({ ...formData, reminder_sent: checked as boolean })}
                    />
                    <Label htmlFor="reminder" className="cursor-pointer">Reminder sent?</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="client_accepted"
                      checked={formData.client_accepted}
                      onCheckedChange={(checked) => setFormData({ ...formData, client_accepted: checked as boolean })}
                    />
                    <Label htmlFor="client_accepted" className="cursor-pointer">Client accepted on call?</Label>
                  </div>
                </div>
                </>)}
              </div>
              )}

              {(setterDepartment !== 'acquisition' || formStep === 2) && (
                <div className="flex gap-2">
                  {setterDepartment === 'acquisition' && (
                    <Button type="button" variant="outline" onClick={() => setFormStep(1)}>
                      ← Back
                    </Button>
                  )}
                  <Button type="submit" className="flex-1 shadow-glow" disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Log Appointment'}
                  </Button>
                </div>
              )}
            </form>
          </DialogContent>
        </Dialog>

        {/* Meeting Detail Sheet */}
        <SetterMeetingDetailSheet
          open={isDetailOpen}
          onOpenChange={setIsDetailOpen}
          meeting={selectedMeeting}
          demo={detailSheetDemo}
          department={setterDepartment}
          onDelete={() => refetchMeetings()}
          onUpdated={() => refetchMeetings()}
          onMove={!detailSheetDemo && selectedMeeting && selectedMeeting.meeting_date >= today && !selectedMeeting.is_rebook
            && selectedMeeting.attendance_status !== 'cancelled' && selectedMeeting.attendance_status !== 'rescheduled'
            ? (m) => { setIsDetailOpen(false); setMoveMeeting(m as MeetingRecord); }
            : undefined}
          onSendThroughKronos={setterDepartment === 'fulfilment' && !detailSheetDemo
            ? (m) => { setIsDetailOpen(false); setKronosSend(m as MeetingRecord); }
            : undefined}
          onCancelInvite={
            setterDepartment === 'acquisition' && selectedMeeting &&
            (supersededMeetingIds.has(selectedMeeting.id) || selectedMeeting.is_rebook)
              ? (m) => setInviteRelease({
                  meetingId: m.id,
                  kind: supersededMeetingIds.has(m.id) ? 'original' : 'rebook',
                })
              : undefined
          }
        />

        {/* Move appointment (12 Oct): the booking moves in place, nothing is duplicated */}
        {moveMeeting && (
          <MoveAppointmentDialog
            meeting={moveMeeting}
            onClose={() => setMoveMeeting(null)}
            onDone={() => { setMoveMeeting(null); refetchMeetings(); }}
          />
        )}

        {/* Fulfilment (12 Oct): push a hand-logged meeting through the client's Kronos page */}
        {kronosSend && (
          <KronosSendDialog
            meeting={kronosSend}
            onClose={() => setKronosSend(null)}
            onDone={() => { setKronosSend(null); refetchMeetings(); }}
          />
        )}

        {/* Post-rebook / sheet-triggered invite release (Marcus, 21 Aug: the
            original invite survives a rebook until the setter cancels it) */}
        <AlertDialog open={!!inviteRelease} onOpenChange={(o) => { if (!o && !releasingInvite) setInviteRelease(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {inviteRelease?.kind === 'original'
                  ? "Cancel the original calendar invite?"
                  : "Cancel the rebooked calendar invite?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {inviteRelease?.kind === 'original'
                  ? "The new invite has been sent, but the original one is still live in the prospect's and AE's calendars. Cancel it once you're sure the new time sticks — or keep it for now in case the prospect reverts. You can cancel it later from the meeting's details."
                  : "This cancels the rebooked invite and keeps the original meeting as it was. The prospect gets the cancellation from Google Calendar."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={releasingInvite}>
                {inviteRelease?.kind === 'original' ? "Keep both for now" : "Go back"}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={releasingInvite}
                onClick={(e) => {
                  e.preventDefault();
                  if (inviteRelease) releaseInvite(inviteRelease.meetingId, inviteRelease.kind);
                }}
              >
                {releasingInvite ? "Cancelling…" : "Cancel the invite"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </DashboardLayout>
  );
};

function NeedsConfirmationCard({ meeting, onSaved, showVideoQuestion = true, onUpdate }: {
  meeting: MeetingRecord;
  onSaved: () => void;
  showVideoQuestion?: boolean;
  /** Demo surface only: replaces the DB write. */
  onUpdate?: (meetingId: string, field: 'client_confirmed_attendance' | 'prospect_watched_video', value: boolean) => Promise<void>;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();

  const update = async (field: 'client_confirmed_attendance' | 'prospect_watched_video', value: boolean) => {
    setSaving(field);
    try {
      if (onUpdate) {
        await onUpdate(meeting.id, field, value);
      } else {
        const { error } = await supabase
          .from('meetings')
          .update({ [field]: value } as any)
          .eq('id', meeting.id);
        if (error) throw error;
      }
      toast({ title: 'Saved', description: 'Confirmation updated.' });
      onSaved();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to update', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const attendance = meeting.client_confirmed_attendance;
  const video = meeting.prospect_watched_video;

  const answer = (label: string, field: 'client_confirmed_attendance' | 'prospect_watched_video', value: boolean | null | undefined, yes: string, no: string) => (
    <div className="flex items-center justify-end gap-[6px] text-[11px] text-[var(--dim)]">
      {label}
      {value === null || value === undefined ? (
        <>
          <ButtonV2 size="sm" disabled={saving === field} onClick={() => update(field, false)}>No</ButtonV2>
          <ButtonV2 size="sm" variant="primary" disabled={saving === field} onClick={() => update(field, true)}>Yes</ButtonV2>
        </>
      ) : (
        <Pill variant={value ? 'ok' : field === 'prospect_watched_video' ? 'warn' : 'default'}>{value ? yes : no}</Pill>
      )}
    </div>
  );

  return (
    <Row focus style={{ gridTemplateColumns: "72px 1fr auto" }}>
      <RowNum className="text-[var(--dim)]">{meeting.meeting_time.slice(0, 5)}</RowNum>
      <RowName primary={meeting.company_name} secondary={<>{meeting.prospect_name} · {meeting.prospect_email}</>} />
      <div className="flex flex-col items-end gap-1">
        {answer('Confirmed attendance?', 'client_confirmed_attendance', attendance, 'Confirmed', 'Not confirmed')}
        {showVideoQuestion && answer('Watched the video?', 'prospect_watched_video', video, 'Watched', 'Not watched')}
      </div>
    </Row>
  );
}

const SetterMeetings = () => {
  const controller = useSetterMeetingsController();
  return <SetterMeetingsView {...controller} />;
};

/**
 * Fulfilment (12 Oct 2026): a meeting logged by hand while the booking page
 * was down is pushed through the client's Kronos event. If the logged time is
 * still free it books straight away; otherwise the setter picks from the
 * client's real availability. booking-public reuses the existing meetings
 * row (meeting_id), so nothing is duplicated and commission is unaffected.
 */
function KronosSendDialog({ meeting, onClose, onDone }: { meeting: MeetingRecord; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [slot, setSlot] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ['kronos-send-event', meeting.client_profile_id],
    enabled: !!meeting.client_profile_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_event_types')
        .select('id, slug, name, offer_phone_choice, booking_horizon_days, accepting_bookings')
        .eq('client_id', meeting.client_profile_id!)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // A phone appointment goes through as a callback (16 Oct): 15 minutes,
  // today or the next two working days, UK time.
  const asCallback = !!event?.offer_phone_choice && meeting.lead_type === 'mobile_phone_call';
  const { data: availability, isLoading: slotsLoading, error: slotsError } = useQuery({
    queryKey: ['kronos-send-slots', event?.slug, asCallback],
    enabled: !!event?.slug,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('booking-public', {
        body: {
          action: 'availability', slug: event!.slug, days: event!.booking_horizon_days ?? 14,
          location_choice: asCallback ? 'phone' : undefined,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not load availability');
      return data as { slots: BookingSlot[]; host_user_id: string | null };
    },
  });

  const slots = availability?.slots ?? [];
  const loggedTime = `${meeting.meeting_date} ${meeting.meeting_time.slice(0, 5)}`;
  const loggedSlot = slots.find((s) => {
    const { date, time } = utcToLondonParts(s.starts_at);
    return `${date} ${time}` === loggedTime;
  });
  const chosen = slot ?? loggedSlot?.starts_at ?? null;

  const byDay = slots.reduce<Record<string, BookingSlot[]>>((acc, s) => {
    const { date } = utcToLondonParts(s.starts_at);
    (acc[date] ||= []).push(s);
    return acc;
  }, {});

  const send = async () => {
    if (!event || !chosen) return;
    setSending(true); setSendError(null);
    const { data, error } = await supabase.functions.invoke('booking-public', {
      body: {
        action: 'book',
        slug: event.slug,
        host_user_id: availability?.host_user_id || undefined,
        starts_at: chosen,
        meeting_id: meeting.id,
        prospect_name: meeting.prospect_name,
        prospect_email: meeting.prospect_email,
        prospect_mobile: meeting.prospect_mobile || '',
        company_name: meeting.company_name,
        company_website: meeting.company_website || '',
        prospect_linkedin: meeting.prospect_linkedin || '',
        close_lead_link: meeting.close_lead_link || '',
        location_choice: event.offer_phone_choice ? (meeting.lead_type === 'mobile_phone_call' ? 'phone' : 'video') : undefined,
        prospect_timezone: 'Europe/London',
      },
    });
    let failMsg: string | null = data?.error || null;
    if (error) {
      try {
        const ctx = (error as { context?: { clone?: () => { json: () => Promise<{ error?: string }> } } }).context;
        if (ctx?.clone) failMsg = (await ctx.clone().json())?.error ?? null;
      } catch { /* not JSON */ }
      failMsg = failMsg || error.message;
    }
    setSending(false);
    if (failMsg) { setSendError(failMsg); return; }
    toast({ title: 'Sent through Kronos', description: `On the client's calendar${data?.sms_sent ? ', confirmation SMS sent' : ''}. The prospect gets the calendar invite by email.` });
    onDone();
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send through Kronos</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm">
            <p className="font-medium">{meeting.prospect_name} · {meeting.company_name}</p>
            <p className="text-muted-foreground">Logged for {format(new Date(`${meeting.meeting_date}T12:00:00`), 'EEE d MMM')} at {meeting.meeting_time.slice(0, 5)} for {meeting.client_profiles?.company_name ?? 'the client'}.</p>
          </div>

          {!meeting.client_profile_id ? (
            <p className="text-sm text-destructive">This meeting has no client on it. Edit it and assign the client first.</p>
          ) : eventLoading ? (
            <p className="text-sm text-muted-foreground">Finding the client's booking page…</p>
          ) : !event ? (
            <p className="text-sm text-destructive">{meeting.client_profiles?.company_name ?? 'This client'} has no Kronos booking page yet. Ask Daniel to connect their calendar.</p>
          ) : event.accepting_bookings === false ? (
            <p className="text-sm text-destructive">{event.name} is not accepting bookings right now.</p>
          ) : slotsLoading ? (
            <p className="text-sm text-muted-foreground">Checking the client's calendar…</p>
          ) : slotsError ? (
            <p className="text-sm text-destructive">{(slotsError as Error).message}</p>
          ) : (
            <>
              {asCallback && (
                <p className="text-xs text-muted-foreground">Phone appointment: it goes through as a 15-minute callback, today or in the next two working days (UK time).</p>
              )}
              {loggedSlot ? (
                <div className="rounded-lg border border-green-500/40 bg-green-500/5 p-3 text-sm">
                  <p className="font-medium">The logged time is still free.</p>
                  <p className="text-muted-foreground">Confirm to book {fmt(loggedSlot.starts_at)} (UK) on the client's calendar.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  <p className="font-medium">The logged time is no longer available.</p>
                  <p className="text-muted-foreground">Pick a time the client is free, then let the prospect know.</p>
                </div>
              )}
              <div className="max-h-[280px] overflow-y-auto space-y-3 pr-1">
                {Object.entries(byDay).map(([day, daySlots]) => (
                  <div key={day}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{format(new Date(`${day}T12:00:00`), 'EEEE d MMMM')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {daySlots.map((s) => (
                        <Button
                          key={s.starts_at}
                          type="button"
                          size="sm"
                          variant={chosen === s.starts_at ? 'default' : 'outline'}
                          className="h-7 px-2 text-xs"
                          onClick={() => setSlot(s.starts_at)}
                        >
                          {utcToLondonParts(s.starts_at).time}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
                {slots.length === 0 && <p className="text-sm text-muted-foreground">No free slots in the booking window.</p>}
              </div>
              {sendError && <p className="text-sm text-destructive">{sendError}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="button" className="flex-1 shadow-glow" disabled={!chosen || sending} onClick={send}>
                  {sending ? 'Booking…' : chosen ? `Book ${fmt(chosen)}` : 'Pick a time'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Move appointment (12 Oct 2026). The meeting has a live Kronos booking; the
 * setter picks a new time from the host's or client's real availability and
 * booking-reschedule moves the booking, the calendar event (same Meet link),
 * the meetings row and the reminders in one go. Replaces Rebook, which used
 * to create a second meeting and leave the first invite alive.
 */
function MoveAppointmentDialog({ meeting, onClose, onDone }: { meeting: MeetingRecord; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [slot, setSlot] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const { data: booking, isLoading: bookingLoading } = useQuery({
    queryKey: ['move-booking', meeting.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id, event_type_id, host_user_id, starts_at, location_choice, callback_backup_times, booking_event_types(slug, name, booking_horizon_days, client_id)')
        .eq('meeting_id', meeting.id)
        .in('status', ['held', 'confirmed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as unknown as { id: string; event_type_id: string; host_user_id: string | null; starts_at: string; location_choice: string | null; callback_backup_times: string[] | null; booking_event_types: { slug: string; name: string; booking_horizon_days: number | null; client_id: string | null } | null } | null;
    },
  });
  const event = booking?.booking_event_types ?? null;
  // 16 Oct (the owner): a callback moves within today and the next two working
  // days, and its backup times are one click away.
  const isCallback = isCallbackBooking(event, booking?.location_choice);
  const backupTimes = (booking?.callback_backup_times ?? [])
    .map((t) => new Date(t).toISOString())
    .filter((t) => new Date(t).getTime() > Date.now());

  const { data: availability, isLoading: slotsLoading, error: slotsError } = useQuery({
    queryKey: ['move-slots', booking?.id, isCallback],
    enabled: !!event?.slug,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('booking-public', {
        body: {
          action: 'availability', slug: event!.slug, host_user_id: booking?.host_user_id || undefined, days: event!.booking_horizon_days ?? 14,
          location_choice: isCallback ? 'phone' : undefined,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not load availability');
      return data as { slots: BookingSlot[] };
    },
  });
  const slots = availability?.slots ?? [];
  const byDay = slots.reduce<Record<string, BookingSlot[]>>((acc, s) => {
    const { date } = utcToLondonParts(s.starts_at);
    (acc[date] ||= []).push(s);
    return acc;
  }, {});
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const move = async () => {
    if (!booking || !slot) return;
    setMoving(true); setMoveError(null);
    const { data, error } = await supabase.functions.invoke('booking-reschedule', { body: { booking_id: booking.id, starts_at: slot } });
    let failMsg: string | null = data?.error || null;
    if (error) {
      try {
        const ctx = (error as { context?: { clone?: () => { json: () => Promise<{ error?: string }> } } }).context;
        if (ctx?.clone) failMsg = (await ctx.clone().json())?.error ?? null;
      } catch { /* not JSON */ }
      failMsg = failMsg || error.message;
    }
    setMoving(false);
    if (failMsg) { setMoveError(failMsg); return; }
    toast({
      title: 'Appointment rescheduled',
      description: `${data?.calendar_updated ? 'Calendar updated' : 'Calendar not updated (no event found)'}${data?.sms_sent ? ', SMS sent' : ''}${data?.email_sent ? ', email sent' : ''}.`,
    });
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm">
            <p className="font-medium">{meeting.prospect_name} · {meeting.company_name}</p>
            <p className="text-muted-foreground">Currently {format(new Date(`${meeting.meeting_date}T12:00:00`), 'EEE d MMM')} at {meeting.meeting_time.slice(0, 5)} (UK).</p>
          </div>
          {bookingLoading ? (
            <p className="text-sm text-muted-foreground">Finding the booking…</p>
          ) : !booking || !event ? (
            <p className="text-sm text-destructive">This meeting has no live Kronos booking to reschedule. Edit the date and time on the appointment instead, and tell the prospect yourself.</p>
          ) : slotsLoading ? (
            <p className="text-sm text-muted-foreground">Checking the calendar…</p>
          ) : slotsError ? (
            <p className="text-sm text-destructive">{(slotsError as Error).message}</p>
          ) : (
            <>
              {isCallback && backupTimes.length > 0 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <p className="text-sm font-medium">Backup times the prospect gave</p>
                  <div className="flex flex-wrap gap-1.5">
                    {/* Never disabled: the list below counts this callback's own
                        buffer as busy, so a backup right beside it can look taken
                        when it isn't. Move checks it for real. */}
                    {backupTimes.map((t) => (
                      <Button key={t} type="button" size="sm" variant={slot === t ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setSlot(t)}>
                        {fmt(t)}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Kronos checks the client is still free when you reschedule.</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {isCallback
                  ? 'Free 15-minute callback times today and the next two working days (UK time). The current slot is not listed.'
                  : `Free times on ${event.name}. The current slot is not listed.`}
              </p>
              <div className="max-h-[280px] overflow-y-auto space-y-3 pr-1">
                {Object.entries(byDay).map(([day, daySlots]) => (
                  <div key={day}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{format(new Date(`${day}T12:00:00`), 'EEEE d MMMM')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {daySlots.map((s) => (
                        <Button key={s.starts_at} type="button" size="sm" variant={slot === s.starts_at ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setSlot(s.starts_at)}>
                          {utcToLondonParts(s.starts_at).time}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
                {slots.length === 0 && <p className="text-sm text-muted-foreground">No free slots in the booking window.</p>}
              </div>
              {moveError && <p className="text-sm text-destructive">{moveError}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="button" className="flex-1 shadow-glow" disabled={!slot || moving} onClick={move}>
                  {moving ? 'Rescheduling…' : slot ? `Reschedule to ${fmt(slot)}` : 'Pick a time'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SetterMeetings;



/**
 * Trial Day (15 Sep): the leads Daniel pushed to this setter, above the
 * appointment tabs. Each carries what the trialist gathered plus Daniel's
 * note; one click pre-fills Log Appointment. Nothing renders when empty.
 */
export function PushedToYouPanel({ onBook, leadsOverride }: { onBook: (lead: TrialLead) => void; leadsOverride?: TrialLead[] }) {
  const { data: liveLeads = [] } = usePushedTrialLeads(!leadsOverride);
  const leads = leadsOverride ?? liveLeads;
  if (leads.length === 0) return null;
  return (
    <Card className="glass-card overflow-hidden border-primary/40">
      <div className="h-1 w-full bg-gradient-button" />
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Pushed to you</h3>
          <Badge className="bg-primary text-primary-foreground">{leads.length}</Badge>
          <span className="ml-auto text-xs text-muted-foreground">Qualified on the phones by a trialist, checked by Daniel. Book them in.</span>
        </div>
        <div className="space-y-2">
          {leads.map((lead) => (
            <div key={lead.id} className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/70 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-medium">
                  {lead.company_name || 'Unnamed company'}
                  {lead.contact_name && (
                    <span className="text-muted-foreground"> · {lead.contact_name}{lead.contact_title ? `, ${lead.contact_title}` : ''}</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[
                    lead.client?.company_name,
                    lead.contact_mobile,
                    lead.currently_hiring === true
                      ? `Hiring${lead.job_roles.length ? `: ${lead.job_roles.map((r) => r.title).join(', ')}` : ''}`
                      : lead.open_to_receiving_cvs === true
                      ? `Open to CVs${lead.cv_candidate_level ? ` (${lead.cv_candidate_level})` : ''}`
                      : null,
                    lead.job_spec_provided != null ? (lead.job_spec_provided ? 'job spec: yes' : 'no job spec') : null,
                  ].filter(Boolean).join(' · ')}
                </p>
                {lead.proposed_times.length > 0 && (
                  <p className="text-xs"><span className="text-muted-foreground">Offered:</span> {lead.proposed_times.map(formatProposedTime).join(' · ')}</p>
                )}
                {lead.review_notes && (
                  <p className="rounded-md bg-primary/5 px-2.5 py-1.5 text-xs"><span className="font-medium">From Daniel:</span> {lead.review_notes}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => onBook(lead)}>Book appointment</Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={lead.close_lead_link} target="_blank" rel="noreferrer" className="gap-1">
                    Close <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
