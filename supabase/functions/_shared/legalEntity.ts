// Deno twin of src/lib/legalEntity.ts (edge functions are a separate bundle
// and cannot import from src/). Keep the two in step by hand.
//
// Effective Tuesday 15 September 2026, Meridian Sales Partners Ltd (Companies House 00000000,
// incorporated 22 June 2026) replaces the previous Meridian Sales Partners entity. Every
// customer-facing email footer reads its legal line from here.
export const LEGAL_ENTITY = {
  name: "Meridian Sales Partners Ltd",
  companyNumber: "00000000",
  registeredOffice: "1 Example Street, Example District, London EC1A 1AA",
  country: "United Kingdom",
  incorporatedOn: "2026-06-22",
} as const;

/** The full legal line, e.g. for email footers. */
export const LEGAL_LINE =
  `${LEGAL_ENTITY.name} · Company no. ${LEGAL_ENTITY.companyNumber} · ` +
  `Registered office: ${LEGAL_ENTITY.registeredOffice}, ${LEGAL_ENTITY.country}`;
