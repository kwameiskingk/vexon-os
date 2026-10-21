import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CalendarX2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tzDisplay } from "@/lib/timezoneLabels";

/**
 * Live availability picker for the booking platform (Batch 2).
 * Slots come from the booking-availability edge function (weekly rules minus
 * Google busy times minus existing bookings). Times are shown in UK time —
 * the business clock the meetings table runs on.
 */

const BUSINESS_TZ = "Europe/London";

/** UTC instant → {date, time} wall-clock strings in the given zone. */
export function utcToZoneParts(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso)).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
  };
}

/** UTC instant → {date, time} wall-clock strings in UK time, matching the
 * meetings.meeting_date / meeting_time format. */
export function utcToLondonParts(iso: string): { date: string; time: string } {
  return utcToZoneParts(iso, BUSINESS_TZ);
}

export type BookingSlot = { starts_at: string; ends_at: string };
type Slot = BookingSlot;

export function BookingSlotPicker({
  eventTypeId, hostUserId, value, onSelect, demoSlots, timezone, timezoneLabel, horizonDays,
}: {
  eventTypeId: string;
  hostUserId: string;
  value: string | null;
  onSelect: (startsAt: string | null) => void;
  /** Demo surfaces (acting-as SDR, 3 Sep): render these slots instead of
   * calling booking-availability. No Supabase call is made when set. */
  demoSlots?: Slot[];
  /** Zone the times are shown in. Pass the event's lock_timezone when it has
   * one so a locked event reads the same in every browser; defaults to UK
   * time, the business clock. */
  timezone?: string;
  /** Override for the "Times shown in ..." wording (e.g. "UK time" on
   * client-facing surfaces). Defaults to the zone's proper label. */
  timezoneLabel?: string;
  /** How many days ahead to offer (default two weeks). Pass the event's
   * booking_horizon_days for events that book further out. */
  horizonDays?: number;
}) {
  const [dayKey, setDayKey] = useState<string | null>(null);
  const tz = timezone || BUSINESS_TZ;
  const toParts = (iso: string) => utcToZoneParts(iso, tz);

  const liveQuery = useQuery({
    queryKey: ["booking-availability", eventTypeId, hostUserId, horizonDays ?? 14],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("booking-availability", {
        body: { event_type_id: eventTypeId, host_user_id: hostUserId, days: horizonDays ?? 14 },
      });
      if (error) throw new Error(error.message || "Could not load availability");
      if (data?.error) throw new Error(data.error);
      return data as { slots: Slot[]; calendar_checked: boolean };
    },
    staleTime: 30_000,
    retry: 1,
    enabled: !demoSlots,
  });
  const data: { slots: Slot[]; calendar_checked: boolean } | undefined = demoSlots
    ? { slots: demoSlots, calendar_checked: true }
    : liveQuery.data;
  const isLoading = demoSlots ? false : liveQuery.isLoading;
  const error = demoSlots ? null : liveQuery.error;
  const isFetching = demoSlots ? false : liveQuery.isFetching;
  const refetch = liveQuery.refetch;

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of data?.slots || []) {
      const k = utcToZoneParts(s.starts_at, tz).date;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [data, tz]);

  const days = [...byDay.keys()];
  const activeDay = dayKey && byDay.has(dayKey) ? dayKey : days[0] || null;
  const daySlots = activeDay ? byDay.get(activeDay)! : [];
  const morning = daySlots.filter((s) => Number(toParts(s.starts_at).time.slice(0, 2)) < 12);
  const afternoon = daySlots.filter((s) => Number(toParts(s.starts_at).time.slice(0, 2)) >= 12);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center border border-border rounded-lg">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking live availability…
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-border rounded-lg p-4 text-center space-y-2">
        <p className="text-sm text-destructive">{(error as Error).message}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Try again
        </Button>
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div className="border border-border rounded-lg p-4 text-center space-y-1">
        <CalendarX2 className="h-5 w-5 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No open times in the next two weeks — check this host's availability in the Dev Center.
        </p>
      </div>
    );
  }

  const dayLabel = (k: string) => {
    const d = new Date(`${k}T12:00:00`);
    return {
      dow: d.toLocaleDateString("en-GB", { weekday: "short" }),
      dom: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    };
  };
  const timeLabel = (s: Slot) => toParts(s.starts_at).time;

  const SlotGroup = ({ label, slots }: { label: string; slots: Slot[] }) =>
    slots.length === 0 ? null : (
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {slots.map((s) => {
            const selected = value === s.starts_at;
            return (
              <button
                key={s.starts_at}
                type="button"
                onClick={() => onSelect(selected ? null : s.starts_at)}
                className={
                  selected
                    ? "rounded-full border border-primary bg-primary text-primary-foreground text-sm py-1.5 font-semibold shadow-purple-glow"
                    : "rounded-full border border-border text-sm py-1.5 hover:border-primary hover:text-primary transition-colors"
                }
              >
                {timeLabel(s)}
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    // min-w-0/max-w-full: inside CSS-grid parents (shadcn DialogContent) the
    // day strip otherwise forces the intrinsic width and bursts the dialog.
    <div className="border border-border rounded-lg p-3 space-y-3 w-full min-w-0 max-w-full overflow-hidden">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Times shown in {timezoneLabel || tzDisplay(tz)}{isFetching ? " · refreshing…" : ""}
        </p>
        {!data?.calendar_checked && (
          <span className="text-[10px] rounded-full bg-amber-500/15 text-amber-500 px-2 py-0.5">
            Google Calendar not connected — working hours only
          </span>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 w-full max-w-full">
        {days.map((k) => {
          const l = dayLabel(k);
          const active = k === activeDay;
          return (
            <button
              key={k}
              type="button"
              onClick={() => { setDayKey(k); onSelect(null); }}
              className={
                active
                  ? "shrink-0 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-center"
                  : "shrink-0 rounded-lg border border-border px-3 py-1.5 text-center hover:border-primary transition-colors"
              }
            >
              <span className="block text-[10px] uppercase tracking-wide opacity-80">{l.dow}</span>
              <span className="block text-xs font-semibold">{l.dom}</span>
            </button>
          );
        })}
      </div>
      {/* Bounded + scrollable: with short events (10-minute LCTs) a day can hold
          50 slots, and this picker often sits in a fixed footer (candidate modal)
          that cannot grow. The list scrolls inside its own box instead of being
          clipped (Elena, 4 Sep). */}
      <div className="max-h-56 overflow-y-auto overscroll-contain pr-1 space-y-3">
        <SlotGroup label="Morning" slots={morning} />
        <SlotGroup label="Afternoon" slots={afternoon} />
      </div>
    </div>
  );
}
