// Client feedback aggregation — the single place that encodes how the
// vacancy / potential-revenue tiles roll up from CSM catch-up capture.
//
// Semantics (product decision, 2026-07-08):
// Both fields are POINT-IN-TIME snapshots — latest completed catch-up's
// value per client, falling back to the imported sheet opening balance.
// - Vacancies: current open roles (a stock; summing would double-count).
// - Potential revenue: the client's running total to date. The CSM types
//   the same cumulative figure the sheet cell always held, so latest-wins
//   preserves the existing data-entry habit and cannot over-count. Per-week
//   deltas stay derivable later as differences between consecutive
//   catch-up snapshots.
// If either semantic ever needs to change, change only the function here.

export interface CatchupFeedbackRow {
  client_profile_id: string;
  status: string | null;
  scheduled_date: string | null;
  completed_at: string | null;
  vacancies_open: number | null;
  potential_revenue_total: number | null;
  opportunities: number | null;
}

export interface OpeningBalanceRow {
  client_profile_id: string;
  vacancies: number | null;
  potential_revenue: number | null;
  opportunities: number | null;
  /** Pre-app meeting history offsets (ruling 4) — absent until migration. */
  opening_booked?: number | null;
  opening_sat?: number | null;
}

const catchupTime = (c: CatchupFeedbackRow): number => {
  const t = Date.parse(c.completed_at ?? c.scheduled_date ?? "");
  return Number.isFinite(t) ? t : 0;
};

const openingFor = (
  clientId: string,
  openings: OpeningBalanceRow[],
): OpeningBalanceRow | undefined =>
  openings.find((o) => o.client_profile_id === clientId);

/** Latest non-null value of one feedback field for one client. */
function latestFieldForClient(
  clientId: string,
  catchups: CatchupFeedbackRow[],
  field: "vacancies_open" | "potential_revenue_total" | "opportunities",
): number | null {
  const reported = catchups
    .filter(
      (c) =>
        c.client_profile_id === clientId &&
        c.status === "completed" &&
        c[field] != null,
    )
    .sort((a, b) => catchupTime(b) - catchupTime(a));
  return reported.length > 0 ? Number(reported[0][field] || 0) : null;
}

/** Latest reported open-vacancy count for one client (point-in-time). */
export function latestVacanciesForClient(
  clientId: string,
  catchups: CatchupFeedbackRow[],
  openings: OpeningBalanceRow[],
): number {
  const latest = latestFieldForClient(clientId, catchups, "vacancies_open");
  if (latest != null) return latest;
  return Number(openingFor(clientId, openings)?.vacancies || 0);
}

/** Latest reported potential-revenue running total for one client. */
export function potentialRevenueForClient(
  clientId: string,
  catchups: CatchupFeedbackRow[],
  openings: OpeningBalanceRow[],
): number {
  const latest = latestFieldForClient(clientId, catchups, "potential_revenue_total");
  if (latest != null) return latest;
  return Number(openingFor(clientId, openings)?.potential_revenue || 0);
}

/** Latest reported open-opportunities count for one client (point-in-time). */
export function latestOpportunitiesForClient(
  clientId: string,
  catchups: CatchupFeedbackRow[],
  openings: OpeningBalanceRow[],
): number {
  const latest = latestFieldForClient(clientId, catchups, "opportunities");
  if (latest != null) return latest;
  return Number(openingFor(clientId, openings)?.opportunities || 0);
}

export function sumVacancies(
  clientIds: string[],
  catchups: CatchupFeedbackRow[],
  openings: OpeningBalanceRow[],
): number {
  return clientIds.reduce(
    (s, id) => s + latestVacanciesForClient(id, catchups, openings),
    0,
  );
}

export function sumPotentialRevenue(
  clientIds: string[],
  catchups: CatchupFeedbackRow[],
  openings: OpeningBalanceRow[],
): number {
  return clientIds.reduce(
    (s, id) => s + potentialRevenueForClient(id, catchups, openings),
    0,
  );
}

/**
 * Transition guard: only report native numbers once native data exists
 * (an imported opening balance, or at least one catch-up carrying feedback).
 * While false, callers keep reading the legacy Google Sheet path — this also
 * makes the frontend safe to deploy before the migration is applied (the new
 * queries fail → empty arrays → guard stays false → sheet path unchanged).
 */
export function hasNativeClientFeedback(
  catchups: CatchupFeedbackRow[],
  openings: OpeningBalanceRow[],
): boolean {
  if (openings.length > 0) return true;
  return catchups.some(
    (c) =>
      c.vacancies_open != null ||
      c.potential_revenue_total != null ||
      c.opportunities != null,
  );
}
