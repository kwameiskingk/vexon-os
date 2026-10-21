export type HealthStatus = "green" | "amber" | "red" | null;

/** Metrics that accept a manual override (client_health_metric_overrides). */
export type OverridableMetric =
  | "meetings_booked"
  | "meetings_sat"
  | "revenue"
  | "opportunities"
  | "vacancies"
  | "days_remaining";

export interface MetricOverrideInfo {
  value: number;
  /** true = health band/rationale recompute from this value; false = display only. */
  affectsHealth: boolean;
  setBy: string | null;
  setAt: string | null;
}

/** The pre-override values, kept so tooltips/inputs can show "Computed: X". */
export interface ComputedMetricValues {
  meetingsBooked: number | null;
  meetingsSat: number | null;
  showUpRate: number | null;
  revenueGenerated: number | null;
  opportunities: number | null;
  vacancies: number | null;
  daysRemaining: number | null;
}

export interface ClientHealthSnapshotRow {
  clientName: string;
  status: string | null;
  campaignEndDate: string | null;
  daysRemaining: number | null;
  revenueGenerated: number | null;
  opportunities: number | null;
  vacancies: number | null;
  meetingsBooked: number | null;
  meetingsSat: number | null;
  showUpRate: number | null; // fraction 0-1
  avgMeetingQuality: number | null; // 1-5
  qualityMeetings: number | null;
  healthStatus: HealthStatus;
  notes: string | null;
  matched: boolean;
  clientProfileId: string | null;
  /** Manual metric overrides in force for this client (display values above
      already have them applied). Absent on the sheet-sourced parity rows. */
  overrides?: Partial<Record<OverridableMetric, MetricOverrideInfo>>;
  /** Pre-override computed values (absent on sheet-sourced parity rows). */
  computed?: ComputedMetricValues;
}

export interface ClientHealthSnapshotResponse {
  rows: ClientHealthSnapshotRow[];
  fetchedAt: string;
  sheetName: string;
}

export const formatPercent = (v: number | null) =>
  v === null ? "—" : `${Math.round(v * 100)}%`;

export const formatCurrency = (v: number | null) => {
  if (v === null) return "—";
  if (Math.abs(v) >= 1000) {
    return `£${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  }
  return `£${Math.round(v).toLocaleString()}`;
};

export const formatNumber = (v: number | null) =>
  v === null ? "—" : v.toLocaleString();

export const formatScore = (v: number | null) =>
  v === null ? "—" : v.toFixed(2);

export const healthRank = (s: HealthStatus): number => {
  if (s === "red") return 0;
  if (s === "amber") return 1;
  if (s === "green") return 2;
  return 3;
};

export const sortSnapshot = (rows: ClientHealthSnapshotRow[]) =>
  [...rows].sort((a, b) => {
    const r = healthRank(a.healthStatus) - healthRank(b.healthStatus);
    if (r !== 0) return r;
    const ad = a.daysRemaining ?? Number.POSITIVE_INFINITY;
    const bd = b.daysRemaining ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });
