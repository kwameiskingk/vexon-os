import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ButtonV2, FactsStrip, Panel, Pill } from "@/components/ui-v2";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";
import { getLeadTypeConfig } from "@/lib/leadTypes";
import { UpdateMeetingStatusModal } from "@/components/meetings/UpdateMeetingStatusModal";
import { formatAppointmentSource } from "@/components/acquisition/AcquisitionMeetingCard";

interface MeetingDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: any;
  onUpdate: () => void;
  onAssignClient: (meetingId: string) => void;
  getSetterName: (meeting: any) => string;
  /** Hides every client-assignment element (badge, Booked for Client
   *  section, Assign/Reassign action) — acquisition meetings have no
   *  client concept. Callers that omit it render exactly as before. */
  hideClientAssignment?: boolean;
}

export const MeetingDetailDrawer = ({
  open,
  onOpenChange,
  meeting,
  onUpdate,
  onAssignClient,
  getSetterName,
  hideClientAssignment = false,
}: MeetingDetailDrawerProps) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [clientData, setClientData] = useState<{ company_name: string } | null>(null);
  const [campaignData, setCampaignData] = useState<{ name: string } | null>(null);

  // QA: Client display - fetch client and campaign names for display
  useEffect(() => {
    const fetchRelatedData = async () => {
      if (meeting?.client_profile_id) {
        const { data: client } = await supabase
          .from("client_profiles")
          .select("company_name")
          .eq("id", meeting.client_profile_id)
          .single();
        setClientData(client);
      } else {
        setClientData(null);
      }

      if (meeting?.campaign_id) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("name")
          .eq("id", meeting.campaign_id)
          .single();
        setCampaignData(campaign);
      } else {
        setCampaignData(null);
      }
    };

    if (meeting) {
      fetchRelatedData();
    }
  }, [meeting?.client_profile_id, meeting?.campaign_id]);

  if (!meeting) return null;

  const approveMeeting = async () => {
    if (!meeting.client_profile_id) {
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
      .eq("id", meeting.id);

    if (error) {
      toast.error(error.message);
    } else {
      await supabase.from("admin_activity_log").insert({
        action: "meeting_approved",
        details: { meeting_id: meeting.id }
      });
      toast.success("Meeting approved");
      onUpdate();
      onOpenChange(false);
    }
  };

  const declineMeeting = async () => {
    const { error } = await supabase
      .from("meetings")
      .update({ 
        status: "rejected",
        approved_by: null,
        approved_at: null,
        approved_by_admin: false
      })
      .eq("id", meeting.id);

    if (error) {
      toast.error(error.message);
    } else {
      await supabase.from("admin_activity_log").insert({
        action: "meeting_rejected",
        details: { meeting_id: meeting.id }
      });
      toast.success("Meeting declined");
      onUpdate();
      onOpenChange(false);
    }
  };

  const deleteMeeting = async () => {
    setIsDeleting(true);
    const { error } = await supabase
      .from("meetings")
      .delete()
      .eq("id", meeting.id);

    if (error) {
      toast.error(error.message);
    } else {
      await supabase.from("admin_activity_log").insert({
        action: "meeting_deleted",
        details: { meeting_id: meeting.id }
      });
      toast.success("Meeting deleted");
      onUpdate();
      onOpenChange(false);
    }
    setIsDeleting(false);
  };

  const isPending = !meeting.approved_by_admin && meeting.status !== "rejected";
  const isFinalAttendance = ['sat', 'no_show', 'cancelled', 'rescheduled'].includes(meeting.attendance_status || '');
  const openCloseLeadLink = async (rawUrl: string) => {
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    const popup = window.open(normalizedUrl, "_blank");
    if (popup) {
      popup.opener = null;
      return;
    }

    try {
      if (window.top && window.top !== window) {
        window.top.location.href = normalizedUrl;
      } else {
        window.location.href = normalizedUrl;
      }
    } catch {
      try {
        await navigator.clipboard.writeText(normalizedUrl);
        toast.error("Popup blocked. Link copied to clipboard instead.");
      } catch {
        toast.error("Unable to open Close link. Please allow popups and try again.");
      }
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-3">
            <SheetTitle className="font-head text-[22px] font-medium tracking-[-0.02em]">{meeting.company_name}</SheetTitle>
            <p className="text-[12px] text-[var(--dim)]">{meeting.prospect_name}{meeting.prospect_job_title ? ` · ${meeting.prospect_job_title}` : ""}</p>
          </SheetHeader>

          <div className="space-y-5">
            {/* Status */}
            <div className="flex flex-wrap items-center gap-[5px]">
              <Pill variant={meeting.status === "approved" ? "info" : meeting.status === "rejected" ? "bad" : "default"}>{meeting.status}</Pill>
              <Pill variant="info">{getLeadTypeConfig(meeting.lead_type).label}</Pill>
              {!hideClientAssignment && (meeting.client_profile_id ? <Pill variant="ok">Client assigned</Pill> : <Pill variant="warn">No client assigned</Pill>)}
              {meeting.attendance_status && <Pill variant={meeting.attendance_status === "sat" ? "ok" : meeting.attendance_status === "no_show" || meeting.attendance_status === "cancelled" ? "bad" : "warn"}>{meeting.attendance_status.replace(/_/g, " ")}</Pill>}
              {meeting.edited_at && (
                <Pill title={`Edited by setter ${formatDate(new Date(meeting.edited_at), "PPp")}`}>Edited</Pill>
              )}
            </div>

            <FactsStrip
              facts={[
                { label: "Date", value: meeting.meeting_date },
                { label: "Time", value: String(meeting.meeting_time).slice(0, 5) },
                { label: "Logged by", value: getSetterName(meeting) },
                { label: "Source", value: meeting.appointment_source ? formatAppointmentSource(meeting.appointment_source) : "—" },
              ]}
            />

            {!hideClientAssignment && (
              <Panel title="Booked for client">
                <div className="pt-2 text-[12.5px]">
                  {clientData ? (
                    <>
                      <p className="font-semibold">{clientData.company_name}</p>
                      {campaignData && <p className="text-[var(--dim)]">Campaign · {campaignData.name}</p>}
                    </>
                  ) : (
                    <p className="text-[var(--dim)]">Not assigned yet</p>
                  )}
                </div>
              </Panel>
            )}

            <Panel title="Prospect">
              <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-[6px] pt-2 text-[12.5px]">
                <dt className="text-[var(--dim)]">Name</dt><dd className="font-semibold">{meeting.prospect_name}</dd>
                <dt className="text-[var(--dim)]">Email</dt><dd className="break-all">{meeting.prospect_email}</dd>
                {meeting.prospect_mobile && <><dt className="text-[var(--dim)]">Mobile</dt><dd>{meeting.prospect_mobile}</dd></>}
                {meeting.prospect_job_title && <><dt className="text-[var(--dim)]">Job title</dt><dd>{meeting.prospect_job_title}</dd></>}
              </dl>
            </Panel>

            <Panel title="Company">
              <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-[6px] pt-2 text-[12.5px]">
                <dt className="text-[var(--dim)]">Company</dt><dd className="font-semibold">{meeting.company_name}</dd>
                {meeting.company_website && <><dt className="text-[var(--dim)]">Website</dt><dd><a href={meeting.company_website} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--accent)] hover:underline">{meeting.company_website}</a></dd></>}
                {meeting.company_headcount && <><dt className="text-[var(--dim)]">Headcount</dt><dd>{meeting.company_headcount}</dd></>}
                {meeting.revenue_last_12_months && <><dt className="text-[var(--dim)]">Revenue</dt><dd>{meeting.revenue_last_12_months}</dd></>}
                {meeting.sector_over_1000_companies != null && <><dt className="text-[var(--dim)]">1,000+ companies in sector</dt><dd>{meeting.sector_over_1000_companies ? "Yes" : "No"}</dd></>}
                {meeting.only_decision_maker != null && <><dt className="text-[var(--dim)]">Only decision maker</dt><dd>{meeting.only_decision_maker ? "Yes" : "No"}</dd></>}
                {meeting.start_timeline && <><dt className="text-[var(--dim)]">Would start</dt><dd>{meeting.start_timeline}</dd></>}
                {meeting.capacity_5_10 != null && <><dt className="text-[var(--dim)]">Capacity for 5–10 a month</dt><dd>{meeting.capacity_5_10 ? "Yes" : "No"}</dd></>}
                {meeting.agency_led && <><dt className="text-[var(--dim)]">Candidate or industry led</dt><dd>{meeting.agency_led}</dd></>}
                {meeting.vacancies_from_new_clients_last_month && <><dt className="text-[var(--dim)]">New-client vacancies last month</dt><dd>{meeting.vacancies_from_new_clients_last_month}</dd></>}
                {meeting.target_job_titles && <><dt className="text-[var(--dim)]">Job titles they want</dt><dd>{meeting.target_job_titles}</dd></>}
                {meeting.bd_bottleneck && <><dt className="text-[var(--dim)]">Biggest BD bottleneck</dt><dd>{meeting.bd_bottleneck}</dd></>}
              </dl>
            </Panel>

            {meeting.notes && (
              <Panel title="Notes">
                <p className="whitespace-pre-wrap pt-2 text-[12.5px]">{meeting.notes}</p>
              </Panel>
            )}

            {(meeting.google_meet_link || meeting.close_lead_link) && (
              <Panel title="Links">
                <div className="space-y-2 pt-2 text-[12.5px]">
                  {meeting.google_meet_link && (
                    <div className="flex items-center gap-2">
                      <a href={meeting.google_meet_link} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--accent)] hover:underline">{meeting.google_meet_link}</a>
                      <ButtonV2 size="sm" onClick={() => { navigator.clipboard.writeText(meeting.google_meet_link); toast.success("Meet link copied"); }}>Copy</ButtonV2>
                    </div>
                  )}
                  {meeting.close_lead_link && (
                    <button type="button" onClick={() => openCloseLeadLink(meeting.close_lead_link)} className="text-[12.5px] text-[var(--accent)] hover:underline">View in Close →</button>
                  )}
                </div>
              </Panel>
            )}

            <Panel title="Actions">
              <div className="flex flex-wrap gap-[6px] pt-3">
                {!hideClientAssignment && (
                  <ButtonV2 size="sm" onClick={() => { onAssignClient(meeting.id); onOpenChange(false); }}>
                    {meeting.client_profile_id ? "Reassign client" : "Assign to client"}
                  </ButtonV2>
                )}
                {isPending && (
                  <>
                    <ButtonV2 size="sm" variant="primary" onClick={approveMeeting}>Approve</ButtonV2>
                    <ButtonV2 size="sm" onClick={declineMeeting}>Decline</ButtonV2>
                  </>
                )}
                {meeting.approved_by_admin && (
                  <ButtonV2 size="sm" onClick={() => setShowStatusModal(true)}>Update meeting status</ButtonV2>
                )}
                <ButtonV2 size="sm" variant="ghost" className="text-[var(--bad)]" onClick={() => setShowDeleteConfirm(true)}>Delete</ButtonV2>
              </div>
            </Panel>
          </div>
        </SheetContent>
      </Sheet>

      {meeting && (
        <UpdateMeetingStatusModal
          open={showStatusModal}
          onOpenChange={setShowStatusModal}
          meeting={meeting}
          onUpdated={() => {
            onUpdate();
            onOpenChange(false);
          }}
        />
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this meeting with {meeting.company_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteMeeting} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
