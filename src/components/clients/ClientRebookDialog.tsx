import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CalendarClock, AlertTriangle, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

/**
 * Move a client booking to a new time (the owner, 16 Sep). The setters have had a
 * rebook flow since August; the fulfilment side had nothing, so a client whose
 * prospect cancelled left Daniel cancelling in the Dev Centre and re-booking by
 * hand on the public page.
 *
 * The times offered here are the same ones a prospect would see: the client's
 * own availability windows, minus their real calendar. If we can't reach that
 * calendar we show an error rather than a list, because presenting busy time as
 * free is the one failure this feature exists to prevent.
 */

type Booking = {
  id: string;
  prospect_name: string | null;
  prospect_email: string | null;
  starts_at: string;
};

export function ClientRebookDialog({
  open, onOpenChange, clientId, booking, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  booking: Booking | null;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["client-booking-slots", clientId, booking?.id],
    enabled: open && !!booking,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: res, error: fnErr } = await supabase.functions.invoke(
        "booking-client-admin",
        // booking_id: a callback being moved gets callback times (16 Oct).
        { body: { action: "booking_slots", client_profile_id: clientId, booking_id: booking?.id, days: 21 } },
      );
      const failMsg = fnErr?.message || res?.error;
      if (failMsg) throw new Error(failMsg);
      return res as {
        slots: Array<{ starts_at: string; ends_at: string }>;
        calendar_checked: boolean;
        duration_minutes: number;
      };
    },
  });

  // Grouped by day so a fortnight of 30-minute slots stays readable.
  const byDay = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const s of data?.slots || []) {
      const key = format(new Date(s.starts_at), "EEEE d MMMM");
      groups.set(key, [...(groups.get(key) || []), s.starts_at]);
    }
    return [...groups.entries()];
  }, [data]);

  const submit = async () => {
    if (!booking || !picked) return;
    setSaving(true);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke(
        "booking-client-admin",
        {
          body: {
            action: "rebook_booking",
            client_profile_id: clientId,
            booking_id: booking.id,
            starts_at: picked,
          },
        },
      );
      const failMsg = fnErr?.message || res?.error;
      if (failMsg) {
        toast.error(failMsg);
        return;
      }
      // The new booking is what matters; say so plainly, but don't claim the
      // client's calendar is clean if the delete didn't land.
      toast.success(
        res?.old_calendar_cleared
          ? "Rebooked — the old meeting is off the client's calendar"
          : "Rebooked, but the old calendar invite may still be there — check it",
      );
      onOpenChange(false);
      setPicked(null);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Move this meeting
          </DialogTitle>
          <DialogDescription>
            {booking && (
              <>
                {booking.prospect_name || booking.prospect_email || "The prospect"} is
                currently booked for{" "}
                <strong>{format(new Date(booking.starts_at), "EEE d MMM 'at' HH:mm")}</strong>.
                Pick a new time — we'll book it, then clear the old one from the
                client's calendar.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking the client's calendar…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <span>{(error as Error).message}</span>
          </div>
        )}

        {data && (
          <>
            {data.calendar_checked ? (
              <Badge className="w-fit bg-green-500/20 text-green-700 border-green-500/30">
                <ShieldCheck className="h-3 w-3 mr-1" /> Checked against the client's calendar
              </Badge>
            ) : (
              <Badge variant="outline" className="w-fit">
                Availability windows only — this client hasn't connected a calendar
              </Badge>
            )}

            {byDay.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No free slots in the next three weeks.
              </p>
            )}

            <ScrollArea className="max-h-[320px] pr-3">
              <div className="space-y-4">
                {byDay.map(([day, times]) => (
                  <div key={day}>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">{day}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {times.map((t) => (
                        <Button
                          key={t}
                          size="sm"
                          variant={picked === t ? "default" : "outline"}
                          onClick={() => setPicked(t)}
                        >
                          {format(new Date(t), "HH:mm")}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!picked || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {picked
              ? `Move to ${format(new Date(picked), "EEE d MMM HH:mm")}`
              : "Pick a time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
