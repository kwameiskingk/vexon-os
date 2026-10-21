// Write path for individual_targets — the resolver's layer-2 overrides.
// Editing surfaces: the setter-profile Targets tab (setter-scoped) and the
// Dev Center Targets module (any role). RLS decides who may write:
// admin/dev/ops anywhere, and sdr_manager only within their assignment scope
// (is_sdr_manager_for_setter, proven in the merged RAG build). Rule
// reminders: a row exists only when a human set it, and an explicit 0 means
// "no target for this metric".

import { supabase } from "@/integrations/supabase/client";
import type { TargetMetric, TargetPeriod } from "./resolveTargets";

/** Defaults to the strict setter metric union; generic callers (Dev Center)
 *  pass their own metric names via the type parameter. */
export interface IndividualTargetInput<M extends string = TargetMetric> {
  metric: M;
  period: TargetPeriod;
  value: number;
}

export interface IndividualTargetRow {
  metric: string;
  period: string;
  target_value: number;
  effective_from: string;
}

/** Latest individual override per (metric, period) for one setter. */
export async function fetchIndividualTargetRows(
  subjectProfileId: string,
): Promise<IndividualTargetRow[]> {
  const { data, error } = await supabase
    .from("individual_targets")
    .select("metric, period, target_value, effective_from")
    .eq("subject_profile_id", subjectProfileId)
    .order("effective_from", { ascending: false });
  if (error) return [];
  const seen = new Set<string>();
  const latest: IndividualTargetRow[] = [];
  for (const r of (data as unknown as IndividualTargetRow[]) ?? []) {
    const key = `${r.metric}|${r.period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(r);
  }
  return latest;
}

/** Upsert overrides effective today. Throws on RLS denial — callers surface
 *  the error (never a silent failure). `role` trails with a "setter" default
 *  so pre-existing callers write the identical rows they always have. */
export async function upsertIndividualTargets<M extends string = TargetMetric>(
  subjectProfileId: string,
  targets: IndividualTargetInput<M>[],
  updatedBy: string,
  role: string = "setter",
): Promise<void> {
  if (targets.length === 0) return;
  const today = new Date().toISOString().slice(0, 10);
  const rows = targets.map((t) => ({
    subject_profile_id: subjectProfileId,
    role,
    metric: t.metric,
    period: t.period,
    target_value: t.value,
    effective_from: today,
    updated_by: updatedBy,
  }));
  const { error } = await supabase
    .from("individual_targets")
    .upsert(rows, { onConflict: "subject_profile_id,metric,period,effective_from" });
  if (error) throw error;
}
