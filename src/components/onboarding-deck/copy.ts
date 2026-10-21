// Copy helpers shared by the decks (7 Sep).
//
// pastTenseLabel: the finish card and Elena's tracking sheet list what has
// been DONE, so a finished card reads in the past tense (Marcus, 4 Sep).
// Every seeded card carries an explicit done label (SDR: done_label column;
// client: config.done_label); this heuristic only covers cards authored in
// the builders without one. It reorders "Verb your thing" into "Thing
// verbed" for the verbs the flows use and leaves anything else untouched
// rather than mangling it.

const VERBS: Array<[RegExp, string]> = [
  [/^set up\b/i, "set up"],
  [/^sign in(?: to| into)?\b/i, "signed in to"],
  [/^sign into\b/i, "signed in to"],
  [/^log in(?: to| into)?\b/i, "logged in to"],
  [/^go through\b/i, "gone through"],
  [/^get set up on\b/i, "set up on"],
  [/^confirm\b/i, "confirmed"],
  [/^create\b/i, "created"],
  [/^order\b/i, "ordered"],
  [/^read\b/i, "read"],
  [/^book\b/i, "booked"],
  [/^connect\b/i, "connected"],
  [/^run\b/i, "run"],
  [/^accept\b/i, "accepted"],
  [/^attend\b/i, "attended"],
  [/^upload\b/i, "uploaded"],
  [/^complete\b/i, "completed"],
  [/^install\b/i, "installed"],
  [/^update\b/i, "updated"],
  [/^optimise\b/i, "optimised"],
  [/^review\b/i, "reviewed"],
  [/^submit\b/i, "submitted"],
  [/^share\b/i, "shared"],
  [/^provide\b/i, "provided"],
  [/^take\b/i, "taken"],
  [/^pass\b/i, "passed"],
];

const LEADING_DETERMINERS = /^(all of your|all your|all the|all|your|the|a|an|our)\s+/i;

const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function pastTenseLabel(label: string, explicit?: string | null): string {
  const done = explicit?.trim();
  if (done) return done;
  const text = label.trim();
  if (!text) return text;

  // "Watch: our call script" → "Watched: our call script"
  const watchColon = text.match(/^watch:\s*(.+)$/i);
  if (watchColon) return `Watched: ${watchColon[1]}`;
  if (/^watch\b/i.test(text)) {
    const rest = text.replace(/^watch\s+/i, "").replace(LEADING_DETERMINERS, "");
    return `${capitalise(rest)} watched`;
  }

  for (const [verb, participle] of VERBS) {
    if (!verb.test(text)) continue;
    const rest = text.replace(verb, "").trim().replace(LEADING_DETERMINERS, "").trim();
    if (!rest) return capitalise(participle);
    return `${capitalise(rest)} ${participle}`;
  }
  return text;
}

/** Splits a link field that may hold several URLs (one per line or space-separated). */
export function splitLinks(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\n\r\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
}

/** A human label for a way-in link, from its domain. */
export function linkLabel(url: string): string {
  if (/banner/i.test(url)) return "Download the banner";
  if (/amazon\.co\.uk|amzn\.eu/i.test(url)) return "Order on Amazon UK";
  if (/amazon\.co\.za/i.test(url)) return "Order on Amazon South Africa";
  if (/amazon\./i.test(url)) return "Order on Amazon";
  if (/takealot\./i.test(url)) return "Order on Takealot";
  if (/speedtest/i.test(url)) return "Open the speed test";
  if (/calendar\.google/i.test(url)) return "Open Google Calendar";
  if (/linkedin\./i.test(url)) return "Open LinkedIn";
  if (/close\.com/i.test(url)) return "Open Close";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return `Open ${host}`;
  } catch {
    return "Open link";
  }
}
