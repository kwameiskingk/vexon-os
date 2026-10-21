// In-portal "Book a call" for clients (Communications page, 3 Sep ruling):
// a SEPARATE 30-minute "Catch-up with Daniel" event, no questions, UK time
// locked. Clients used to be sent to the public onboarding page, which asked
// for name/email/company/website/LinkedIn all over again.
//
// Event + host resolve through the client-onboarding edge function
// (`event_context`, allow-listed slugs) because client logins cannot read the
// booking tables; the booking itself goes through booking-create exactly like
// the onboarding deck's BookingStep (source "admin", the event's default).

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Calendar, CheckCircle2, Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookingSlotPicker, utcToZoneParts } from "@/components/bookings/BookingSlotPicker";
import { CLIENT_CATCHUP_EVENT_SLUG, useClientBookableEvent } from "@/hooks/useClientJourney";
import { cn } from "@/lib/utils";

const UK_TZ = "Europe/London";

const primaryBtn =
  "bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 text-white border-0 shadow-[0_8px_24px_-8px_rgba(154,86,208,.55)]";
const inputCls = "bg-white border-violet-200/80 focus-visible:ring-violet-500 h-10";

/** "Tuesday 9 September at 14:00" in UK time, whatever the browser zone. */
export function describeUkSlot(startsAt: string): string {
  const { date, time } = utcToZoneParts(startsAt, UK_TZ);
  return `${format(new Date(`${date}T12:00:00`), "EEEE d MMMM")} at ${time}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csmName: string;
  csmEmail: string;
  /** Demo portal: inert, no Supabase. */
  demo?: boolean;
  /** Fires after a successful booking so the page can refresh its lists. */
  onBooked?: (bookingId: string, startsAt: string) => void;
}

export function CatchupBookingDialog({ open, onOpenChange, csmName, csmEmail, demo, onBooked }: Props) {
  const { data: ctx, isLoading, error } = useClientBookableEvent(
    open && !demo ? CLIENT_CATCHUP_EVENT_SLUG : null,
  );
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [done, setDone] = useState<{ startsAt: string } | null>(null);

  // Prefill from the client profile once it arrives; never overwrite edits.
  useEffect(() => {
    if (!ctx?.client || touched) return;
    setName(ctx.client.contact_name || "");
    setEmail(ctx.client.email || "");
    setPhone(ctx.client.phone || "");
  }, [ctx, touched]);

  // Fresh dialog every time it opens.
  useEffect(() => {
    if (open) return;
    setSlot(null);
    setBookError(null);
    setDone(null);
    setTouched(false);
  }, [open]);

  const tz = ctx?.lock_timezone || UK_TZ;
  const emailOk = /.+@.+\..+/.test(email.trim());
  const canBook = !!slot && name.trim().length > 0 && emailOk && !booking;

  const book = async () => {
    if (!ctx || !slot || !canBook) return;
    setBooking(true);
    setBookError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("booking-create", {
        body: {
          event_type_id: ctx.event_type_id,
          host_user_id: ctx.host_user_id,
          starts_at: slot,
          prospect_name: name.trim(),
          prospect_email: email.trim(),
          prospect_mobile: phone.trim() || undefined,
          source: "admin",
          prospect_timezone: tz,
        },
      });
      if (fnErr || data?.error || !data?.booking_id) {
        throw new Error(data?.error || fnErr?.message || "Booking failed. Try another time.");
      }
      setDone({ startsAt: slot });
      onBooked?.(data.booking_id as string, slot);
    } catch (e) {
      setBookError(e instanceof Error ? e.message : "Booking failed. Try another time.");
    } finally {
      setBooking(false);
    }
  };

  const durationLabel = ctx?.duration_minutes ? `${ctx.duration_minutes} minutes` : "30 minutes";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] p-0 gap-0 overflow-hidden rounded-3xl border-0 shadow-2xl">
        <div className="bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white px-6 py-5">
          <DialogHeader className="space-y-1 text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold w-fit">
              <span className="h-5 w-5 rounded-full bg-white/25 inline-flex items-center justify-center text-[10px]">
                {csmName.slice(0, 1).toUpperCase()}
              </span>
              {csmName}, Customer Success Manager
            </div>
            <DialogTitle className="font-heading text-xl font-semibold leading-tight text-white">
              {done ? "You're booked in" : `Catch-up with ${csmName}`}
            </DialogTitle>
            <DialogDescription className="text-white/80 text-sm">
              {done
                ? "The calendar invite is on its way to your inbox."
                : `${durationLabel} on Google Meet. Pick a time that suits you.`}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-4 bg-white">
          {demo ? (
            <p className="text-sm text-muted-foreground">Live slot picker appears here (demo).</p>
          ) : done ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-heading font-semibold text-foreground">{describeUkSlot(done.startsAt)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">UK time, {durationLabel} with {csmName}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  The invite, with the video link, is in your inbox at <span className="text-foreground">{email.trim()}</span>.
                  Need to move it? Just reply to the invite or email {csmName} at {csmEmail}.
                </p>
              </div>
              <div className="flex justify-end">
                <Button className={primaryBtn} onClick={() => onOpenChange(false)}>Done</Button>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Getting {csmName}'s diary ready
            </div>
          ) : error || !ctx?.event_type_id ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
              {(error as Error | null)?.message ||
                "This call isn't set up yet."}{" "}
              You can always email {csmName} at{" "}
              <a className="underline" href={`mailto:${csmEmail}`}>{csmEmail}</a>.
            </div>
          ) : !ctx.accepting_bookings ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
              {csmName} isn't taking new bookings right now. Email{" "}
              <a className="underline" href={`mailto:${csmEmail}`}>{csmEmail}</a> and they'll sort a time with you.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-violet-100 bg-white/70 p-3">
                <BookingSlotPicker
                  eventTypeId={ctx.event_type_id}
                  hostUserId={ctx.host_user_id}
                  value={slot}
                  onSelect={setSlot}
                  timezone={tz}
                  timezoneLabel={tz === UK_TZ ? "UK time" : undefined}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Your name</label>
                  <Input
                    className={inputCls}
                    value={name}
                    onChange={(e) => { setTouched(true); setName(e.target.value); }}
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email for the invite</label>
                  <Input
                    className={inputCls}
                    type="email"
                    value={email}
                    onChange={(e) => { setTouched(true); setEmail(e.target.value); }}
                    placeholder="you@company.com"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Mobile for an SMS reminder <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  className={cn(inputCls, "max-w-xs")}
                  value={phone}
                  onChange={(e) => { setTouched(true); setPhone(e.target.value); }}
                  placeholder="+44 ..."
                />
              </div>
              {bookError && <p className="text-sm text-red-500">{bookError}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                  {slot ? `${describeUkSlot(slot)}, UK time` : "Choose a day and time above."}
                </p>
                <Button className={primaryBtn} disabled={!canBook} onClick={book}>
                  {booking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calendar className="h-4 w-4 mr-2" />}
                  Confirm this time
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
