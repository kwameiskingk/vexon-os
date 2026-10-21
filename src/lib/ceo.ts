/**
 * CEO department helpers.
 *
 * The CEO department is a private workspace only Marcus can access.
 * Every gate (sidebar visibility, page redirect, etc.) checks against
 * this single hard-coded auth.uid().
 */
export const CEO_USER_ID = 'a59995b2-0ecd-4aa0-8698-a8399d4423dd';

/**
 * Legacy id-based check. Prefer `useCanViewCEO()` for capability-based access.
 * Kept for backwards-compatibility with call sites that only have a user id.
 */
export const isCEOUser = (userId?: string | null) =>
  !!userId && userId === CEO_USER_ID;

/**
 * CEO dashboard live-data floor — PERMANENT per CLAUDE.md, never move it.
 * Windows ending before this render as empty ("Historical"), never
 * backfilled: acquisition backfill data still holds June rows that would
 * double-count against live tables if any backfill merge is ever revived
 * with a later cutover. This is the single source of truth — the snapshot
 * hook imports it; do not reintroduce a private copy.
 */
export const CEO_BACKFILL_CUTOVER_ISO = '2026-06-01';
export const CEO_BACKFILL_CUTOVER = new Date(`${CEO_BACKFILL_CUTOVER_ISO}T00:00:00`);

export const isHistoricalWindow = (window?: { end: Date } | null) =>
  !!window && window.end.getTime() < CEO_BACKFILL_CUTOVER.getTime();
