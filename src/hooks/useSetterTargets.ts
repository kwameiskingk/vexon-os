import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Per-setter targets — single source of truth is the setter_targets table
 * (RLS: admin/dev write, staff read). The legacy target columns on
 * setters_profiles are DEPRECATED; this module is the only sanctioned way
 * to read or write targets, and it degrades to the legacy columns until
 * the setter_targets migration is applied.
 */

export interface SetterTargets {
  daily_dials_target: number;
  daily_meetings_target: number;
  daily_talk_time_target: number;
  weekly_meetings_target: number;
}

/** Nullable shape for departments with no seeded defaults — null means "no
 *  target set", rendered as such, never substituted with another
 *  department's number. */
export interface SetterTargetDefaults {
  daily_dials_target: number | null;
  daily_meetings_target: number | null;
  daily_talk_time_target: number | null;
  weekly_meetings_target: number | null;
}

/**
 * Department-keyed defaults. The historical 150/2/90/6 numbers are
 * fulfilment-shaped; acquisition deliberately ships with NO defaults
 * (nulls) — acquisition targets are set per-setter via individual_targets,
 * and surfaces show "no target set" until they are.
 */
export const TARGET_DEFAULTS: {
  fulfilment: SetterTargets;
  acquisition: SetterTargetDefaults;
} = {
  fulfilment: {
    daily_dials_target: 150,
    daily_meetings_target: 2,
    daily_talk_time_target: 90,
    weekly_meetings_target: 6,
  },
  acquisition: {
    daily_dials_target: null,
    daily_meetings_target: null,
    daily_talk_time_target: null,
    weekly_meetings_target: null,
  },
};

const rowToTargets = (r: Partial<SetterTargets> | null | undefined): SetterTargets => ({
  daily_dials_target: Number(r?.daily_dials_target ?? TARGET_DEFAULTS.fulfilment.daily_dials_target),
  daily_meetings_target: Number(r?.daily_meetings_target ?? TARGET_DEFAULTS.fulfilment.daily_meetings_target),
  daily_talk_time_target: Number(r?.daily_talk_time_target ?? TARGET_DEFAULTS.fulfilment.daily_talk_time_target),
  weekly_meetings_target: Number(r?.weekly_meetings_target ?? TARGET_DEFAULTS.fulfilment.weekly_meetings_target),
});

/**
 * Fetch targets for many setters at once (keyed by setter_profile_id).
 * Pre-migration (setter_targets missing) it falls back to the legacy
 * columns so nothing breaks; missing rows resolve to TARGET_DEFAULTS.
 */
export async function fetchSetterTargetsMap(
  setterProfileIds: string[],
): Promise<Map<string, SetterTargets>> {
  const map = new Map<string, SetterTargets>();
  if (setterProfileIds.length === 0) return map;

  const { data, error } = await (supabase as any)
    .from("setter_targets")
    .select(
      "setter_profile_id, daily_dials_target, daily_meetings_target, daily_talk_time_target, weekly_meetings_target",
    )
    .in("setter_profile_id", setterProfileIds);

  if (!error) {
    for (const r of (data ?? []) as any[]) {
      map.set(String(r.setter_profile_id), rowToTargets(r));
    }
    return map;
  }

  // Legacy fallback (setter_targets migration not applied yet)
  const { data: legacy } = await supabase
    .from("setters_profiles")
    .select(
      "id, daily_dials_target, daily_meetings_target, daily_talk_time_target, weekly_meetings_target" as "id",
    )
    .in("id", setterProfileIds);
  for (const r of ((legacy ?? []) as any[])) {
    map.set(String(r.id), rowToTargets(r));
  }
  return map;
}

export async function fetchSetterTargets(setterProfileId: string): Promise<SetterTargets> {
  const map = await fetchSetterTargetsMap([setterProfileId]);
  // Fulfilment defaults on a missing row — every caller of this function is a
  // fulfilment-shaped surface; acquisition callers read TARGET_DEFAULTS
  // .acquisition (nulls) explicitly instead.
  return map.get(setterProfileId) ?? TARGET_DEFAULTS.fulfilment;
}

export function useSetterTargets(setterProfileId: string | null | undefined) {
  return useQuery({
    queryKey: ["setter-targets", setterProfileId],
    enabled: !!setterProfileId,
    queryFn: () => fetchSetterTargets(setterProfileId as string),
  });
}

/**
 * Write targets. RLS restricts this to admin/dev — callers should also
 * gate the UI (canEditSetterTargets) so read-only roles never see a
 * failing save button.
 */
export async function upsertSetterTargets(
  setterProfileId: string,
  targets: SetterTargets,
  updatedBy?: string | null,
) {
  const { error } = await (supabase as any).from("setter_targets").upsert(
    {
      setter_profile_id: setterProfileId,
      ...targets,
      updated_by: updatedBy ?? null,
    },
    { onConflict: "setter_profile_id" },
  );
  if (error) throw error;
}

/** Targets are set by the CEO (admin) and dev only. */
export const canEditSetterTargets = (userRoles: string[] | null | undefined): boolean =>
  !!userRoles?.some((r) => r === "admin" || r === "dev");
