import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CalendarDays, UserCheck, CalendarCheck, CalendarX, PhoneOff, Ban } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BookingSlotPicker, utcToLondonParts } from "@/components/bookings/BookingSlotPicker";
import { useFollowUpEventFor, useDiscoveryEventFor } from "@/hooks/useBookingEvent";

export interface StatusData {
  status: string;
  follow_up_date?: string;
  follow_up_time?: string;
  /** Set when the follow-up was picked from the live calendar — the caller
   * books it through the engine after the outcome saves (invite + SMS). */
  follow_up_booking?: { eventTypeId: string; hostUserId: string; startsAt: string };
  reschedule_date?: string;
  reschedule_time?: string;
  reschedule_mode?: "enter_details" | "assign_setter";
  /** Set when the reschedule slot was picked from the live calendar — booked
   * through the engine after the outcome saves (new event + fresh invite). */
  reschedule_booking?: { eventTypeId: string; hostUserId: string; startsAt: string };
  cancel_reason?: string;
  /** Reason captured when AE selects "Sat – No Follow Up Booked". */
  no_follow_up_note?: string;
  /** No-show checklist responses (true = yes). */
  no_show_checklist?: {
    waiting_email_sent: boolean;
    called_prospect: boolean;
    informed_setter: boolean;
    waited_ten_minutes: boolean;
  };
}

interface AcquisitionStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: any;
  onContinueToOutcome: (meeting: any, statusData: StatusData) => void;
  /** Preselect an outcome (quick actions); the AE can still change it. */
  initialStatus?: string;
}

export const AcquisitionStatusModal = ({
  open,
  onOpenChange,
  meeting,
  onContinueToOutcome,
  initialStatus,
}: AcquisitionStatusModalProps) => {
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    if (open && initialStatus) setStatus(initialStatus);
  }, [open, initialStatus]);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [followUpSlot, setFollowUpSlot] = useState<string | null>(null);
  const [manualFollowUp, setManualFollowUp] = useState(false);
  // Second option: instead of picking a time for them, the AE copies their own
  // follow-up booking link and sends it in their recap email. It is just the
  // event's public link — no one-time token, nothing generated (the owner, 26 Aug).
  const [linkCopied, setLinkCopied] = useState(false);

  // Live follow-up picker: books onto the meeting's AE (or the signed-in AE,
  // when they're a host of the follow-up event) — each AE sees their own times.
  const { data: sessionUserId } = useQuery({
    queryKey: ["session-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: Infinity,
  });
  // Whose booking events to resolve. For an AE: the meeting's AE if there is
  // one, otherwise themselves — resolves to that AE's OWN follow-up event
  // where they have one, falling back to the shared event.
  // For admin/dev (2 Sep fix): ALWAYS the signed-in user. A meeting still
  // stamped with a departed AE used to resolve to Oliver's deactivated
  // event, then to the also-inactive shared fallback, then to null — the
  // slot picker and copy-link silently vanished and no invite/SMS went out.
  // Marcus owns an active follow-up event and hosts the discovery events, so
  // resolving to him is always bookable.
  const { userRole } = useAuth();
  const isAdminTier = userRole === "admin" || userRole === "dev";
  const followUpAeId = isAdminTier
    ? sessionUserId
    : meeting?.assigned_ae_id || sessionUserId;
  const { data: followUpEvent } = useFollowUpEventFor(followUpAeId);
  // Rescheduling books a NEW discovery on the AE's calendar, so it needs the
  // discovery event rather than the follow-up one.
  const { data: discoveryEvent } = useDiscoveryEventFor(followUpAeId);
  const [rescheduleSlot, setRescheduleSlot] = useState<string | null>(null);
  const [rescheduleManual, setRescheduleManual] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [noFollowUpNote, setNoFollowUpNote] = useState("");
  const [rescheduleMode, setRescheduleMode] = useState<"enter_details" | "assign_setter">("enter_details");
  const [noShowChecklist, setNoShowChecklist] = useState<{
    waiting_email_sent: "" | "yes" | "no";
    called_prospect: "" | "yes" | "no";
    informed_setter: "" | "yes" | "no";
    waited_ten_minutes: "" | "yes" | "no";
  }>({ waiting_email_sent: "", called_prospect: "", informed_setter: "", waited_ten_minutes: "" });

  const resetForm = () => {
    setStatus("");
    setFollowUpDate("");
    setFollowUpTime("");
    setFollowUpSlot(null);
    setManualFollowUp(false);
    setRescheduleDate("");
    setRescheduleTime("");
    setCancelReason("");
    setNoFollowUpNote("");
    setRescheduleMode("enter_details");
    setNoShowChecklist({ waiting_email_sent: "", called_prospect: "", informed_setter: "", waited_ten_minutes: "" });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetForm();
    onOpenChange(newOpen);
  };

  const canContinue = () => {
    if (!status) return false;
    if (status === "sat_follow_up" && !followUpSlot && (!followUpDate || !followUpTime)) return false;
    if (status === "sat_no_follow_up" && !noFollowUpNote.trim()) return false;
    if (
      status === "rescheduled" && rescheduleMode === "enter_details" &&
      !rescheduleSlot && (!rescheduleDate || !rescheduleTime)
    ) return false;
    if (status === "cancelled" && !cancelReason.trim()) return false;
    if (status === "no_show") {
      const v = noShowChecklist;
      if (!v.waiting_email_sent || !v.called_prospect || !v.informed_setter || !v.waited_ten_minutes) return false;
    }
    return true;
  };


  const followUpLink = followUpEvent?.slug
    ? `${window.location.origin}/bookings/${followUpEvent.slug}`
    : null;

  const copyFollowUpLink = async () => {
    if (!followUpLink) return;
    try {
      await navigator.clipboard.writeText(followUpLink);
      setLinkCopied(true);
      toast.success("Link copied — paste it into your recap email");
    } catch {
      toast.message("Copy it from below");
      setLinkCopied(true);
    }
  };


  const handleContinue = () => {
    if (!canContinue()) return;

    // Live-picked follow-up: date/time derive from the slot (UK wall time) so
    // pitch_calls and every follow-up display stay consistent with the invite.
    const slotParts = status === "sat_follow_up" && followUpSlot ? utcToLondonParts(followUpSlot) : null;
    const statusData: StatusData = {
      status,
      follow_up_date: status === "sat_follow_up" ? (slotParts?.date || followUpDate) : undefined,
      follow_up_time: status === "sat_follow_up" ? (slotParts?.time || followUpTime) : undefined,
      follow_up_booking:
        status === "sat_follow_up" && followUpSlot && followUpEvent
          ? {
              eventTypeId: followUpEvent.eventTypeId,
              hostUserId: followUpEvent.hostUserId,
              startsAt: followUpSlot,
            }
          : undefined,
      reschedule_date: status === "rescheduled"
        ? (rescheduleSlot ? utcToLondonParts(rescheduleSlot).date : rescheduleDate)
        : undefined,
      reschedule_time: status === "rescheduled"
        ? (rescheduleSlot ? utcToLondonParts(rescheduleSlot).time : rescheduleTime)
        : undefined,
      reschedule_mode: status === "rescheduled" ? rescheduleMode : undefined,
      // A live-picked slot books through the engine: new calendar event on the
      // AE's calendar and a fresh invite to the prospect.
      reschedule_booking:
        status === "rescheduled" && rescheduleMode === "enter_details" &&
        rescheduleSlot && discoveryEvent
          ? {
              eventTypeId: discoveryEvent.eventTypeId,
              hostUserId: discoveryEvent.hostUserId,
              startsAt: rescheduleSlot,
            }
          : undefined,
      cancel_reason: status === "cancelled" ? cancelReason : undefined,
      no_follow_up_note: status === "sat_no_follow_up" ? noFollowUpNote.trim() || undefined : undefined,
      no_show_checklist: status === "no_show" ? {
        waiting_email_sent: noShowChecklist.waiting_email_sent === "yes",
        called_prospect: noShowChecklist.called_prospect === "yes",
        informed_setter: noShowChecklist.informed_setter === "yes",
        waited_ten_minutes: noShowChecklist.waited_ten_minutes === "yes",
      } : undefined,
    };

    handleOpenChange(false);
    onContinueToOutcome(meeting, statusData);
  };

  if (!meeting) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Update Meeting Status</DialogTitle>
          <DialogDescription>
            {meeting.company_name} - {meeting.prospect_name}
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0 is load-bearing: DialogContent is display:grid, and without
            it this direct grid child sizes to the slot picker's intrinsic
            day-strip width, clipping the picker at the dialog edge. */}
        <div className="space-y-4 py-4 min-w-0">
          <RadioGroup value={status} onValueChange={setStatus}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="sat_follow_up" id="sat_follow_up" />
              <Label htmlFor="sat_follow_up" className="font-medium flex items-center gap-2 cursor-pointer">
                <CalendarCheck className="h-4 w-4 text-green-500" />
                Sat - Follow Up Booked
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="sat_no_follow_up" id="sat_no_follow_up" />
              <Label htmlFor="sat_no_follow_up" className="font-medium cursor-pointer">
                Sat - No Follow Up Booked
              </Label>
            </div>

            {/* Notes when "Sat - No Follow Up Booked" is selected */}
            {status === "sat_no_follow_up" && (
              <div className="space-y-2 pl-6 pt-1 pb-2 border-l-2 border-green-500/30 ml-1">
                <Label htmlFor="no_follow_up_note" className="text-sm">
                  Why was no follow-up booked? *
                </Label>
                <Textarea
                  id="no_follow_up_note"
                  value={noFollowUpNote}
                  onChange={(e) => setNoFollowUpNote(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="rescheduled" id="rescheduled" />
              <Label htmlFor="rescheduled" className="font-medium cursor-pointer">Rescheduled</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="cancelled" id="cancelled" />
              <Label htmlFor="cancelled" className="font-medium cursor-pointer">Cancelled</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no_show" id="no_show" />
              <Label htmlFor="no_show" className="font-medium flex items-center gap-2 cursor-pointer">
                <PhoneOff className="h-4 w-4 text-red-500" />
                No Show
              </Label>
            </div>
          </RadioGroup>

          {/* Sat - Follow Up Booked: live calendar picker (books the follow-up
              through Vexon OS Bookings — invite + SMS) with manual fallback */}
          {status === "sat_follow_up" && (
            <div className="space-y-3 pl-6 pt-2 border-l-2 border-green-500/30">
              {followUpEvent && !manualFollowUp ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Pick a time from the AE's live calendar. Saving the outcome books it:
                    calendar invite to the prospect, SMS, reminders, and it lands in the
                    follow-ups tab.
                  </p>
                  <BookingSlotPicker
                    eventTypeId={followUpEvent.eventTypeId}
                    hostUserId={followUpEvent.hostUserId}
                    value={followUpSlot}
                    onSelect={setFollowUpSlot}
                  />
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Or let them pick: send them your follow-up booking link. It only
                      offers your calendar, and lands in your follow-ups when they choose
                      a time.
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button" size="sm" variant="outline"
                        disabled={!followUpLink}
                        onClick={copyFollowUpLink}
                      >
                        {linkCopied ? "Copy link again" : "Copy booking link"}
                      </Button>
                      {followUpLink && (
                        <span className="text-[11px] text-muted-foreground font-mono break-all">
                          {followUpLink}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => { setManualFollowUp(true); setFollowUpSlot(null); }}
                  >
                    Enter a date &amp; time manually instead (no invite is sent)
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Enter the follow-up call date and time:</p>
                  <div>
                    <Label>Follow-Up Date *</Label>
                    <Input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="[color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <Label>Follow-Up Time *</Label>
                    <Input
                      type="time"
                      value={followUpTime}
                      onChange={(e) => setFollowUpTime(e.target.value)}
                      className="[color-scheme:dark]"
                    />
                  </div>
                  {followUpEvent && (
                    <button
                      type="button"
                      className="text-xs text-primary underline"
                      onClick={() => { setManualFollowUp(false); setFollowUpDate(""); setFollowUpTime(""); }}
                    >
                      Use the live calendar picker instead
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Rescheduled options */}
          {status === "rescheduled" && (
            <div className="space-y-4 pl-6 pt-2 border-l-2 border-primary/30">
              <RadioGroup value={rescheduleMode} onValueChange={(v) => setRescheduleMode(v as "enter_details" | "assign_setter")}>
                <div className="flex items-start space-x-2 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value="enter_details" id="enter_details" className="mt-0.5" />
                  <div className="space-y-1">
                    <Label htmlFor="enter_details" className="font-medium flex items-center gap-2 cursor-pointer">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      Reschedule Now
                    </Label>
                    <p className="text-xs text-muted-foreground">Enter the new meeting date and time</p>
                  </div>
                </div>
                <div className="flex items-start space-x-2 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value="assign_setter" id="assign_setter" className="mt-0.5" />
                  <div className="space-y-1">
                    <Label htmlFor="assign_setter" className="font-medium flex items-center gap-2 cursor-pointer">
                      <UserCheck className="h-4 w-4 text-primary" />
                      Assign to Setter
                    </Label>
                    <p className="text-xs text-muted-foreground">Notify the setter to rebook this meeting</p>
                  </div>
                </div>
              </RadioGroup>

              {rescheduleMode === "enter_details" && discoveryEvent && !rescheduleManual && (
                <div className="space-y-3 pt-2 min-w-0">
                  <p className="text-sm text-muted-foreground">
                    Pick the new time from your live calendar. Saving moves the meeting
                    and sends the prospect a fresh invite for the new slot.
                  </p>
                  <BookingSlotPicker
                    eventTypeId={discoveryEvent.eventTypeId}
                    hostUserId={discoveryEvent.hostUserId}
                    value={rescheduleSlot}
                    onSelect={setRescheduleSlot}
                  />
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => { setRescheduleManual(true); setRescheduleSlot(null); }}
                  >
                    Enter a date &amp; time manually instead (no invite is sent)
                  </button>
                </div>
              )}

              {rescheduleMode === "enter_details" && (!discoveryEvent || rescheduleManual) && (
                <div className="space-y-3 pt-2">
                  <div>
                    <Label>New Meeting Date *</Label>
                    <Input
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="[color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <Label>New Meeting Time *</Label>
                    <Input
                      type="time"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className="[color-scheme:dark]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cancelled reason */}
          {status === "cancelled" && (
            <div className="space-y-3 pl-6 pt-2 border-l-2 border-destructive/30">
              <p className="text-sm text-muted-foreground">Enter the reason for cancellation:</p>
              <div>
                <Label>Cancellation Reason *</Label>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Why was this meeting cancelled?"
                  rows={3}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The setter who logged this meeting will be notified.
              </p>
            </div>
          )}

          {/* No Show info + checklist */}
          {status === "no_show" && (
            <div className="space-y-4 pl-6 pt-2 border-l-2 border-red-500/30">
              <p className="text-sm text-muted-foreground">
                The setter who logged this meeting will be notified to re-engage the prospect and rebook.
              </p>
              <div className="space-y-3">
                {[
                  { key: "waiting_email_sent" as const, label: "Did you send them the waiting-in-call email?" },
                  { key: "called_prospect" as const, label: "Have you called them?" },
                  { key: "informed_setter" as const, label: "Have you informed the relevant setter?" },
                  { key: "waited_ten_minutes" as const, label: "Did you wait ten minutes?" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-sm">{label} *</Label>
                    <RadioGroup
                      value={noShowChecklist[key]}
                      onValueChange={(v) => setNoShowChecklist({ ...noShowChecklist, [key]: v as "yes" | "no" })}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id={`${key}_yes`} />
                        <Label htmlFor={`${key}_yes`} className="cursor-pointer text-sm">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id={`${key}_no`} />
                        <Label htmlFor={`${key}_no`} className="cursor-pointer text-sm">No</Label>
                      </div>
                    </RadioGroup>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleContinue} disabled={!canContinue()}>
            Continue to Outcome
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
