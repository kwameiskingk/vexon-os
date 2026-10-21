/** Calendly-style timezone labels (Marcus 21 Aug, the owner 24 Aug): show the
 * proper zone name — "London (BST, UTC+1)", "Johannesburg (SAST, UTC+2)",
 * "UTC" — instead of vague "UK time". Abbreviations come from the browser's
 * Intl data, trying en-GB then en-US (each locale knows different zones);
 * zones neither can abbreviate use the override map or their UTC offset. */

const tzPart = (zone: string, style: "short" | "shortOffset", locale = "en-GB"): string => {
  try {
    return (
      new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: style })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value || ""
    );
  } catch {
    return "";
  }
};

// Zones English locale data can't abbreviate but our users know by name.
// Only zones WITHOUT daylight saving may be hardcoded here.
const ABBR_OVERRIDES: Record<string, string> = {
  "Africa/Johannesburg": "SAST",
  "Asia/Dubai": "GST",
};

const isOffsetStyle = (s: string) => !s || /^(GMT|UTC)/.test(s);

const bestAbbr = (zone: string): string | null => {
  for (const locale of ["en-GB", "en-US"]) {
    const abbr = tzPart(zone, "short", locale);
    if (!isOffsetStyle(abbr)) return abbr;
  }
  return ABBR_OVERRIDES[zone] || null;
};

/** Compact form for buttons and confirmations: "BST", "SAST", or "UTC+2". */
export function tzShort(zone: string): string {
  if (zone === "UTC") return "UTC";
  const abbr = bestAbbr(zone);
  if (abbr) return abbr;
  return tzPart(zone, "shortOffset").replace("GMT", "UTC") || zone;
}

/** Full form for selectors and info rows: "London (BST, UTC+1)". */
export function tzDisplay(zone: string): string {
  if (zone === "UTC") return "UTC";
  const city = (zone.split("/").pop() || zone).replace(/_/g, " ");
  const offset = tzPart(zone, "shortOffset").replace("GMT", "UTC");
  const abbr = bestAbbr(zone);
  return abbr ? `${city} (${abbr}, ${offset})` : `${city} (${offset})`;
}
