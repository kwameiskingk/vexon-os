// Book a trialist's lead on the client's calendar (16 Oct 2026, the owner).
// Elena (Ops Command > Trialist leads) and Daniel (Appointments > Trialist
// leads) see the times the trialist picked, checked live against the
// client's calendar, plus every other free time; one click books it for
// real through booking-public action book_trial_lead: calendar invite, text,
// email and reminders, and a fulfilment meeting on the client's profile
// credited to no setter. Replaces "push to a setter".

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invokeErrorMessage } from "@/lib/functionsError";
import { TRIAL_LEADS_KEY, type TrialLead } from "@/hooks/useTrialDay";

type Slot = { starts_at: string };

const uk = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", ...o });
const ukLong = (iso: string) => uk(iso, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ukDayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** The trialist's picked times: chosen_times since 16 Oct, else the old {date,time} pairs read as UK time. */
function pickedTimes(lead: TrialLead): string[] {
  if (lead.chosen_times?.length) return lead.chosen_times.map((t) => new Date(t).toISOString());
  return [];
}

export function BookTrialLeadDialog({
  lead, open, onOpenChange, slotsOverride, onBookOverride,
}: {
  lead: TrialLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sandbox: fixture slots and an in-memory booking. */
  slotsOverride?: (lead: TrialLead) => Slot[];
  onBookOverride?: (lead: TrialLead, startsAt: string) => void;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const callback = lead?.location_choice === "phone";

  const { data: slots = [], isLoading, error } = useQuery({
    queryKey: ["book-trial-lead-slots", lead?.id, callback, !!slotsOverride],
    enabled: open && !!lead?.client_profile_id,
    staleTime: 20_000,
    queryFn: async (): Promise<Slot[]> => {
      if (slotsOverride) return slotsOverride(lead!);
      // The same rule the booking itself is checked against (server side).
      const { data, error: fnErr } = await supabase.functions.invoke("booking-public", {
        body: { action: "trial_lead_slots", lead_id: lead!.id },
      });
      const fail = await invokeErrorMessage(fnErr, data);
      if (fail) throw new Error(fail);
      return (data?.slots ?? []) as Slot[];
    },
  });

  const mine = lead ? pickedTimes(lead) : [];
  const free = useMemo(() => new Set(slots.map((s) => s.starts_at)), [slots]);
  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots) {
      const k = ukDayKey(s.starts_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s.starts_at);
    }
    return [...m.entries()];
  }, [slots]);

  const close = () => {
    if (booking) return;
    setPicked(null);
    onOpenChange(false);
  };

  const book = async () => {
    if (!lead || !picked) return;
    setBooking(true);
    try {
      if (onBookOverride) {
        onBookOverride(lead, picked);
      } else {
        const { data, error: fnErr } = await supabase.functions.invoke("booking-public", {
          body: { action: "book_trial_lead", lead_id: lead.id, starts_at: picked },
        });
        const fail = await invokeErrorMessage(fnErr, data);
        if (fail) { toast.error(fail); return; }
        qc.invalidateQueries({ queryKey: TRIAL_LEADS_KEY });
      }
      toast.success(`Booked on ${lead.client?.company_name ?? "the client"}'s calendar for ${ukLong(picked)} (UK). The invite and text are on their way.`);
      setPicked(null);
      onOpenChange(false);
    } finally {
      setBooking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Book it on {lead?.client?.company_name ?? "the client"}'s calendar</DialogTitle>
          <DialogDescription>
            {lead?.company_name} · {lead?.contact_name} · {callback ? "a 15-minute callback" : "a video call"}. This books it for real: calendar invite, text and email.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking the client's calendar…</p>
        ) : error ? (
          <p className="py-4 text-sm text-destructive">{(error as Error).message}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Times the prospect gave (first choice first)</p>
              {mine.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {lead?.proposed_times.length ? `Logged before 16 Oct: ${lead.proposed_times.map((t) => `${t.date} ${t.time}`).join(" · ")}. Pick a free time below.` : "None recorded. Pick a free time below."}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {mine.map((t) => (
                    <Button key={t} type="button" size="sm" variant={picked === t ? "default" : "outline"} disabled={!free.has(t)} onClick={() => setPicked(t)} className="h-8 text-xs">
                      {ukLong(t)}{free.has(t) ? "" : " · taken"}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Or any other free time (UK)</p>
              <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
                {byDay.map(([day, list]) => (
                  <div key={day}>
                    <p className="mb-1 text-xs font-medium">{new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((t) => (
                        <Button key={t} type="button" size="sm" variant={picked === t ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setPicked(t)}>
                          {uk(t, { hour: "2-digit", minute: "2-digit" })}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
                {byDay.length === 0 && <p className="text-sm text-muted-foreground">No free times on the client's calendar right now.</p>}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={booking} onClick={close}>Cancel</Button>
          <Button disabled={!picked || booking} onClick={book}>
            {booking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {picked ? `Book ${ukLong(picked)}` : "Pick a time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
