import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ButtonV2, Pill } from "@/components/ui-v2";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { Calendar, Clock, Building, User, Mail, Phone, Globe, Linkedin, FileText, XCircle, RefreshCw, Trash2, Save, CalendarPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";
import { invokeErrorMessage } from "@/lib/functionsError";

export interface SetterMeetingDetails {
  id: string;
  company_name: string;
  company_website?: string | null;
  prospect_name: string;
  prospect_email: string;
  prospect_mobile?: string | null;
  prospect_linkedin?: string | null;
  prospect_job_title?: string | null;
  meeting_date: string;
  meeting_time: string;
  status?: string | null;
  attendance_status?: string | null;
  approved_by_admin?: boolean | null;
  notes?: string | null;
  close_lead_link?: string | null;
  google_meet_link?: string | null;
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
  only_decision_maker?: boolean | null;
  start_timeline?: string | null;
  capacity_5_10?: boolean | null;
  agency_led?: string | null;
  vacancies_from_new_clients_last_month?: string | null;
  bd_bottleneck?: string | null;
  target_job_titles?: string | null;
  job_roles?: Array<{ title: string; salary: number | null; currency: string }> | null;
  job_spec_provided?: boolean | null;
  job_spec_text?: string | null;
  job_spec_file_url?: string | null;
  edited_at?: string | null;
  edited_by?: string | null;
  client_profile_id?: string | null;
  assigned_ae_id?: string | null;
  appointment_source?: string | null;
  lead_type?: string | null;
  client_profiles?: { id: string; company_name: string } | null;
}

type MeetingDetails = SetterMeetingDetails;

/** The fields Edit > Save can change, handed back to a demo parent as a patch. */
export type SetterMeetingEditPatch = Pick<
  SetterMeetingDetails,
  | "company_name" | "company_website" | "prospect_name" | "prospect_email" | "prospect_mobile"
  | "prospect_linkedin" | "prospect_job_title" | "meeting_date" | "meeting_time" | "notes"
  | "company_headcount" | "revenue_last_12_months" | "next_job_title" | "client_profile_id"
  | "assigned_ae_id" | "google_meet_link" | "edited_at" | "edited_by" | "client_profiles"
>;

/**
 * Demo surfaces (acting-as SDR, 3 Sep): when set the sheet makes NO Supabase
 * calls. Department and dropdown options come from the fixtures, and Save /
 * Delete hand the change back to the parent to apply to its local rows.
 */
export interface SetterMeetingDetailSheetDemo {
  department: "acquisition" | "fulfilment";
  clientOptions: Array<{ id: string; company_name: string }>;
  aeOptions: Array<{ id: string; full_name: string | null; email: string | null }>;
  onSave: (meetingId: string, patch: SetterMeetingEditPatch) => void;
  onDelete: (meetingId: string) => void;
}

interface SetterMeetingDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: MeetingDetails | null;
  onDelete?: () => void;
  onUpdated?: () => void;
  /** Demo overrides: no queries, no writes (see SetterMeetingDetailSheetDemo). */
  demo?: SetterMeetingDetailSheetDemo;
  /** Move appointment (12 Oct): the meeting has a live Kronos booking, so it
   * can be moved in place (same Meet link, prospect told). The parent opens
   * the slot dialog. */
  onMove?: (meeting: MeetingDetails) => void;
  /** Acquisition, rebook pairs only: cancels this meeting's live calendar
   * invite (the parent shows the confirm dialog and calls booking-cancel). */
  onCancelInvite?: (meeting: MeetingDetails) => void;
  /** Fulfilment, meetings logged by hand while Kronos was down: pushes the
   * meeting through the client's booking page so the calendar invite, email
   * and SMS catch up. The parent opens the slot dialog. */
  onSendThroughKronos?: (meeting: MeetingDetails) => void;
  /** The signed-in setter's department, from the page (falls back to a lookup). */
  department?: string | null;
}

type EditableForm = {
  company_name: string;
  company_website: string;
  prospect_name: string;
  prospect_email: string;
  prospect_mobile: string;
  prospect_linkedin: string;
  prospect_job_title: string;
  meeting_date: string;
  meeting_time: string;
  notes: string;
  company_headcount: string;
  revenue_last_12_months: string;
  next_job_title: string;
  client_profile_id: string;
  assigned_ae_id: string;
  google_meet_link: string;
};

const NO_CLIENT = "__none__";

const buildForm = (m: MeetingDetails): EditableForm => ({
  company_name: m.company_name ?? "",
  company_website: m.company_website ?? "",
  prospect_name: m.prospect_name ?? "",
  prospect_email: m.prospect_email ?? "",
  prospect_mobile: m.prospect_mobile ?? "",
  prospect_linkedin: m.prospect_linkedin ?? "",
  prospect_job_title: m.prospect_job_title ?? "",
  meeting_date: m.meeting_date ?? "",
  meeting_time: (m.meeting_time ?? "").slice(0, 5),
  notes: m.notes ?? "",
  company_headcount: m.company_headcount ?? "",
  revenue_last_12_months: m.revenue_last_12_months ?? "",
  next_job_title: m.next_job_title ?? "",
  client_profile_id: m.client_profile_id ?? m.client_profiles?.id ?? "",
  assigned_ae_id: m.assigned_ae_id ?? "",
  google_meet_link: m.google_meet_link ?? "",
});

export function SetterMeetingDetailSheet({ open, onOpenChange, meeting, onDelete, onUpdated, onMove, onCancelInvite, onSendThroughKronos, demo, department }: SetterMeetingDetailSheetProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<EditableForm | null>(meeting ? buildForm(meeting) : null);

  // Current setter's department (acquisition setters assign to AEs, fulfilment to clients)
  const { data: setterDept } = useQuery({
    queryKey: ["setter-edit-meeting-dept"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("setters_profiles")
        .select("department")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data?.department ?? null) as string | null;
    },
    enabled: !demo && !department,
  });
  const dept = demo ? demo.department : (department ?? setterDept);
  const isAcquisition = dept === 'acquisition';
  // 16 Oct 2026 (the owner): fulfilment appointments sit on a client's calendar.
  // Reschedule and Delete live next to Edit, and while a Kronos booking is
  // live the date and time can only change through Reschedule, so the
  // client's calendar and the prospect's invite always move with it.
  const isFulfilment = dept === 'fulfilment';
  const { data: liveBooking = null } = useQuery({
    queryKey: ["setter-meeting-live-booking", meeting?.id],
    enabled: !demo && open && !!meeting?.id && isFulfilment,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings").select("id")
        .eq("meeting_id", meeting!.id).in("status", ["held", "confirmed"])
        .limit(1).maybeSingle();
      return data;
    },
  });
  // Locked only where Reschedule is on offer (upcoming, not a rebook), so a
  // past or rebooked appointment can still have its time corrected by hand.
  const timeLocked = isFulfilment && !!liveBooking && !!onMove;

  // Active clients (used by fulfilment setters)
  const { data: liveClientOptions = [] } = useQuery({
    queryKey: ["setter-edit-meeting-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_profiles")
        .select("id, company_name")
        .eq("status", "active")
        .order("company_name", { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{ id: string; company_name: string }>;
    },
    enabled: !demo && !isAcquisition,
  });

  // Account executives + admin (used by acquisition setters)
  const { data: liveAeOptions = [] } = useQuery({
    queryKey: ["setter-edit-meeting-aes"],
    queryFn: async () => {
      const [{ data: roles }, offboarded] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["account_executive", "admin"]),
        fetchOffboardedUserIds(),
      ]);
      if (!roles?.length) return [] as Array<{ id: string; full_name: string | null; email: string | null; role: string }>;
      const ids = Array.from(new Set(roles.map(r => r.user_id))).filter(id => !offboarded.has(id));
      const roleByUser = new Map<string, string>();
      roles.forEach(r => {
        if (r.role === 'account_executive' || !roleByUser.has(r.user_id)) roleByUser.set(r.user_id, r.role);
      });
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      return (profs || [])
        .map(p => ({ ...p, role: roleByUser.get(p.id) || 'account_executive' }))
        .sort((a, b) => {
          const ra = a.role === 'account_executive' ? 0 : 1;
          const rb = b.role === 'account_executive' ? 0 : 1;
          if (ra !== rb) return ra - rb;
          return (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '');
        });
    },
    enabled: !demo && isAcquisition,
  });
  const clientOptions = demo ? demo.clientOptions : liveClientOptions;
  const aeOptions = demo ? demo.aeOptions : liveAeOptions;

  useEffect(() => {
    if (meeting) setForm(buildForm(meeting));
    setIsEditing(false);
  }, [meeting?.id]);

  if (!meeting || !form) return null;

  const handleField = <K extends keyof EditableForm>(key: K, value: EditableForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!form.company_name.trim() || !form.prospect_name.trim() || !form.prospect_email.trim() || !form.meeting_date || !form.meeting_time) {
      toast.error("Company, prospect name, email, date and time are required");
      return;
    }
    if (demo) {
      // Local state only: the parent applies the patch to its fixture rows.
      const chosenClient = !isAcquisition && form.client_profile_id
        ? demo.clientOptions.find((c) => c.id === form.client_profile_id) ?? null
        : null;
      demo.onSave(meeting.id, {
        company_name: form.company_name.trim(),
        company_website: form.company_website.trim() || null,
        prospect_name: form.prospect_name.trim(),
        prospect_email: form.prospect_email.trim(),
        prospect_mobile: form.prospect_mobile.trim() || null,
        prospect_linkedin: form.prospect_linkedin.trim() || null,
        prospect_job_title: form.prospect_job_title.trim() || null,
        meeting_date: form.meeting_date,
        meeting_time: form.meeting_time,
        notes: form.notes.trim() || null,
        company_headcount: form.company_headcount.trim() || null,
        revenue_last_12_months: form.revenue_last_12_months.trim() || null,
        next_job_title: form.next_job_title.trim() || null,
        client_profile_id: isAcquisition ? null : (form.client_profile_id || null),
        client_profiles: chosenClient ? { id: chosenClient.id, company_name: chosenClient.company_name } : null,
        assigned_ae_id: isAcquisition ? (form.assigned_ae_id || null) : meeting.assigned_ae_id ?? null,
        google_meet_link: form.google_meet_link.trim() || null,
        edited_at: new Date().toISOString(),
        edited_by: null,
      });
      toast.success("Appointment updated", { description: "Demo data only. Nothing was saved." });
      setIsEditing(false);
      onUpdated?.();
      return;
    }
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("meetings")
        .update({
          company_name: form.company_name.trim(),
          company_website: form.company_website.trim() || null,
          prospect_name: form.prospect_name.trim(),
          prospect_email: form.prospect_email.trim(),
          prospect_mobile: form.prospect_mobile.trim() || null,
          prospect_linkedin: form.prospect_linkedin.trim() || null,
          prospect_job_title: form.prospect_job_title.trim() || null,
          meeting_date: form.meeting_date,
          meeting_time: form.meeting_time,
          notes: form.notes.trim() || null,
          company_headcount: form.company_headcount.trim() || null,
          revenue_last_12_months: form.revenue_last_12_months.trim() || null,
          next_job_title: form.next_job_title.trim() || null,
          client_profile_id: isAcquisition ? null : (form.client_profile_id ? form.client_profile_id : null),
          assigned_ae_id: isAcquisition ? (form.assigned_ae_id ? form.assigned_ae_id : null) : undefined,
          google_meet_link: form.google_meet_link.trim() || null,
          edited_at: new Date().toISOString(),
          edited_by: user?.id ?? null,
        })
        .eq("id", meeting.id);
      if (error) throw error;
      toast.success("Appointment updated");
      setIsEditing(false);
      onUpdated?.();
    } catch (err: any) {
      console.error("Error updating meeting:", err);
      toast.error(err?.message || "Failed to update appointment");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (demo) {
      demo.onDelete(meeting.id);
      toast.success("Appointment deleted", { description: "Demo data only. Nothing was saved." });
      onOpenChange(false);
      onDelete?.();
      return;
    }
    // 16 Oct 2026: every delete goes through booking-cancel, which deletes the
    // appointment and then cancels any live Kronos booking (client calendar +
    // prospect invite). A direct delete failed on any booked appointment.
    setIsDeleting(true);
    const { data, error } = await supabase.functions.invoke('booking-cancel', {
      body: { meeting_id: meeting.id, delete_meeting: true },
    });
    const failMsg = await invokeErrorMessage(error, data);
    setIsDeleting(false);
    setConfirmDelete(false);
    if (failMsg) { toast.error(failMsg); return; }
    const failed = (data?.bookings_failed as string[] | undefined)?.length ?? 0;
    if (failed > 0) {
      toast.warning("Appointment deleted, but its calendar booking could not be cancelled", {
        description: "Ask a manager to cancel it in Dev Centre > Kronos > Bookings so the prospect is told.",
      });
    } else {
      toast.success("Appointment deleted", {
        description: data?.bookings_cancelled
          ? (data?.calendar_cancelled
              ? "Removed from the client's calendar; the prospect gets a cancellation."
              : "The booking is cancelled, but the calendar entry could not be confirmed removed. Check the client's calendar.")
          : undefined,
      });
    }
    onOpenChange(false);
    onDelete?.();
  };

  const getStatusBadge = () => {
    const effectiveStatus = meeting.attendance_status || meeting.status;
    switch (effectiveStatus) {
      case 'sat':
        return <Pill variant="ok">Sat</Pill>;
      case 'no_show':
        return <Pill variant="bad">No Show</Pill>;
      case 'cancelled':
        return <Pill>Cancelled</Pill>;
      case 'rescheduled':
        return <Pill variant="info">Rescheduled</Pill>;
      case 'pending':
        return <Pill variant="warn">Pending</Pill>;
      default:
        if (meeting.approved_by_admin) {
          return <Pill variant="ok">Approved</Pill>;
        }
        return <Pill variant="warn">Pending</Pill>;
    }
  };

  const editedBadge = meeting.edited_at ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Pill variant="warn">
            
            Edited
          </Pill>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Edited {format(new Date(meeting.edited_at), "PPp")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <SheetTitle className="font-head text-[22px] font-medium tracking-[-0.02em]">{meeting.company_name}</SheetTitle>
            {!isEditing ? (
              <div className="flex flex-wrap justify-end gap-2">
                {/* Fulfilment (16 Oct, the owner): Reschedule and Delete up here, where Edit is. */}
                {isFulfilment && onMove && liveBooking && (
                  <ButtonV2 size="sm" onClick={() => onMove(meeting)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />Reschedule
                  </ButtonV2>
                )}
                <ButtonV2 size="sm" onClick={() => setIsEditing(true)}>Edit</ButtonV2>
                {isFulfilment && (
                  <ButtonV2 size="sm" className="text-[var(--bad)]" disabled={isDeleting} onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                  </ButtonV2>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <ButtonV2 size="sm" variant="ghost" onClick={() => { setForm(buildForm(meeting)); setIsEditing(false); }} disabled={isSaving}>Cancel</ButtonV2>
                <ButtonV2 size="sm" variant="primary" onClick={handleSave} disabled={isSaving}>{isSaving ? "Saving..." : "Save"}</ButtonV2>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {getStatusBadge()}
            {editedBadge}
          </div>
          <SheetDescription className="sr-only">Meeting details for {meeting.company_name}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Meeting Date/Time */}
          <div className="space-y-3">
            <h4 className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--dim)]">Meeting Schedule</h4>
            {isEditing ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={form.meeting_date} disabled={timeLocked} onChange={(e) => handleField('meeting_date', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Time</Label>
                  <Input type="time" value={form.meeting_time} disabled={timeLocked} onChange={(e) => handleField('meeting_time', e.target.value)} />
                </div>
                {timeLocked && (
                  <p className="col-span-2 text-xs text-muted-foreground">
                    This meeting is on the client's calendar. To change the time, use Reschedule: it moves the
                    client's calendar and the prospect's invite together.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{format(new Date(meeting.meeting_date), 'PPP')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{meeting.meeting_time}</span>
                </div>
              </div>
            )}
          </div>

          <hr className="border-0 border-t border-[var(--line)]" />

          {/* Prospect Details */}
          <div className="space-y-3">
            <h4 className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--dim)]">Prospect Details</h4>
            {isEditing ? (
              <div className="space-y-2">
                <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={form.prospect_name} onChange={(e) => handleField('prospect_name', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Job Title</Label><Input value={form.prospect_job_title} onChange={(e) => handleField('prospect_job_title', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" value={form.prospect_email} onChange={(e) => handleField('prospect_email', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Mobile</Label><Input value={form.prospect_mobile} onChange={(e) => handleField('prospect_mobile', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">LinkedIn</Label><Input value={form.prospect_linkedin} onChange={(e) => handleField('prospect_linkedin', e.target.value)} /></div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{meeting.prospect_name}</span>
                  {meeting.prospect_job_title && <span className="text-muted-foreground">• {meeting.prospect_job_title}</span>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${meeting.prospect_email}`} className="text-primary hover:underline">{meeting.prospect_email}</a>
                </div>
                {meeting.prospect_mobile && (
                  <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><span>{meeting.prospect_mobile}</span></div>
                )}
                {meeting.prospect_linkedin && (
                  <div className="flex items-center gap-2 text-sm">
                    <Linkedin className="h-4 w-4 text-muted-foreground" />
                    <a href={meeting.prospect_linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{meeting.prospect_linkedin}</a>
                  </div>
                )}
              </div>
            )}
          </div>

          <hr className="border-0 border-t border-[var(--line)]" />

          {/* Company Details */}
          <div className="space-y-3">
            <h4 className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--dim)]">Company Details</h4>
            {isEditing ? (
              <div className="space-y-2">
                <div className="space-y-1"><Label className="text-xs">Company Name</Label><Input value={form.company_name} onChange={(e) => handleField('company_name', e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Website</Label><Input value={form.company_website} onChange={(e) => handleField('company_website', e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Headcount</Label><Input value={form.company_headcount} onChange={(e) => handleField('company_headcount', e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">Revenue (12 mo)</Label><Input value={form.revenue_last_12_months} onChange={(e) => handleField('revenue_last_12_months', e.target.value)} /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs">Next Job Title</Label><Input value={form.next_job_title} onChange={(e) => handleField('next_job_title', e.target.value)} /></div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm"><Building className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{meeting.company_name}</span></div>
                {meeting.company_website && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a href={meeting.company_website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]">{meeting.company_website}</a>
                  </div>
                )}
                {meeting.company_headcount && (
                  <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Headcount:</span><span>{meeting.company_headcount}</span></div>
                )}
                {meeting.sector_over_1000_companies != null && (
                  <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">1,000+ companies in sector:</span><span>{meeting.sector_over_1000_companies ? "Yes" : "No"}</span></div>
                )}
                {meeting.only_decision_maker != null && (
                  <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Only decision maker:</span><span>{meeting.only_decision_maker ? "Yes" : "No"}</span></div>
                )}
                {meeting.start_timeline && (
                  <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Would start:</span><span>{meeting.start_timeline}</span></div>
                )}
                {meeting.revenue_last_12_months && (
                  <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Revenue (12 mo):</span><span>{meeting.revenue_last_12_months}</span></div>
                )}
                {meeting.capacity_5_10 != null && (
                  <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Capacity for 5–10 vacancies a month:</span><span>{meeting.capacity_5_10 ? "Yes" : "No"}</span></div>
                )}
                {meeting.agency_led && (
                  <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Candidate or industry led:</span><span>{meeting.agency_led}</span></div>
                )}
                {meeting.vacancies_from_new_clients_last_month && (
                  <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Vacancies from new clients last month:</span><span>{meeting.vacancies_from_new_clients_last_month}</span></div>
                )}
                {meeting.target_job_titles && (
                  <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Job titles they want:</span><span>{meeting.target_job_titles}</span></div>
                )}
                {meeting.bd_bottleneck && (
                  <div className="text-sm"><span className="text-muted-foreground">Biggest BD bottleneck:</span> <span>{meeting.bd_bottleneck}</span></div>
                )}
              </div>
            )}
          </div>

          {/* Assignment — AE for acquisition setters, Client for fulfilment */}
          <hr className="border-0 border-t border-[var(--line)]" />
          <div className="space-y-3">
            <h4 className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--dim)]">
              {isAcquisition ? 'Assigned Account Executive' : 'Assigned Client'}
            </h4>
            {isAcquisition ? (
              isEditing ? (
                <Select
                  value={form.assigned_ae_id ? form.assigned_ae_id : NO_CLIENT}
                  onValueChange={(v) => handleField("assigned_ae_id", v === NO_CLIENT ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an account executive…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NO_CLIENT}>— Unassigned —</SelectItem>
                    {aeOptions.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name || a.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (() => {
                const ae = aeOptions.find((a) => a.id === meeting.assigned_ae_id);
                return ae ? (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-primary" />
                    <span className="font-medium">{ae.full_name || ae.email}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No account executive assigned</p>
                );
              })()
            ) : isEditing ? (
              <Select
                value={form.client_profile_id ? form.client_profile_id : NO_CLIENT}
                onValueChange={(v) => handleField("client_profile_id", v === NO_CLIENT ? "" : v)}
                // A booked meeting lives on this client's calendar; moving it to
                // another client would leave it there. Delete and rebook instead.
                disabled={!!liveBooking}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a client…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NO_CLIENT}>— Unassigned —</SelectItem>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : meeting.client_profiles ? (
              <div className="flex items-center gap-2 text-sm">
                <Building className="h-4 w-4 text-primary" />
                <span className="font-medium">{meeting.client_profiles.company_name}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No client assigned</p>
            )}
          </div>


          {/* Qualification Info (read-only) */}
          {!isEditing && (meeting.currently_hiring !== null || meeting.worked_with_agencies !== null || meeting.next_job_title || meeting.worked_with_lead_gen_agency || (meeting.job_roles && meeting.job_roles.length > 0) || meeting.job_spec_provided !== null && meeting.job_spec_provided !== undefined) && (
            <>
              <hr className="border-0 border-t border-[var(--line)]" />
              <div className="space-y-3">
                <h4 className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--dim)]">Qualification</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {meeting.currently_hiring !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Currently Hiring:</span>
                      <Pill variant="ok">{meeting.currently_hiring ? 'Yes' : 'No'}</Pill>
                    </div>
                  )}
                  {meeting.worked_with_agencies !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Worked with Agencies:</span>
                      <Pill variant="ok">{meeting.worked_with_agencies ? 'Yes' : 'No'}</Pill>
                    </div>
                  )}
                  {meeting.worked_with_lead_gen_agency && (
                    <div className="col-span-2"><span className="text-muted-foreground">Lead Gen Agency: </span><span>{meeting.worked_with_lead_gen_agency}</span></div>
                  )}
                  {meeting.job_roles && meeting.job_roles.length > 0 && (
                    <div className="col-span-2 space-y-1.5">
                      <span className="text-muted-foreground">Roles Hiring For:</span>
                      <ul className="space-y-1">
                        {meeting.job_roles.map((r, i) => (
                          <li key={i} className="flex items-center gap-2 rounded-[6px] bg-[var(--surf2)] px-2 py-1 text-xs">
                            <span className="font-medium">{r.title}</span>
                            {r.salary !== null && r.salary !== undefined && (
                              <span className="text-muted-foreground">· {r.currency} {Number(r.salary).toLocaleString()}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(meeting.job_spec_provided !== null && meeting.job_spec_provided !== undefined) && (
                    <div className="col-span-2 space-y-1">
                      <span className="text-muted-foreground">Job Spec: </span>
                      {meeting.job_spec_provided ? (
                        <span className="space-y-1">
                          <Pill variant="ok">Provided</Pill>
                          {meeting.job_spec_file_url && (
                            <a href={meeting.job_spec_file_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline text-xs">View file</a>
                          )}
                          {meeting.job_spec_text && (
                            <div className="mt-1 whitespace-pre-wrap rounded-[6px] bg-[var(--surf2)] px-2 py-1 text-xs">{meeting.job_spec_text}</div>
                          )}
                        </span>
                      ) : (
                        <Pill>Not provided</Pill>
                      )}
                    </div>
                  )}
                  {meeting.next_job_title && !(meeting.job_roles && meeting.job_roles.length > 0) && (
                    <div className="col-span-2"><span className="text-muted-foreground">Next Job Title: </span><span>{meeting.next_job_title}</span></div>
                  )}
                </div>
              </div>
            </>
          )}


          {/* Status Flags */}
          {!isEditing && (
            <>
              <hr className="border-0 border-t border-[var(--line)]" />
              <div className="space-y-3">
                <h4 className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--dim)]">Status Flags</h4>
                <div className="flex flex-wrap gap-2">
                  {meeting.reminder_sent && <Pill>Reminder Sent</Pill>}
                  {meeting.client_accepted && <Pill variant="ok">Client Accepted on Call</Pill>}
                  {!meeting.reminder_sent && !meeting.client_accepted && <span className="text-sm text-muted-foreground">No additional flags set</span>}
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <hr className="border-0 border-t border-[var(--line)]" />
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--dim)]">
              <FileText className="h-4 w-4" />
              Notes
            </h4>
            {isEditing ? (
              <Textarea rows={4} value={form.notes} onChange={(e) => handleField('notes', e.target.value)} placeholder="Add any notes about this meeting..." />
            ) : meeting.notes ? (
              <p className="whitespace-pre-wrap rounded-[8px] bg-[var(--surf2)] p-3 text-[12.5px]">{meeting.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes</p>
            )}
          </div>

          {/* Google Meet Link */}
          <hr className="border-0 border-t border-[var(--line)]" />
          <div className="space-y-2">
            <h4 className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--dim)]">Google Meet Link</h4>
            {isEditing ? (
              <Input
                type="url"
                value={form.google_meet_link}
                onChange={(e) => handleField('google_meet_link', e.target.value)}
                placeholder="https://meet.google.com/..."
              />
            ) : meeting.google_meet_link ? (
              <div className="flex items-center gap-2">
                <a href={meeting.google_meet_link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">
                  {meeting.google_meet_link}
                </a>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(meeting.google_meet_link!);
                    toast.success("Meet link copied");
                  }}
                >
                  Copy
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No Google Meet link saved</p>
            )}
          </div>

          {/* Close Lead Link */}
          {meeting.close_lead_link && !isEditing && (
            <>
              <hr className="border-0 border-t border-[var(--line)]" />
              <div className="space-y-3">
                <h4 className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--dim)]">Close Lead</h4>
                <a href={meeting.close_lead_link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                  {meeting.close_lead_link}
                </a>
              </div>
            </>
          )}

          {/* Rebook — prefills the Log Meeting wizard; the old invite stays
              live until the setter cancels it (Marcus, 21 Aug) */}
          {/* Manual log (fulfilment, 12 Oct): push it through Kronos once the booking page is back */}
          {!isEditing && onSendThroughKronos && meeting && meeting.appointment_source === 'manual_fallback' && (
            <>
              <hr className="border-0 border-t border-[var(--line)]" />
              <Button className="w-full shadow-glow" size="sm" onClick={() => onSendThroughKronos(meeting)}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                Send through Kronos
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Logged by hand, so no calendar invite, email or SMS went out. This books it on the
                client's calendar at this time if it is still free, or lets you pick another slot.
              </p>
            </>
          )}
          {!isEditing && onSendThroughKronos && meeting && meeting.appointment_source === 'manual_fallback_sent' && (
            <p className="text-xs text-muted-foreground text-center border rounded-lg p-2">
              Logged by hand, then sent through Kronos. The client's calendar and the prospect's invite are in place.
            </p>
          )}

          {!isEditing && onMove && meeting && !isFulfilment && (
            <>
              <hr className="border-0 border-t border-[var(--line)]" />
              <Button variant="outline" className="w-full" size="sm" onClick={() => onMove(meeting)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reschedule
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Pick a new time from the live calendar. The invite and meeting link move with it
                and the prospect is told. Nothing is left behind.
              </p>
            </>
          )}

          {/* Cancel invite — shown for either side of a rebook pair */}
          {!isEditing && onCancelInvite && meeting && (
            <>
              {!onMove && <hr className="border-0 border-t border-[var(--line)]" />}
              <Button
                variant="outline" size="sm"
                className="w-full border-amber-500/50 text-amber-600 hover:text-amber-700"
                onClick={() => onCancelInvite(meeting)}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel Calendar Invite
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Deletes this meeting's Google Calendar invite — the prospect gets the
                cancellation email. Use it on whichever side of a rebook didn't stick.
              </p>
            </>
          )}

          {/* Delete Button (fulfilment: in the header; the confirm dialog is shared) */}
          {!isEditing && (
            <>
              {!isFulfilment && <hr className="border-0 border-t border-[var(--line)]" />}
              <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                {!isFulfilment && (
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Appointment
                    </Button>
                  </AlertDialogTrigger>
                )}
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Appointment</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this appointment with <strong>{meeting.company_name}</strong>.
                      It will be removed from your records, commissions, leaderboard standings, and all metrics.
                      {timeLocked && " It is also cancelled on the client's calendar, and the prospect gets a cancellation."}
                      {" "}This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      // Stay open on "Deleting..." until the calendars answer.
                      onClick={(e) => { e.preventDefault(); handleDelete(); }}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
