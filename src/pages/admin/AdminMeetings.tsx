import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Chip, Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";
import { toast } from "sonner";
import { useDepartment } from "@/contexts/DepartmentContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as BigCalendar, momentLocalizer, Views } from "react-big-calendar";
import moment from "moment";
import { format, isValid } from "date-fns";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "../client/calendar-custom.css";
import { Star } from "lucide-react";
import { getLeadTypeConfig } from "@/lib/leadTypes";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

import { ConfirmOutcomeModal } from "@/components/meetings/ConfirmOutcomeModal";
import { UpdateMeetingStatusModal } from "@/components/meetings/UpdateMeetingStatusModal";
import { ClientAssignmentModal } from "@/components/admin/ClientAssignmentModal";
import { SelectDepartmentModal } from "@/components/meetings/SelectDepartmentModal";
import { MeetingDetailDrawer } from "@/components/meetings/MeetingDetailDrawer";
import { ScoreMeetingDrawer, type ScorableMeeting } from "@/components/meetings/ScoreMeetingDrawer";
import { MeetingScoreCard } from "@/components/meetings/MeetingScoreCard";
import { scoreColorClasses, type MeetingScore } from "@/lib/meetingScores";
import { fetchTestSetterIds, isTestSetterMeeting } from "@/lib/testAccounts";

const localizer = momentLocalizer(moment);

const AdminMeetings = () => {
  const { selectedDepartment } = useDepartment();
  const navigate = useNavigate();
  const location = useLocation();
  const isCSMRoute = location.pathname.startsWith("/csm");
  const [searchParams, setSearchParams] = useSearchParams();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  // 15 Oct UI pass: the card grid is gone (rows, not cards), so the view is list or calendar.
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "needs_confirmation" | "history">("pending");
  const [isLogMeetingOpen, setIsLogMeetingOpen] = useState(false);
  const [setterProfiles, setSetterProfiles] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [showConfirmOutcomeModal, setShowConfirmOutcomeModal] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignMeetingId, setAssignMeetingId] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [formData, setFormData] = useState({
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
    currently_hiring: false,
    next_job_title: "",
    worked_with_agencies: false,
    follow_up_sent: false,
    reminder_sent: false,
    client_accepted: false,
    client_profile_id: "",
    setter_profile_id: "",
    client_has_account: false,
    verbal_acceptance: false,
    meeting_already_sat: false,
    is_rebook: false,
    original_meeting_id: "",
    company_headcount: "",
    revenue_last_12_months: "",
    worked_with_lead_gen_agency: "",
  });
  const [showUpdateStatusModal, setShowUpdateStatusModal] = useState(false);
  const { userRoles } = useAuth();
  // Native score writes are csm/admin/dev only — RLS enforces the same set.
  // Other staff (e.g. sdr_manager) see read-only badges; roles outside the
  // meeting_scores SELECT policy get no rows and no score chrome at all.
  const canScore =
    userRoles?.includes("csm") || userRoles?.includes("admin") || userRoles?.includes("dev");
  const [meetingScores, setMeetingScores] = useState<MeetingScore[]>([]);
  const [scoringMeeting, setScoringMeeting] = useState<ScorableMeeting | null>(null);
  const [rescoring, setRescoring] = useState<MeetingScore | null>(null);
  const [viewingScore, setViewingScore] = useState<MeetingScore | null>(null);
  const [rescheduleData, setRescheduleData] = useState<any>(null);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);
  const [pendingFormSubmit, setPendingFormSubmit] = useState(false);

  useEffect(() => {
    loadMeetings();
    loadClients();
    loadSetterProfiles();
    loadCurrentUser();
    loadScores();
    
    const tab = searchParams.get("tab");
    if (tab === "history") {
      setActiveTab("history");
    }
  }, [searchParams]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("setters_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      setCurrentUser(profile);
      if (profile) {
        setFormData(prev => ({ ...prev, setter_profile_id: profile.id }));
      }
    }
  };

  const userHasClearDepartment = (): boolean => {
    if (!currentUser) return false;
    return currentUser.department === 'fulfilment' || currentUser.department === 'acquisition';
  };

  const loadSetterProfiles = async () => {
    const { data } = await supabase
      .from("setters_profiles")
      .select("id, user_id, full_name, email, active, department")
      .neq("department", "sales") // AE telemetry rows, not bookable setters
      .order("full_name", { ascending: true });
    
    if (data) setSetterProfiles(data);
  };

  const loadScores = async () => {
    const { data, error } = await supabase
      .from("meeting_scores")
      .select("*")
      .not("appointment_id", "is", null)
      .limit(1000);
    setMeetingScores(error ? [] : ((data || []) as MeetingScore[]));
  };

  // QA: Sort verification - meetings should appear newest first by created_at
  const loadMeetings = async () => {
    const [{ data }, testIds] = await Promise.all([
      supabase
        .from("meetings")
        .select("*, client_profiles(id, company_name)")
        .order("created_at", { ascending: false }),
      fetchTestSetterIds(),
    ]);
    // Demo/test setters' meetings never appear on this shared surface.
    if (data) setMeetings(data.filter((m) => !isTestSetterMeeting(m, testIds)));
  };

  const loadClients = async () => {
    const { data: clientsData } = await supabase
      .from("client_profiles")
      .select("id, user_id, company_name, contact_name")
      .eq("status", "active")
      .order("company_name", { ascending: true });
    
    if (clientsData) {
      const clientsWithEmail = await Promise.all(
        clientsData.map(async (client) => {
          let email = "";
          if (client.user_id) {
            const { data: userData } = await supabase
              .from("profiles")
              .select("email")
              .eq("id", client.user_id)
              .maybeSingle();
            email = userData?.email || "";
          }
          return {
            id: client.id,
            user_id: client.user_id,
            company_name: client.company_name,
            contact_name: client.contact_name,
            email,
            has_account: !!client.user_id,
          };
        })
      );
      setClients(clientsWithEmail);
    }
  };

  const getSetterName = (meeting: any) => {
    if (!meeting.logged_by_setter_id && !meeting.setter_profile_id) {
      return "SDR Trialist";
    }
    
    if (meeting.logged_by_setter_id) {
      const setter = setterProfiles.find(s => s.user_id === meeting.logged_by_setter_id);
      if (setter) {
        const name = setter.full_name || setter.email;
        return setter.active ? name : `${name} (inactive)`;
      }
    }
    
    if (meeting.setter_profile_id) {
      const setter = setterProfiles.find(s => s.id === meeting.setter_profile_id);
      if (setter) {
        const name = setter.full_name || setter.email;
        return setter.active ? name : `${name} (inactive)`;
      }
    }
    
    return "Unknown Setter";
  };

  const getStatusBadge = (meeting: any) => {
    if (meeting.attendance_status === 'sat') {
      return <Pill variant="ok">Sat</Pill>;
    }
    if (meeting.attendance_status === 'no_show') {
      return <Pill variant="bad">No show</Pill>;
    }
    if (meeting.attendance_status === 'rescheduled') {
      return <Pill variant="warn">Rescheduled</Pill>;
    }
    if (meeting.attendance_status === 'cancelled') {
      return <Pill variant="bad">Cancelled</Pill>;
    }
    if (meeting.approved_by_admin) {
      return <Pill variant="info">Approved</Pill>;
    }
    if (meeting.status === 'rejected') {
      return <Pill variant="bad">Rejected</Pill>;
    }
    return <Pill>Pending</Pill>;
  };


  const approveMeeting = async (id: string) => {
    const meeting = meetings.find(m => m.id === id);
    
    if (!meeting?.client_profile_id) {
      toast.error("Please assign a client before approval");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("meetings")
      .update({ 
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        approved_by_admin: true 
      })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
    } else {
      await supabase.from("admin_activity_log").insert({
        action: "meeting_approved",
        details: { meeting_id: id }
      });
      toast.success("Meeting approved");
      loadMeetings();
    }
  };

  const declineMeeting = async (id: string) => {
    const { error } = await supabase
      .from("meetings")
      .update({ 
        status: "rejected",
        approved_by: null,
        approved_at: null,
        approved_by_admin: false
      })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
    } else {
      await supabase.from("admin_activity_log").insert({
        action: "meeting_rejected",
        details: { meeting_id: id }
      });
      toast.success("Meeting declined");
      loadMeetings();
    }
  };

  const deleteMeeting = async (id: string) => {
    const { error } = await supabase
      .from("meetings")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error(error.message);
    } else {
      await supabase.from("admin_activity_log").insert({
        action: "meeting_deleted",
        details: { meeting_id: id }
      });
      toast.success("Meeting deleted");
      loadMeetings();
    }
  };

  const handleLogMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.setter_profile_id) {
      toast.error("Please select a setter");
      return;
    }

    if (!userHasClearDepartment()) {
      setPendingFormSubmit(true);
      setShowDepartmentModal(true);
      return;
    }

    await submitMeeting(selectedDepartment === 'sales' ? 'acquisition' : 'fulfilment');
  };

  const handleDepartmentSelect = async (department: 'fulfilment' | 'acquisition') => {
    setShowDepartmentModal(false);
    if (pendingFormSubmit) {
      setPendingFormSubmit(false);
      await submitMeeting(department);
    }
  };

  const submitMeeting = async (department: 'fulfilment' | 'acquisition') => {
    let setterId = null;
    let setterProfileId = null;
    let loggedBySetterId = null;

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      loggedBySetterId = user.id;
    }

    if (formData.setter_profile_id === "sdr_trialist") {
      setterId = null;
      setterProfileId = null;
    } else {
      const setterProfile = setterProfiles.find(s => s.id === formData.setter_profile_id);
      if (!setterProfile) {
        toast.error("Setter not found");
        return;
      }
      setterId = setterProfile.user_id;
      setterProfileId = formData.setter_profile_id;
    }

    const meetingData: any = {
      prospect_name: formData.prospect_name,
      prospect_email: formData.prospect_email,
      prospect_mobile: formData.prospect_mobile,
      prospect_linkedin: formData.prospect_linkedin,
      company_name: formData.company_name,
      company_website: formData.company_website,
      meeting_date: formData.meeting_date,
      meeting_time: formData.meeting_time,
      notes: formData.notes,
      setter_id: setterId,
      setter_profile_id: setterProfileId,
      logged_by_setter_id: loggedBySetterId,
      client_profile_id: formData.client_profile_id || null,
      status: "pending",
      client_has_account: formData.client_has_account,
      verbal_acceptance: formData.verbal_acceptance,
      attendance_status: formData.meeting_already_sat ? 'sat' : 'pending',
      attendance_confirmed: formData.meeting_already_sat,
      is_rebook: formData.is_rebook,
      original_meeting_id: formData.original_meeting_id || null,
      department: department,
    };

    if (department === 'acquisition') {
      meetingData.company_headcount = formData.company_headcount;
      meetingData.revenue_last_12_months = formData.revenue_last_12_months;
      meetingData.worked_with_lead_gen_agency = formData.worked_with_lead_gen_agency;
    } else {
      meetingData.currently_hiring = formData.currently_hiring;
      meetingData.next_job_title = formData.next_job_title;
      meetingData.worked_with_agencies = formData.worked_with_agencies;
      meetingData.follow_up_sent = formData.follow_up_sent;
      meetingData.reminder_sent = formData.reminder_sent;
      meetingData.client_accepted = formData.client_accepted;
    }

    const { error } = await supabase.from("meetings").insert(meetingData);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Meeting logged successfully!");
      setIsLogMeetingOpen(false);
      setFormData({
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
        currently_hiring: false,
        next_job_title: "",
        worked_with_agencies: false,
        follow_up_sent: false,
        reminder_sent: false,
        client_accepted: false,
        client_profile_id: "",
        setter_profile_id: currentUser?.id || "",
        client_has_account: false,
        verbal_acceptance: false,
        meeting_already_sat: false,
        is_rebook: false,
        original_meeting_id: "",
        company_headcount: "",
        revenue_last_12_months: "",
        worked_with_lead_gen_agency: "",
      });
      loadMeetings();
    }
  };

  const clientIdParam = searchParams.get("clientId");
  const filterParam = searchParams.get("filter");

  const departmentFilter = selectedDepartment === 'sales' ? 'acquisition' : 'fulfilment';
  const departmentMeetings = meetings.filter(m => {
    if (m.department) {
      return m.department === departmentFilter;
    }
    
    const setterId = m.logged_by_setter_id || null;
    const setterProfileId = m.setter_profile_id || null;
    
    let setter = null;
    if (setterId) {
      setter = setterProfiles.find(s => s.user_id === setterId);
    }
    if (!setter && setterProfileId) {
      setter = setterProfiles.find(s => s.id === setterProfileId);
    }
    
    if (setter?.department) {
      return setter.department === departmentFilter;
    }
    
    return departmentFilter === 'fulfilment';
  });

  // One score per appointment; a native re-score wins over a stale sheet row.
  const scoreByAppointment = useMemo(() => {
    const map = new Map<string, MeetingScore>();
    for (const s of meetingScores) {
      if (!s.appointment_id) continue;
      const isNative = (s as unknown as { source?: string }).source === "native";
      if (!map.has(s.appointment_id) || isNative) map.set(s.appointment_id, s);
    }
    return map;
  }, [meetingScores]);

  type ScoreableRow = {
    id: string | number;
    meeting_date: string;
    company_name: string | null;
    prospect_name: string | null;
    attendance_status?: string | null;
    client_profiles?: { company_name?: string | null } | null;
  };

  const toScorable = (meeting: ScoreableRow): ScorableMeeting => ({
    id: String(meeting.id),
    meeting_date: meeting.meeting_date,
    company_name: meeting.company_name,
    prospect_name: meeting.prospect_name,
    setterName: getSetterName(meeting),
    clientName: meeting.client_profiles?.company_name || "—",
  });

  // Scoring applies to sat fulfilment meetings only (the Batch 3 rubric).
  const renderScoreAction = (meeting: ScoreableRow) => {
    if (departmentFilter !== "fulfilment" || meeting.attendance_status !== "sat") return null;
    const score = scoreByAppointment.get(String(meeting.id));
    if (score) {
      const overall = Number(score.overall_quality);
      const isNative = (score as unknown as { source?: string }).source === "native";
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewingScore(score)}
            title="View score breakdown"
            aria-label={`Score ${overall.toFixed(2)}, view breakdown`}
            className={`inline-flex items-center gap-1 rounded border px-[7px] py-[2px] font-mono text-[10px] font-medium ${scoreColorClasses(overall)}`}
          >
            {overall.toFixed(2)}
            <Star className="h-3 w-3" />
          </button>
          {canScore && isNative && (
            <ButtonV2
              variant="ghost"
              size="sm"
              onClick={() => {
                setRescoring(score);
                setScoringMeeting(toScorable(meeting));
              }}
            >
              Edit
            </ButtonV2>
          )}
        </div>
      );
    }
    if (!canScore) return null;
    return (
      <ButtonV2
        size="sm"
        onClick={() => {
          setRescoring(null);
          setScoringMeeting(toScorable(meeting));
        }}
      >
        <Star className="h-3 w-3" />
        Score
      </ButtonV2>
    );
  };

  const pendingMeetings = departmentMeetings.filter(m => !m.approved_by_admin && m.status !== "rejected");
  const approvedMeetings = departmentMeetings.filter(m => m.approved_by_admin || m.status === "approved");
  const declinedMeetings = departmentMeetings.filter(m => m.status === "rejected" || m.status === "cancelled");
  
  const needsConfirmationMeetings = departmentMeetings.filter(m => {
    const meetingDateTime = new Date(`${m.meeting_date}T${m.meeting_time}`);
    const unresolvedAttendance = !["sat", "no_show", "rescheduled", "cancelled"].includes(m.attendance_status || "");

    if (isCSMRoute) {
      return m.client_accepted !== true &&
             m.attendance_confirmed === false &&
             unresolvedAttendance &&
             meetingDateTime < new Date();
    }

    return m.client_accepted === true &&
           m.attendance_confirmed === false &&
           unresolvedAttendance &&
           meetingDateTime < new Date();
  });
  
  let filteredMeetings = activeTab === "pending" 
    ? pendingMeetings 
    : activeTab === "needs_confirmation"
    ? needsConfirmationMeetings
    : [...approvedMeetings, ...declinedMeetings];
  
  if (clientIdParam) {
    filteredMeetings = filteredMeetings.filter(m => 
      m.client_id === clientIdParam || m.client_profile_id === clientIdParam
    );
  }
  
  if (filterParam) {
    switch (filterParam) {
      case "sat":
        filteredMeetings = filteredMeetings.filter(m => m.attendance_status === "sat");
        break;
      case "approved":
        filteredMeetings = filteredMeetings.filter(m => m.approved_by_admin === true);
        break;
      case "rejected":
        filteredMeetings = filteredMeetings.filter(m => m.status === "rejected" || m.status === "cancelled");
        break;
      case "opportunities":
        filteredMeetings = filteredMeetings.filter(m => m.status === "pending" || m.status === "scheduled");
        break;
      case "all":
        break;
    }
  }

  // Calendar shows ALL department meetings regardless of active tab
  const calendarEvents = departmentMeetings.map((meeting) => {
    const startDate = new Date(`${meeting.meeting_date}T${meeting.meeting_time}`);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    
    return {
      title: meeting.company_name,
      start: startDate,
      end: endDate,
      resource: meeting,
    };
  });

  const eventStyleGetter = (event: any) => {
    const meeting = event.resource;
    let backgroundColor = "hsl(var(--primary))";
    
    if (meeting.status === "rejected" || meeting.status === "cancelled") {
      backgroundColor = "hsl(var(--destructive))";
    } else if (meeting.attendance_status === "sat") {
      backgroundColor = "hsl(142.1 76.2% 36.3%)";
    } else if (meeting.approved_by_admin) {
      backgroundColor = "hsl(221.2 83.2% 53.3%)";
    }
    
    return {
      style: {
        backgroundColor,
        borderRadius: "4px",
        opacity: 0.9,
        color: "white",
        border: "none",
        display: "block",
      },
    };
  };

  const pageTitle = `${selectedDepartment === 'sales' ? 'Sales' : 'Fulfilment'} Meetings`;
  const tabTitle =
    activeTab === "pending" ? "Pending approval" : activeTab === "needs_confirmation" ? "Needs confirmation" : "History";

  // Mono gutter text. Falls back to the raw strings if a row carries a date
  // the parser rejects, which is what the old list printed anyway.
  const when = (meeting: { meeting_date: string; meeting_time: string | null }) => {
    const d = new Date(`${meeting.meeting_date}T12:00:00`);
    const day = isValid(d) ? format(d, 'd MMM') : meeting.meeting_date;
    return meeting.meeting_time ? `${day} · ${String(meeting.meeting_time).slice(0, 5)}` : day;
  };

  const rowActions = (meeting: ScoreableRow & { approved_by_admin?: boolean | null; status?: string | null }) => (
    <div className="flex items-center justify-end gap-[6px]" onClick={(e) => e.stopPropagation()}>
      {renderScoreAction(meeting)}
      <ButtonV2
        variant="ghost"
        size="sm"
        onClick={() => {
          setSelectedMeeting(meeting);
          setDetailDrawerOpen(true);
        }}
      >
        View
      </ButtonV2>
      {!meeting.approved_by_admin && meeting.status !== "rejected" && (
        <>
          <ButtonV2 variant="primary" size="sm" onClick={() => approveMeeting(String(meeting.id))}>Approve</ButtonV2>
          <ButtonV2 size="sm" onClick={() => declineMeeting(String(meeting.id))}>Decline</ButtonV2>
        </>
      )}
      {meeting.approved_by_admin && !['sat', 'no_show', 'rescheduled', 'cancelled'].includes(meeting.attendance_status || '') && (
        <ButtonV2
          size="sm"
          onClick={() => {
            setSelectedMeeting(meeting);
            setShowUpdateStatusModal(true);
          }}
        >
          Update status
        </ButtonV2>
      )}
    </div>
  );

  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
        <PageHeader
          title={pageTitle}
          subtitle={`Manage and track all ${selectedDepartment} meetings`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Chip selected={viewMode === "list"} onClick={() => setViewMode("list")}>List</Chip>
              <Chip selected={viewMode === "calendar"} onClick={() => setViewMode("calendar")}>Calendar</Chip>
              <Dialog open={isLogMeetingOpen} onOpenChange={setIsLogMeetingOpen}>
                <DialogTrigger asChild>
                  <ButtonV2 variant="primary" size="sm" className="ml-2">Log meeting</ButtonV2>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Log a Meeting</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleLogMeeting} className="space-y-4">
                    {/* Prospect Information */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="prospect_name">Prospect Name *</Label>
                        <Input
                          id="prospect_name"
                          value={formData.prospect_name}
                          onChange={(e) => setFormData({ ...formData, prospect_name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="prospect_email">Prospect Email *</Label>
                        <Input
                          id="prospect_email"
                          type="email"
                          value={formData.prospect_email}
                          onChange={(e) => setFormData({ ...formData, prospect_email: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="prospect_mobile">Prospect Mobile</Label>
                        <Input
                          id="prospect_mobile"
                          value={formData.prospect_mobile}
                          onChange={(e) => setFormData({ ...formData, prospect_mobile: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="prospect_linkedin">LinkedIn URL</Label>
                        <Input
                          id="prospect_linkedin"
                          value={formData.prospect_linkedin}
                          onChange={(e) => setFormData({ ...formData, prospect_linkedin: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Company Information */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="company_name">Company Name *</Label>
                        <Input
                          id="company_name"
                          value={formData.company_name}
                          onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="company_website">Company Website</Label>
                        <Input
                          id="company_website"
                          value={formData.company_website}
                          onChange={(e) => setFormData({ ...formData, company_website: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Meeting Date/Time */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="meeting_date">Meeting Date *</Label>
                        <Input
                          id="meeting_date"
                          type="date"
                          value={formData.meeting_date}
                          onChange={(e) => setFormData({ ...formData, meeting_date: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="meeting_time">Meeting Time *</Label>
                        <Input
                          id="meeting_time"
                          type="time"
                          value={formData.meeting_time}
                          onChange={(e) => setFormData({ ...formData, meeting_time: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    {/* Setter Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="setter">Setter Who Booked *</Label>
                      <Select
                        value={formData.setter_profile_id}
                        onValueChange={(value) => setFormData({ ...formData, setter_profile_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select setter" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sdr_trialist">SDR Trialist</SelectItem>
                          {setterProfiles.filter(s => s.active).map((setter) => (
                            <SelectItem key={setter.id} value={setter.id}>
                              {setter.full_name || setter.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Client Assignment */}
                    <div className="space-y-2">
                      <Label htmlFor="client">Assign to Client (optional)</Label>
                      <div className="relative">
                        <Input
                          id="client"
                          value={clientSearch}
                          onChange={(e) => {
                            setClientSearch(e.target.value);
                            setShowClientDropdown(true);
                          }}
                          onFocus={() => setShowClientDropdown(true)}
                          placeholder="Search clients..."
                        />
                        {showClientDropdown && clientSearch && (
                          <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[var(--line2)] bg-popover">
                            {clients
                              .filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()))
                              .map((client) => (
                                <div
                                  key={client.id}
                                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[12.5px] hover:bg-[var(--surf2)]"
                                  onClick={() => {
                                    setFormData({ ...formData, client_profile_id: client.id, client_has_account: client.has_account });
                                    setClientSearch(client.company_name);
                                    setShowClientDropdown(false);
                                  }}
                                >
                                  {client.company_name}
                                  {client.has_account && <Pill>Has account</Pill>}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Acquisition-specific fields */}
                    {selectedDepartment === 'sales' && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="company_headcount">Company Headcount</Label>
                            <Select
                              value={formData.company_headcount}
                              onValueChange={(value) => setFormData({ ...formData, company_headcount: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select range" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0-10">0-10 employees</SelectItem>
                                <SelectItem value="11-50">11-50 employees</SelectItem>
                                <SelectItem value="51-200">51-200 employees</SelectItem>
                                <SelectItem value="201-500">201-500 employees</SelectItem>
                                <SelectItem value="501-1000">501-1000 employees</SelectItem>
                                <SelectItem value="1000+">1000+ employees</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="revenue">Revenue Last 12 Months</Label>
                            <Select
                              value={formData.revenue_last_12_months}
                              onValueChange={(value) => setFormData({ ...formData, revenue_last_12_months: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select range" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="£0-£500,000">£0-£500,000</SelectItem>
                                <SelectItem value="£500,000-£1 million">£500,000-£1 million</SelectItem>
                                <SelectItem value="£1 million-£5 million">£1 million-£5 million</SelectItem>
                                <SelectItem value="£5 million-£10 million">£5 million-£10 million</SelectItem>
                                <SelectItem value="£10 million+">£10 million+</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lead_gen_agency">Worked With Lead Gen Agency Before?</Label>
                          <Select
                            value={formData.worked_with_lead_gen_agency}
                            onValueChange={(value) => setFormData({ ...formData, worked_with_lead_gen_agency: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Yes</SelectItem>
                              <SelectItem value="no">No</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {/* Fulfilment-specific fields */}
                    {selectedDepartment !== 'sales' && (
                      <>
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="client_has_account"
                              checked={formData.client_has_account}
                              onCheckedChange={(checked) => setFormData({ ...formData, client_has_account: !!checked })}
                            />
                            <Label htmlFor="client_has_account">Client Has Account</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="verbal_acceptance"
                              checked={formData.verbal_acceptance}
                              onCheckedChange={(checked) => setFormData({ ...formData, verbal_acceptance: !!checked })}
                            />
                            <Label htmlFor="verbal_acceptance">Verbal Acceptance</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="meeting_already_sat"
                              checked={formData.meeting_already_sat}
                              onCheckedChange={(checked) => setFormData({ ...formData, meeting_already_sat: !!checked })}
                            />
                            <Label htmlFor="meeting_already_sat">Meeting Already Sat</Label>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Notes */}
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <ButtonV2 type="submit" variant="primary" className="w-full justify-center">Log Meeting</ButtonV2>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          }
        />

        <div className="space-y-6">
          {/* KPI summary: one strip, no boxes. */}
          <StatStrip
            stats={[
              { label: 'Pending', value: pendingMeetings.length },
              { label: 'Approved', value: approvedMeetings.length },
              { label: 'Needs confirmation', value: needsConfirmationMeetings.length },
              { label: 'Declined', value: declinedMeetings.length },
            ]}
          />

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="pending">Pending ({pendingMeetings.length})</TabsTrigger>
              <TabsTrigger value="needs_confirmation">Needs Confirmation ({needsConfirmationMeetings.length})</TabsTrigger>
              <TabsTrigger value="history">History ({approvedMeetings.length + declinedMeetings.length})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              {viewMode === "calendar" ? (
                <Panel title="Calendar" meta="Every meeting in this department, regardless of tab">
                  <div className="pt-4">
                    <BigCalendar
                      localizer={localizer}
                      events={calendarEvents}
                      startAccessor="start"
                      endAccessor="end"
                      style={{ height: 600 }}
                      eventPropGetter={eventStyleGetter}
                      onSelectEvent={(event) => {
                        setSelectedMeeting(event.resource);
                        setDetailDrawerOpen(true);
                      }}
                      views={[Views.MONTH, Views.WEEK, Views.DAY]}
                      defaultView={Views.MONTH}
                    />
                  </div>
                </Panel>
              ) : (
                <Panel
                  title={tabTitle}
                  aside={<Pill variant={activeTab === "needs_confirmation" && filteredMeetings.length > 0 ? 'warn' : 'default'}>{filteredMeetings.length} {filteredMeetings.length === 1 ? 'meeting' : 'meetings'}</Pill>}
                >
                  {filteredMeetings.length === 0 ? (
                    <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No meetings found</p>
                  ) : (
                    <RowList
                      columns="128px minmax(0,1fr) 120px auto"
                      head={['When', 'Appointment', 'Status', <span key="a" className="text-right">Actions</span>]}
                    >
                      {filteredMeetings.map((meeting) => (
                        <Row
                          key={meeting.id}
                          onClick={() => {
                            setSelectedMeeting(meeting);
                            setDetailDrawerOpen(true);
                          }}
                        >
                          <RowNum className="text-[var(--dim)]">{when(meeting)}</RowNum>
                          <RowName
                            primary={
                              <span className="flex flex-wrap items-center gap-2">
                                {meeting.company_name}
                                {meeting.is_rebook && <Pill variant="warn">Rebook</Pill>}
                                <Pill>{getLeadTypeConfig(meeting.lead_type).label}</Pill>
                              </span>
                            }
                            secondary={
                              <>
                                {meeting.prospect_name} · {getSetterName(meeting)}
                                {meeting.created_at && <span className="opacity-70"> · logged {format(new Date(meeting.created_at), 'd MMM yyyy')}</span>}
                                {meeting.client_profiles?.company_name && <span className="text-[var(--accent)]"> · {meeting.client_profiles.company_name}</span>}
                              </>
                            }
                          />
                          <div>{getStatusBadge(meeting)}</div>
                          {rowActions(meeting)}
                        </Row>
                      ))}
                    </RowList>
                  )}
                </Panel>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <SelectDepartmentModal
          open={showDepartmentModal}
          onSelect={handleDepartmentSelect}
          onClose={() => setShowDepartmentModal(false)}
        />

        <ClientAssignmentModal
          open={assignModalOpen}
          onOpenChange={setAssignModalOpen}
          meetingId={assignMeetingId || ""}
          onAssigned={loadMeetings}
        />

        {selectedMeeting && (
          <UpdateMeetingStatusModal
            open={showUpdateStatusModal}
            onOpenChange={setShowUpdateStatusModal}
            meeting={selectedMeeting}
            onUpdated={loadMeetings}
          />
        )}

        <MeetingDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={setDetailDrawerOpen}
          meeting={selectedMeeting}
          onUpdate={loadMeetings}
          onAssignClient={(meetingId) => {
            setAssignMeetingId(meetingId);
            setAssignModalOpen(true);
          }}
          getSetterName={getSetterName}
        />

        <ScoreMeetingDrawer
          open={!!scoringMeeting}
          onOpenChange={(o) => {
            if (!o) {
              setScoringMeeting(null);
              setRescoring(null);
            }
          }}
          meeting={scoringMeeting}
          existingScore={rescoring}
          onSaved={loadScores}
        />

        <MeetingScoreCard
          score={viewingScore}
          open={!!viewingScore}
          onOpenChange={(o) => !o && setViewingScore(null)}
        />
      </PageContainer>
    </DashboardLayout>
  );
};

export default AdminMeetings;
