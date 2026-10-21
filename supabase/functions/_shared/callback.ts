// Callbacks on client booking pages (16 Oct 2026, the owner; the Northgate Recruitment
// callback brought to Vexon OS). On a client event the phone choice is a
// Callback: the client rings the prospect for 15 minutes, today or on the
// next two working days, always in UK time.
//
// A callback is simply a client-event booking with location_choice "phone".
// No imports and no runtime API: the edge functions and the app (booking
// page, Move appointment) both import this one file.

export const CALLBACK_MINUTES = 15;
export const CALLBACK_TZ = "Europe/London";
/** Today plus the next two working days. */
export const CALLBACK_DAYS = 3;
/** Backup times the setter can record besides the booked one. */
export const CALLBACK_MAX_BACKUPS = 2;
export const CALLBACK_DEFAULT_NOTICE_MINUTES = 30;

/** Client event + phone chosen = a callback. */
export const isCallbackBooking = (
  eventType: { client_id?: string | null } | null | undefined,
  locationChoice: string | null | undefined,
) => !!eventType?.client_id && locationChoice === "phone";

/** "2026-10-16": the UK calendar date of an instant. */
export const londonDate = (at: Date | number | string) =>
  new Date(at).toLocaleDateString("en-CA", { timeZone: CALLBACK_TZ });

/** The UK dates a callback can be booked on: today and the next working days,
 * three in all, weekends skipped (Friday offers Fri, Mon, Tue; Saturday offers
 * Mon, Tue, Wed). Bank holidays are not known here; the client's own calendar
 * and hours decide whether a day has any slots. */
export function callbackDays(now: Date | number = Date.now()): string[] {
  const keys: string[] = [];
  let cursor = new Date(`${londonDate(now)}T12:00:00Z`);
  while (keys.length < CALLBACK_DAYS) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) keys.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return keys;
}

/** "Mon 19 Oct, 14:00": short UK label for a backup time. */
export const backupLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: CALLBACK_TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

/** Notice for an event: its own setting, else 30 minutes, kept within a day. */
export const callbackNoticeMinutes = (eventType: { callback_notice_minutes?: number | null } | null | undefined) => {
  const raw = eventType?.callback_notice_minutes;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), 1440) : CALLBACK_DEFAULT_NOTICE_MINUTES;
};
