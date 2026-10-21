import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_TZ = "Europe/London";

/** Returns current time in a given IANA timezone as a Date */
export function getCurrentTimeInZone(tz: string = DEFAULT_TZ): Date {
  const now = new Date();
  // Get the parts in the target zone, then re-build a Date
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "00" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
}

/** Returns Date adjusted to UK time (Europe/London) — BST aware */
export function toUKTime(date: Date = new Date()): Date {
  return getCurrentTimeInZoneFrom(date, DEFAULT_TZ);
}

/** Internal: convert any UTC date into wall time of a target tz */
function getCurrentTimeInZoneFrom(date: Date, tz: string): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "00" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
}

/** Convert a UK wall-clock date to a user's local wall-clock date */
export function ukTimeToLocal(ukTime: Date, userTz: string): Date {
  // The ukTime parameter is treated as a UK wall clock; we compute the UTC instant
  // it represents and then re-render in user tz.
  // Simpler approach: derive from "now" — we accept a Date assumed to already be a real timestamp.
  return getCurrentTimeInZoneFrom(ukTime, userTz || DEFAULT_TZ);
}

/** Returns the UK date string YYYY-MM-DD for a given UTC Date */
export function getUKDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Returns the date string YYYY-MM-DD for a given timezone */
export function getDateStringInZone(tz: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Returns current hour (0-23) in a given timezone */
export function getCurrentHourInZone(tz: string = DEFAULT_TZ, date: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz || DEFAULT_TZ,
      hour: "numeric",
      hour12: false,
    }).format(date)
  );
}

/** Returns current UK hour (0-23) */
export function getUKHour(date: Date = new Date()): number {
  return getCurrentHourInZone(DEFAULT_TZ, date);
}

/** Returns current minute (0-59) in a given timezone */
export function getCurrentMinuteInZone(tz: string = DEFAULT_TZ, date: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz || DEFAULT_TZ,
      minute: "numeric",
      hour12: false,
    }).format(date)
  );
}

/** Returns true if "HH:MM" UK time has already passed today */
export function hasUKTimePassed(ukTimeStr: string, _userTz: string = DEFAULT_TZ): boolean {
  const [h, m] = ukTimeStr.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: DEFAULT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const ukH = parseInt(parts.hour === "24" ? "0" : parts.hour);
  const ukM = parseInt(parts.minute);
  return ukH > h || (ukH === h && ukM >= m);
}

/** Format a UTC date as "10:42 AM (your time) / 09:42 AM UK" */
export function formatDualTimestamp(utcDate: Date | string | null, userTz: string): string {
  if (!utcDate) return "—";
  const d = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  if (isNaN(d.getTime())) return "—";
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  const userStr = fmt(userTz || DEFAULT_TZ);
  const ukStr = fmt(DEFAULT_TZ);
  if ((userTz || DEFAULT_TZ) === DEFAULT_TZ) return `${ukStr} UK`;
  // Get short tz label
  const tzLabel = getTzShortLabel(userTz);
  return `${userStr} ${tzLabel} / ${ukStr} UK`;
}

function getTzShortLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value;
    return tzName || tz;
  } catch {
    return tz;
  }
}

/**
 * Convert a UK hour (0-23, e.g. 14 = 2pm UK today) into the equivalent
 * wall-clock hour string in another timezone, formatted as "HH:00".
 * DST aware. Returns "" if conversion fails.
 */
export function formatUKHourInZone(ukHour: number, userTz: string): string {
  if (!userTz || userTz === DEFAULT_TZ) return `${String(ukHour).padStart(2, "0")}:00`;
  try {
    // Build "today YYYY-MM-DD HH:00" in UK time, find the UTC instant it represents,
    // then render it in userTz.
    const ukDateStr = getUKDateString(new Date()); // YYYY-MM-DD in UK
    // Construct a Date assuming the given Y-M-D H:00 is UK local time.
    // Trick: compute the UTC offset of UK at that instant by formatting a probe.
    const [y, m, d] = ukDateStr.split("-").map(Number);
    // Start with a guess at UTC midnight of that date, then add hours.
    const guessUtc = new Date(Date.UTC(y, m - 1, d, ukHour, 0, 0));
    // Find what UK thinks this UTC instant is:
    const ukRendered = new Intl.DateTimeFormat("en-GB", {
      timeZone: DEFAULT_TZ,
      hour: "2-digit",
      hour12: false,
    }).format(guessUtc);
    const ukRenderedHour = parseInt(ukRendered === "24" ? "0" : ukRendered, 10);
    // Adjust by the difference so the UK rendering equals ukHour
    const diff = ukHour - ukRenderedHour;
    const utc = new Date(guessUtc.getTime() + diff * 3600_000);
    const localHour = new Intl.DateTimeFormat("en-GB", {
      timeZone: userTz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(utc);
    return localHour;
  } catch {
    return `${String(ukHour).padStart(2, "0")}:00`;
  }
}

/** Returns short tz abbreviation for a tz, e.g. "PKT", "SAST" */
export function getTimezoneAbbreviation(tz: string): string {
  return getTzShortLabel(tz);
}

/** Hook: returns the logged-in user's timezone (falls back to Europe/London) */
export function useUserTimezone(): string {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["user-timezone", user?.id],
    queryFn: async () => {
      if (!user) return DEFAULT_TZ;
      const { data } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", user.id)
        .maybeSingle();
      return (data?.timezone as string) || DEFAULT_TZ;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 30, // 30 min
  });
  return data || DEFAULT_TZ;
}
