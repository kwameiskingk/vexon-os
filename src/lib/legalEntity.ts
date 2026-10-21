/**
 * Single source of truth for the company's legal identity. Effective
 * Tuesday 15 September 2026, Meridian Sales Partners Ltd (Companies House 00000000,
 * incorporated 22 June 2026) replaces the previous Meridian Sales Partners entity. Anything
 * that names the entity on a legal surface (privacy policy, public
 * bookings home, email footers) reads from here. The Deno twin for edge
 * functions lives at supabase/functions/_shared/legalEntity.ts — keep the
 * two in step by hand; they are separate bundles.
 *
 * Product name (Vexon OS), URLs, slugs and sender addresses are NOT legal
 * identity and do not live here.
 */
export const LEGAL_ENTITY = {
  name: "Meridian Sales Partners Ltd",
  companyNumber: "00000000",
  registeredOffice: "1 Example Street, Example District, London EC1A 1AA",
  country: "United Kingdom",
  incorporatedOn: "2026-06-22",
} as const;

/** The full legal line, e.g. for page footers and email footers. */
export const LEGAL_LINE =
  `${LEGAL_ENTITY.name} · Company no. ${LEGAL_ENTITY.companyNumber} · ` +
  `Registered office: ${LEGAL_ENTITY.registeredOffice}, ${LEGAL_ENTITY.country}`;
