// Candidate source vocabulary — where a Call List entry came from.
//
// Canonical values: 'typeform', 'headhunt', 'commission_only' (11 Sep),
// plus the job-board folders and the retired CV screening agent. CSV imports declare a source per row; the
// import accepts common variants, defaults to 'headhunt' when blank, and
// NEVER rejects a row for an unrecognised source — the value is stored as
// given and flagged instead.
//
// Storage: cv_screenings has no source column (and its ingested_via CHECK
// only allows 'agent'/'sheet_import'), so an imported row carries its source
// in the flags array as 'source:<value>'. At booking the source is copied to
// candidates.source (pending migration 2026-08-17-candidate-source.sql), so
// the pipeline record keeps the origin.

export const KNOWN_SOURCES = [
  "typeform",
  "headhunt",
  "commission_only",
  "linkedin",
  "indeed",
  "screening_tool",
] as const;
export type KnownSource = (typeof KNOWN_SOURCES)[number];

export const DEFAULT_SOURCE: KnownSource = "headhunt";

/** flags-array entry prefix used to persist a CSV row's source. */
export const SOURCE_FLAG_PREFIX = "source:";
/** flags-array marker set when the CSV declared a source we don't recognise. */
export const UNRECOGNISED_SOURCE_FLAG = "unrecognised_source";

// Variant spellings accepted by the CSV import, keyed by what they normalise
// to. Matching happens on a lowercased, trimmed value with spaces/dashes
// collapsed to underscores, so "Screening Tool" and "screening-tool" both hit
// "screening_tool" directly before this table is even consulted.
const SOURCE_VARIANTS: Record<string, KnownSource> = {
  screening_tool: "screening_tool",
  screeningtool: "screening_tool",
  screening: "screening_tool",
  cv_screening: "screening_tool",
  cv_screening_tool: "screening_tool",
  agent: "screening_tool",
  typeform: "typeform",
  type_form: "typeform",
  headhunt: "headhunt",
  headhunting: "headhunt",
  head_hunt: "headhunt",
  headhunted: "headhunt",
  hh: "headhunt",
  commission_only: "commission_only",
  commissiononly: "commission_only",
  commission: "commission_only",
  co: "commission_only",
  linkedin: "linkedin",
  linked_in: "linkedin",
  indeed: "indeed",
};

export interface NormalisedSource {
  /** Canonical value when recognised, otherwise the trimmed value as given. */
  value: string;
  recognised: boolean;
  /** True when the cell was blank and the default was applied. */
  defaulted: boolean;
}

export function normaliseSource(raw: string | null | undefined): NormalisedSource {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { value: DEFAULT_SOURCE, recognised: true, defaulted: true };
  const key = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  const canonical = SOURCE_VARIANTS[key];
  if (canonical) return { value: canonical, recognised: true, defaulted: false };
  return { value: trimmed, recognised: false, defaulted: false };
}

/**
 * The explicit origin of a screening row, or null when we genuinely don't
 * know. Since 1 Sep the agent stamps cv_screenings.source from the Drive
 * folder a CV sits in (LinkedIn / Indeed / Typeform); older CSV imports
 * carried it in flags as 'source:<value>'. The column wins over the flag.
 * (The column isn't in generated types yet — read via a soft cast.)
 */
export function explicitSourceOf(screening: {
  flags?: string[] | null;
  source?: string | null;
}): string | null {
  const col = (screening as { source?: string | null }).source;
  if (typeof col === "string" && col.trim() !== "") return col.trim().toLowerCase();
  const flagged = (screening.flags ?? []).find((f) => f.startsWith(SOURCE_FLAG_PREFIX));
  if (flagged) return flagged.slice(SOURCE_FLAG_PREFIX.length);
  return null;
}

/**
 * The source a screening row carries, for copying to candidates.source at
 * booking. Falls back to 'screening_tool' when nothing explicit is recorded
 * (agent-produced rows predating source labelling).
 */
export function sourceOfScreening(screening: {
  flags?: string[] | null;
  ingested_via?: string | null;
}): string {
  return explicitSourceOf(screening) ?? "screening_tool";
}

/**
 * CSV-imported rows carry a source flag; agent-screened rows never do. Used
 * to pick the compact candidate modal (no empty AI-output pane) for imports.
 */
export function isCsvImported(screening: { flags?: string[] | null }): boolean {
  return (screening.flags ?? []).some((f) => f.startsWith(SOURCE_FLAG_PREFIX));
}

const SOURCE_LABELS: Record<string, string> = {
  screening_tool: "Screening tool",
  typeform: "Typeform",
  headhunt: "Headhunt",
  commission_only: "Commission only",
  linkedin: "LinkedIn",
  indeed: "Indeed",
};

export const sourceLabel = (value: string): string => SOURCE_LABELS[value] ?? value;
