import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface UpdateMeetingStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: any;
  onUpdated: () => void;
  onReschedule?: (meetingData: any) => void;
  /** Lock attendance at Sat and only allow the scoring exemption to be
      set/cleared — for entry points on already-resolved sat meetings that
      never offered status changes before the exemption feature existed. */
  exemptionOnly?: boolean;
}

export const UpdateMeetingStatusModal = ({
  open,
  onOpenChange,
  meeting,
  onUpdated,
  onReschedule,
  exemptionOnly = false
}: UpdateMeetingStatusModalProps) => {
  const { user } = useAuth();
  const initial = exemptionOnly
    ? 'sat'
    : ['sat','no_show','rescheduled'].includes(meeting?.attendance_status) ? meeting.attendance_status : 'sat';
  const [status, setStatus] = useState<string>(initial);
  const [logReschedule, setLogReschedule] = useState(false);
  const [scoringExempt, setScoringExempt] = useState<boolean>(!!meeting?.scoring_exempt);
  const [exemptReason, setExemptReason] = useState<string>(meeting?.scoring_exempt_reason || "");
  const [updating, setUpdating] = useState(false);

  const handleUpdate = async () => {
    // exemptionOnly locks the transition: the only writable delta from that
    // entry point is the exemption itself.
    const effectiveStatus = exemptionOnly ? "sat" : status;
    // Exemption only exists on sat meetings; any other status clears it.
    const exemptOn = effectiveStatus === "sat" && scoringExempt;
    if (exemptOn && !exemptReason.trim()) {
      toast.error("Please give a reason for the scoring exemption");
      return;
    }

    setUpdating(true);
    try {
      if (effectiveStatus === "rescheduled" && logReschedule && onReschedule) {
        // Close this modal and open the log meeting modal with pre-filled data
        onReschedule({
          ...meeting,
          is_rebook: true,
          original_meeting_id: meeting.id
        });
        onOpenChange(false);
        toast.info("Please update the meeting details and submit");
        setUpdating(false);
        return;
      }

      const update: Record<string, unknown> = {
        attendance_status: effectiveStatus,
        attendance_confirmed: effectiveStatus === "sat",
        scoring_exempt: exemptOn,
        scoring_exempt_reason: exemptOn ? exemptReason.trim() : null,
      };
      // Stamp actor/time when the exemption is newly set or its reason edited;
      // an unchanged existing exemption keeps its original stamp.
      const stamp =
        exemptOn &&
        (!meeting?.scoring_exempt || (meeting?.scoring_exempt_reason || "") !== exemptReason.trim());
      if (stamp) {
        update.scoring_exempt_by = user?.id ?? null;
        update.scoring_exempt_at = new Date().toISOString();
      } else if (!exemptOn) {
        update.scoring_exempt_by = null;
        update.scoring_exempt_at = null;
      }

      // Update the meeting status
      const { error } = await supabase
        .from("meetings")
        .update(update as never)
        .eq("id", meeting.id);

      if (error) throw error;

      toast.success(
        exemptOn
          ? "Meeting marked as sat — exempt from scoring"
          : exemptionOnly
          ? "Scoring exemption removed — back in the scoring queue"
          : `Meeting marked as ${effectiveStatus}`,
      );
      onUpdated();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Update meeting status error:", error);
      toast.error(error.message || "Failed to update meeting status");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Meeting Status</DialogTitle>
          <DialogDescription>
            Update the status for {meeting?.company_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {exemptionOnly && (
            <p className="text-xs text-muted-foreground">
              Attendance is locked — this meeting is already resolved as Sat. Only the
              scoring exemption can be changed here.
            </p>
          )}
          <RadioGroup value={status} onValueChange={setStatus} disabled={exemptionOnly}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="sat" id="sat" disabled={exemptionOnly} />
              <Label htmlFor="sat">Sat</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no_show" id="no_show" disabled={exemptionOnly} />
              <Label htmlFor="no_show" className={exemptionOnly ? "text-muted-foreground/50" : undefined}>No Show</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="rescheduled" id="rescheduled" disabled={exemptionOnly} />
              <Label htmlFor="rescheduled" className={exemptionOnly ? "text-muted-foreground/50" : undefined}>Cancelled/Rescheduled</Label>
            </div>
          </RadioGroup>

          {status === "sat" && (
            <div className="ml-6 mt-2 space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="scoring_exempt"
                  checked={scoringExempt}
                  onCheckedChange={(checked) => setScoringExempt(!!checked)}
                />
                <Label htmlFor="scoring_exempt">
                  Exempt from scoring — client-side attendee unavailable
                </Label>
              </div>
              {scoringExempt && (
                <div className="space-y-1.5">
                  <Label htmlFor="scoring_exempt_reason">Reason</Label>
                  <Textarea
                    id="scoring_exempt_reason"
                    value={exemptReason}
                    onChange={(e) => setExemptReason(e.target.value)}
                    placeholder="Why can't this meeting be scored?"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Still counts as sat everywhere; removed from the scoring queue and
                    never counted in quality averages. Untick to send it back for scoring.
                  </p>
                </div>
              )}
            </div>
          )}

          {status === "rescheduled" && (
            <div className="flex items-center space-x-2 ml-6 mt-4">
              <Checkbox
                id="log_reschedule"
                checked={logReschedule}
                onCheckedChange={(checked) => setLogReschedule(!!checked)}
              />
              <Label htmlFor="log_reschedule">
                Log the rescheduled meeting now?
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpdate} disabled={updating}>
            {updating ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
