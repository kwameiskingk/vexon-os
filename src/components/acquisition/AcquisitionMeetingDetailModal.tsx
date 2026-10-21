import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Calendar, Clock, Building, User, Mail, Phone, Globe, Linkedin, FileText, CheckCircle2, XCircle, Clock4, RefreshCw, Trash2, UserCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";

const DM_STATUS_LABELS: Record<string, string> = {
  joining: "joining the call",
  attending_instead: "attending instead of the prospect",
  briefed_by_prospect: "will be briefed by the prospect",
  email_pending: "email to be collected",
};

interface AcquisitionMeetingDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: any;
  onUpdateStatus: () => void;
  hasOutcome?: boolean;
  onDelete?: (meetingId: string) => void;
}

export function AcquisitionMeetingDetailModal({ open, onOpenChange, meeting, onUpdateStatus, hasOutcome, onDelete }: AcquisitionMeetingDetailModalProps) {
  const { userRoles } = useAuth();
  // AEs (without admin/dev rights) should not be able to reassign meetings.
  const isAeOnly =
    userRoles?.includes("account_executive") &&
    !userRoles?.some((r) => ["admin", "dev", "sdr_manager", "csm", "ops_assistant", "hr"].includes(r));
  const [acceptedByClient, setAcceptedByClient] = useState<boolean>(false);
  const [aeList, setAeList] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedAeId, setSelectedAeId] = useState<string | null>(null);
  const [assigningAe, setAssigningAe] = useState(false);

  useEffect(() => {
    if (meeting) {
      setAcceptedByClient(!!meeting.accepted_by_client);
      setSelectedAeId(meeting.assigned_ae_id || null);
    }
  }, [meeting]);

  useEffect(() => {
    // AEs plus admins (Marcus conducts discoveries himself), minus leavers.
    const fetchAEs = async () => {
      const [{ data: aeRoles }, offboarded] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["account_executive", "admin"]),
        fetchOffboardedUserIds(),
      ]);
      const ids = Array.from(new Set((aeRoles || []).map(r => r.user_id))).filter(
        id => !offboarded.has(id)
      );
      if (!ids.length) return;
      const aeIdSet = new Set(
        (aeRoles || []).filter(r => r.role === "account_executive").map(r => r.user_id)
      );
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      setAeList(
        (profiles || []).sort((a, b) => {
          const ra = aeIdSet.has(a.id) ? 0 : 1;
          const rb = aeIdSet.has(b.id) ? 0 : 1;
          if (ra !== rb) return ra - rb;
          return (a.full_name || "").localeCompare(b.full_name || "");
        })
      );
    };
    if (open) fetchAEs();
  }, [open]);

  const handleAcceptedChange = async (checked: boolean) => {
    setAcceptedByClient(checked);
    try {
      const updatePayload: any = { 
        accepted_by_client: checked,
        client_accepted: checked,
      };
      if (checked) {
        updatePayload.status = "client_accepted";
      }
      await supabase
        .from("meetings")
        .update(updatePayload)
        .eq("id", meeting.id);
      toast.success(checked ? "Marked as accepted" : "Marked as not accepted");
    } catch {
      toast.error("Failed to update");
      setAcceptedByClient(!checked);
    }
  };

  const handleAssignAe = async (aeId: string) => {
    const newValue = aeId === "unassigned" ? null : aeId;
    setSelectedAeId(newValue);
    setAssigningAe(true);
    try {
      const { error } = await supabase
        .from("meetings")
        .update({ assigned_ae_id: newValue })
        .eq("id", meeting.id);
      if (error) throw error;
      const aeName = aeList.find(a => a.id === aeId)?.full_name;
      toast.success(newValue ? `Assigned to ${aeName}` : "AE unassigned");
      onUpdateStatus();
    } catch {
      toast.error("Failed to assign AE");
      setSelectedAeId(meeting.assigned_ae_id || null);
    } finally {
      setAssigningAe(false);
    }
  };

  if (!meeting) return null;

  const effectiveStatus = meeting.attendance_status || meeting.status;

  const getStatusBadge = () => {
    switch (effectiveStatus) {
      case 'sat':
        return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Sat</Badge>;
      case 'no_show':
        return <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />No Show</Badge>;
      case 'cancelled':
        return <Badge className="bg-muted text-muted-foreground border-border"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      case 'rescheduled':
        return <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30"><RefreshCw className="h-3 w-3 mr-1" />Rescheduled</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30"><Clock4 className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const isFinalStatus = ['sat', 'no_show', 'cancelled', 'rescheduled'].includes(effectiveStatus || '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">{meeting.company_name}</DialogTitle>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {getStatusBadge()}
            {meeting.is_rebook && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-500">Rebook</Badge>
            )}
          </div>
          <DialogDescription className="sr-only">Meeting details for {meeting.company_name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Qualification flags — the setter pushed this booking through a
              failed qualification and had to say why. Reasons are captured on
              the booking page and never appear in the calendar invite. */}
          {(meeting.price_qualified_reason || meeting.tam_reason || meeting.start_timeline_reason) && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Qualification flags</span>
              </div>
              {meeting.price_qualified_reason && (
                <p className="text-sm">
                  <span className="font-medium">
                    Under £300k — price qualified: {meeting.price_qualified ? "Yes" : "No"}.
                  </span>{" "}
                  <span className="text-muted-foreground">{meeting.price_qualified_reason}</span>
                </p>
              )}
              {meeting.tam_reason && (
                <p className="text-sm">
                  <span className="font-medium">Fewer than 1,000 companies in sector.</span>{" "}
                  <span className="text-muted-foreground">{meeting.tam_reason}</span>
                </p>
              )}
              {meeting.start_timeline_reason && (
                <p className="text-sm">
                  <span className="font-medium">
                    Won't start within a month ({meeting.start_timeline}).
                  </span>{" "}
                  <span className="text-muted-foreground">{meeting.start_timeline_reason}</span>
                </p>
              )}
            </div>
          )}

          {/* Schedule */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Meeting Schedule</h4>
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
          </div>

          <Separator />

          {/* Prospect Details */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Prospect Details</h4>
            <div className="space-y-1.5">
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
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{meeting.prospect_mobile}</span>
                </div>
              )}
              {meeting.prospect_linkedin && (
                <div className="flex items-center gap-2 text-sm">
                  <Linkedin className="h-4 w-4 text-muted-foreground" />
                  <a href={meeting.prospect_linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[250px]">{meeting.prospect_linkedin}</a>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Company Details */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Company Details</h4>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{meeting.company_name}</span>
              </div>
              {meeting.company_website && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a href={meeting.company_website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[250px]">{meeting.company_website}</a>
                </div>
              )}
              {meeting.company_headcount && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Headcount:</span>
                  <span>{meeting.company_headcount}</span>
                </div>
              )}
              {meeting.revenue_last_12_months && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Revenue (12 mo):</span>
                  <span>{meeting.revenue_last_12_months}</span>
                </div>
              )}
              {meeting.sector_over_1000_companies != null && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">1,000+ companies in sector:</span>
                  <span>{meeting.sector_over_1000_companies ? "Yes" : "No"}</span>
                </div>
              )}
              {meeting.only_decision_maker != null && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Only decision maker:</span>
                  <span>{meeting.only_decision_maker ? "Yes" : "No"}</span>
                </div>
              )}
              {meeting.decision_maker_name && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Other decision maker:</span>
                  <span>
                    {meeting.decision_maker_name}
                    {DM_STATUS_LABELS[meeting.decision_maker_status]
                      ? ` — ${DM_STATUS_LABELS[meeting.decision_maker_status]}`
                      : ""}
                    {meeting.decision_maker_email ? ` (${meeting.decision_maker_email})` : ""}
                  </span>
                </div>
              )}
              {meeting.start_timeline && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Would start:</span>
                  <span>{meeting.start_timeline}</span>
                </div>
              )}
              {meeting.capacity_5_10 != null && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Capacity for 5–10 vacancies a month:</span>
                  <span>{meeting.capacity_5_10 ? "Yes" : "No"}</span>
                </div>
              )}
              {meeting.agency_led && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Candidate or industry led:</span>
                  <span>{meeting.agency_led}</span>
                </div>
              )}
              {meeting.vacancies_from_new_clients_last_month && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Vacancies from new clients last month:</span>
                  <span>{meeting.vacancies_from_new_clients_last_month}</span>
                </div>
              )}
              {meeting.target_job_titles && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Job titles they want:</span>
                  <span>{meeting.target_job_titles}</span>
                </div>
              )}
              {meeting.bd_bottleneck && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Biggest BD bottleneck:</span>{" "}
                  <span>{meeting.bd_bottleneck}</span>
                </div>
              )}
            </div>
          </div>

          {/* Meeting Details */}
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Meeting Details</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Client Accepted Invite:</span>
                  <Badge variant={acceptedByClient ? 'success' : 'secondary'}>{acceptedByClient ? 'Yes' : 'No'}</Badge>
                </div>
                {meeting.client_confirmed_attendance !== null && meeting.client_confirmed_attendance !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Confirmed Attendance Today:</span>
                    <Badge variant={meeting.client_confirmed_attendance ? 'success' : 'secondary'}>{meeting.client_confirmed_attendance ? 'Yes' : 'No'}</Badge>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Watched Testimonial Video:</span>
                  {meeting.prospect_watched_video === null || meeting.prospect_watched_video === undefined ? (
                    <Badge variant="outline" className="text-muted-foreground">—</Badge>
                  ) : (
                    <Badge variant={meeting.prospect_watched_video ? 'success' : 'secondary'}
                      className={meeting.prospect_watched_video === false ? 'border-amber-500/60 text-amber-600 dark:text-amber-400' : ''}>
                      {meeting.prospect_watched_video ? 'Yes' : 'No'}
                    </Badge>
                  )}
                </div>
                {meeting.currently_hiring !== null && meeting.currently_hiring !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Currently Hiring:</span>
                    <Badge variant={meeting.currently_hiring ? 'success' : 'secondary'}>{meeting.currently_hiring ? 'Yes' : 'No'}</Badge>
                  </div>
                )}
                {meeting.next_job_title && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Next Job Title: </span>
                    <span>{meeting.next_job_title}</span>
                  </div>
                )}
                {meeting.close_lead_link && (
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => window.open(meeting.close_lead_link, '_blank', 'noopener,noreferrer')}
                    >
                      Open Lead in Close
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>


          {/* Assign to AE — hidden for AE-only users */}
          {!isAeOnly && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />Assign To
                </h4>
                <Select
                  value={selectedAeId || "unassigned"}
                  onValueChange={handleAssignAe}
                  disabled={assigningAe}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Account Executive" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {aeList.map(ae => (
                      <SelectItem key={ae.id} value={ae.id}>{ae.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Setter & AE Info */}
          {(meeting.setter_profile || meeting.assigned_ae_profile) && (
            <>
              <Separator />
              <div className="space-y-2">
                {meeting.setter_profile && (
                  <>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Logged By</h4>
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-primary" />
                      <span className="font-medium">{meeting.setter_profile.full_name || meeting.setter_profile.email}</span>
                    </div>
                  </>
                )}
                {meeting.assigned_ae_profile && (
                  <>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mt-2">Meeting For</h4>
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">{meeting.assigned_ae_profile.full_name || meeting.assigned_ae_profile.email}</span>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* Notes */}
          {meeting.notes && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <FileText className="h-4 w-4" />Notes
                </h4>
                <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">{meeting.notes}</p>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <Separator />
          <div className="flex items-center gap-2">
            {!hasOutcome && !isFinalStatus && (
              <Button className="flex-1" onClick={() => { onOpenChange(false); onUpdateStatus(); }}>
                Update Meeting Status
              </Button>
            )}
            
            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="icon">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this meeting for <strong>{meeting.company_name}</strong>. 
                      It will be removed from the setter's records, commissions, and all metrics. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        onDelete(meeting.id);
                        onOpenChange(false);
                      }}
                    >
                      Delete Meeting
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}