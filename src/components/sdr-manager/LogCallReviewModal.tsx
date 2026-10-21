// Log a Call Review — Marcus's 2 Sep spec, schedule-first flow.
//
// A call review is a standardised 30-minute session with a setter. This modal
// SCHEDULES it: pick the setter, then either a live slot on the manager's
// call-review booking event (books the manager's calendar; Google emails the
// setter the invite automatically) or a manual date/time — which doubles as
// the "log a past review" path (back-date it, then open it and Complete).
// The Fathom link and the two priorities are captured at COMPLETION, in
// CoachingSessionDrawer.
//
// Graceful pre-migration (house pattern): the booking event + the
// duration/booking_id columns arrive with migration 20260902150000. Until
// it's applied, the slot picker simply doesn't render (useBookingEvent
// returns null for a missing event) and the follow-up column write is
// guarded — the base session row always saves.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Headphones } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BookingSlotPicker, utcToLondonParts } from "@/components/bookings/BookingSlotPicker";
import { useBookingEvent, bookCandidateSlot, CALL_REVIEW_EVENT_SLUG } from "@/hooks/useBookingEvent";

interface LogCallReviewModalProps {
  open: boolean;
  onClose: () => void;
  setters: { id: string; full_name: string }[];
  managerId: string;
}

const timeSlots = Array.from({ length: 24 }, (_, h) =>
  ["00", "30"].map((m) => `${h.toString().padStart(2, "0")}:${m}`),
).flat();

const LogCallReviewModal = ({ open, onClose, setters, managerId }: LogCallReviewModalProps) => {
  const queryClient = useQueryClient();
  const [setterId, setSetterId] = useState("");
  const [slot, setSlot] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [sessionDate, setSessionDate] = useState<Date>(new Date());
  const [sessionTime, setSessionTime] = useState("09:00");
  const [agenda, setAgenda] = useState("");

  const { data: reviewEvent } = useBookingEvent(CALL_REVIEW_EVENT_SLUG);
  // Event missing/inactive (e.g. migration not applied yet) → manual only.
  const liveMode = !!reviewEvent && !manual;

  const resetForm = () => {
    setSetterId("");
    setSlot(null);
    setManual(false);
    setSessionDate(new Date());
    setSessionTime("09:00");
    setAgenda("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      let bookingId: string | null = null;
      let dateISO: string;
      let time: string;

      if (liveMode) {
        if (!slot) throw new Error("Pick a slot first");
        // The setter's email lives on their profile — the invite goes there.
        const { data: profile } = await supabase
          .from("setters_profiles")
          .select("full_name, email")
          .eq("id", setterId)
          .maybeSingle();
        if (!profile?.email) {
          throw new Error("This setter has no email on their profile — use manual date/time instead.");
        }
        const booked = await bookCandidateSlot({
          eventTypeId: reviewEvent!.eventTypeId,
          hostUserId: reviewEvent!.hostUserId,
          startsAt: slot,
          name: profile.full_name || "Setter",
          email: profile.email,
          // No answers: session notes never travel in calendar invites
          // (staff-event descriptions render to every attendee).
        });
        if (!booked.ok) throw new Error(booked.error || "Booking failed");
        bookingId = booked.bookingId ?? null;
        const parts = utcToLondonParts(slot);
        dateISO = parts.date;
        time = parts.time;
      } else {
        dateISO = format(sessionDate, "yyyy-MM-dd");
        time = sessionTime;
      }

      const { data: inserted, error } = await supabase
        .from("coaching_sessions")
        .insert({
          setter_profile_id: setterId,
          manager_user_id: managerId,
          session_type: "call_review",
          session_date: dateISO,
          session_time: time,
          agenda: agenda || null,
          status: "scheduled",
        })
        .select("id")
        .single();
      if (error) throw error;

      // New call-review columns land with migration 20260902150000 — guarded
      // separate update so the session still saves cleanly before it's run.
      const { error: extraErr } = await supabase
        .from("coaching_sessions")
        .update({ duration_minutes: 30, booking_id: bookingId } as never)
        .eq("id", inserted.id);
      if (extraErr) {
        toast.warning(
          "Review scheduled, but the duration/booking link needs the pending database migration.",
        );
      }
      return { booked: liveMode };
    },
    onSuccess: ({ booked }) => {
      toast.success(
        booked
          ? "Call review booked — it's on both calendars and the setter has the invite."
          : "Call review scheduled.",
      );
      queryClient.invalidateQueries({ queryKey: ["sdr-manager-coaching-sessions"] });
      resetForm();
      onClose();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Couldn't schedule the review: ${msg}`);
    },
  });

  const isValid = !!setterId && (liveMode ? !!slot : !!sessionDate && !!sessionTime);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" />
            Log a Call Review
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            A standardised 30-minute review. Book a live slot and it lands on
            both calendars with the invite emailed to the setter — the Fathom
            link and the two priorities are captured when you complete it.
          </p>

          <div className="space-y-2">
            <Label>Setter <span className="text-destructive">*</span></Label>
            <Select value={setterId} onValueChange={setSetterId}>
              <SelectTrigger>
                <SelectValue placeholder="Select setter" />
              </SelectTrigger>
              <SelectContent>
                {setters.map((setter) => (
                  <SelectItem key={setter.id} value={setter.id}>
                    {setter.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {liveMode ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Pick a slot <span className="text-destructive">*</span></Label>
                <button
                  type="button"
                  onClick={() => setManual(true)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Set date/time manually (or log a past review)
                </button>
              </div>
              <BookingSlotPicker
                eventTypeId={reviewEvent!.eventTypeId}
                hostUserId={reviewEvent!.hostUserId}
                value={slot}
                onSelect={setSlot}
              />
            </div>
          ) : (
            <>
              {reviewEvent && (
                <button
                  type="button"
                  onClick={() => setManual(false)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  ← Back to live slots (books both calendars)
                </button>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date <span className="text-destructive">*</span></Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !sessionDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {sessionDate ? format(sessionDate, "MMM d, yyyy") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={sessionDate}
                        onSelect={(date) => date && setSessionDate(date)}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Time <span className="text-destructive">*</span></Label>
                  <Select value={sessionTime} onValueChange={setSessionTime}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {timeSlots.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Manual mode books no calendars — use it for reviews that already
                happened, then open the session and hit Complete.
              </p>
            </>
          )}

          <div className="space-y-2">
            <Label>
              Agenda <span className="text-xs text-muted-foreground">(visible to setter)</span>
            </Label>
            <Textarea
              placeholder="e.g. Reviewing Tuesday's discovery calls…"
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!isValid || createMutation.isPending}
          >
            {liveMode ? "Book Call Review" : "Schedule Call Review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LogCallReviewModal;
