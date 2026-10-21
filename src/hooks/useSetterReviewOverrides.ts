import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lastOfMonth, toISODate } from "@/lib/workWeek";

/**
 * Manual overrides for a setter's monthly Performance Review numbers
 * (Elena's ask, Core Team call 8 Sep 2026: "edit meetings booked / sat").
 *
 * One row per setter per calendar month on setter_review_metric_overrides.
 * A NULL column = no override for that metric (0 is a real override). The
 * override wins ONLY on the Performance Review surface — the compile layer
 * (useSetterReview) bakes it into compiled_metrics so the tiles, show rate,
 * suppositions and the AI narrative all agree, and the team table
 * (useTeamMonthReview) applies the same rows. Leaderboards, the RAG board,
 * the Morning Meeting and CEO tiles keep the computed figures on purpose.
 *
 * Pre-migration the table is missing: every read degrades to "no override"
 * and writes surface a toast, never a broken page (house pattern).
 */

// Escape hatch for tables newer than the generated types (types.ts is stale
// until the owner regenerates it — house pattern, same as useSetterTargets).
const db: SupabaseClient = supabase;

export const REVIEW_OVERRIDES_TABLE = "setter_review_metric_overrides";

export type OverridableReviewMetric = "meetings_booked" | "meetings_sat" | "warm_leads";

export const OVERRIDABLE_REVIEW_METRICS: OverridableReviewMetric[] = [
  "meetings_booked",
  "meetings_sat",
  "warm_leads",
];

export interface ReviewMetricOverrideRow {
  id: string;
  setter_profile_id: string;
  /** First day of the month, ISO date. */
  period_month: string;
  meetings_booked: number | null;
  meetings_sat: number | null;
  warm_leads: number | null;
  reason: string | null;
  set_by: string;
  set_at: string;
}

/** True when [startISO, endISO] is exactly one calendar month. */
export function isCalendarMonthWindow(startISO: string, endISO: string): boolean {
  const start = new Date(`${startISO}T00:00:00`);
  if (Number.isNaN(start.getTime()) || start.getDate() !== 1) return false;
  return toISODate(lastOfMonth(start)) === endISO;
}

/** Batched read: overrides for many setters in one month. Empty on any error. */
export async function fetchReviewOverrides(
  profileIds: string[],
  monthKey: string,
): Promise<Map<string, ReviewMetricOverrideRow>> {
  const map = new Map<string, ReviewMetricOverrideRow>();
  if (!profileIds.length) return map;
  const { data, error } = await db
    .from(REVIEW_OVERRIDES_TABLE)
    .select("id, setter_profile_id, period_month, meetings_booked, meetings_sat, warm_leads, reason, set_by, set_at")
    .in("setter_profile_id", profileIds)
    .eq("period_month", monthKey);
  if (error) return map;
  for (const row of (data || []) as ReviewMetricOverrideRow[]) map.set(row.setter_profile_id, row);
  return map;
}

/** Single-setter read; null when absent or pre-migration. */
export async function fetchReviewOverride(
  profileId: string,
  monthKey: string,
): Promise<ReviewMetricOverrideRow | null> {
  const map = await fetchReviewOverrides([profileId], monthKey);
  return map.get(profileId) ?? null;
}

export const reviewOverrideQueryKey = (profileId: string | undefined, monthKey: string | undefined) =>
  ["review-metric-override", profileId, monthKey] as const;

export function useSetterReviewOverride(profileId: string | undefined, monthKey: string | undefined) {
  return useQuery({
    queryKey: reviewOverrideQueryKey(profileId, monthKey),
    enabled: !!profileId && !!monthKey,
    queryFn: () => fetchReviewOverride(profileId as string, monthKey as string),
  });
}

export interface SaveReviewOverrideInput {
  profileId: string;
  monthKey: string;
  /** null = clear that metric (back to automatic). */
  values: Record<OverridableReviewMetric, number | null>;
  reason: string | null;
  userId: string;
}

/**
 * Upsert the month's row; when every metric is cleared the row is deleted so
 * "no override" stays a missing row rather than a row of NULLs.
 */
export async function saveReviewOverride(input: SaveReviewOverrideInput): Promise<void> {
  const allClear = OVERRIDABLE_REVIEW_METRICS.every((m) => input.values[m] == null);
  if (allClear) {
    const { error } = await db
      .from(REVIEW_OVERRIDES_TABLE)
      .delete()
      .eq("setter_profile_id", input.profileId)
      .eq("period_month", input.monthKey);
    if (error) throw error;
    return;
  }
  const { error } = await db.from(REVIEW_OVERRIDES_TABLE).upsert(
    {
      setter_profile_id: input.profileId,
      period_month: input.monthKey,
      meetings_booked: input.values.meetings_booked,
      meetings_sat: input.values.meetings_sat,
      warm_leads: input.values.warm_leads,
      reason: input.reason,
      set_by: input.userId,
      set_at: new Date().toISOString(),
    },
    { onConflict: "setter_profile_id,period_month" },
  );
  if (error) throw error;
}
