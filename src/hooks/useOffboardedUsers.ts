import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Former-employee visibility, in one place.
 *
 * `profiles.offboarded_at` is the platform-wide former-employee flag: NULL means
 * a current employee, a timestamp means they have left (and doubles as the
 * leaving date). Nothing is ever deleted — every meeting, stat and contribution
 * is retained; these helpers only decide who still shows up on *live* rosters,
 * pickers, leaderboards and metric surfaces.
 *
 * Generalises the exclusion-set pattern already used by
 * `src/components/attendance/attendanceRoster.ts`.
 *
 * NOTE: `src/integrations/supabase/types.ts` is generated and is stale until it
 * is regenerated after the `offboarded_at` migration, hence the local casts.
 */

const OFFBOARDED_USERS_QUERY_KEY = ["offboarded-users"] as const;
const OFFBOARDED_STALE_TIME = 5 * 60_000; // 5 minutes — this list changes rarely

export interface OffboardedProfile {
  id: string;
  full_name: string | null;
  /** ISO timestamp — when they left. */
  offboarded_at: string;
}

/** Map of user id -> ISO timestamp of when they were offboarded. */
export type OffboardedUserMap = Map<string, string>;

/** One query behind every helper here: the (small) set of people who have left. */
async function fetchOffboardedProfiles(): Promise<OffboardedProfile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, offboarded_at")
    .not("offboarded_at" as never, "is", null);
  if (error) throw error;
  return (data ?? []) as unknown as OffboardedProfile[];
}

const toMap = (rows: OffboardedProfile[]): OffboardedUserMap =>
  new Map(rows.map((r) => [r.id, r.offboarded_at]));

/**
 * Every user flagged as a former employee, with their leaving date.
 * Used by surfaces that need to *label* leavers (Former filters, status columns).
 */
export async function fetchOffboardedUserMap(): Promise<OffboardedUserMap> {
  return toMap(await fetchOffboardedProfiles());
}

/**
 * The ids of everyone who has left. Filter any list of user ids with
 * `ids.filter((id) => !offboarded.has(id))` to hide leavers from a live surface.
 */
export async function fetchOffboardedUserIds(): Promise<Set<string>> {
  return new Set((await fetchOffboardedProfiles()).map((r) => r.id));
}

/** Component-level access to the offboarded id set. */
export function useOffboardedUserIds() {
  return useQuery({
    queryKey: OFFBOARDED_USERS_QUERY_KEY,
    queryFn: fetchOffboardedProfiles,
    staleTime: OFFBOARDED_STALE_TIME,
    select: (rows: OffboardedProfile[]) => new Set(rows.map((r) => r.id)),
  });
}

/** Component-level access to the offboarded id -> leaving date map. */
export function useOffboardedUserMap() {
  return useQuery({
    queryKey: OFFBOARDED_USERS_QUERY_KEY,
    queryFn: fetchOffboardedProfiles,
    staleTime: OFFBOARDED_STALE_TIME,
    select: toMap,
  });
}

/**
 * Name-keyed leaver test, for the handful of legacy pickers that store display
 * names rather than user ids (the CEO historical filters). Matches a full name
 * exactly, or a first-name-only option against the leaver's first name.
 */
export function useIsFormerByName(): (name: string) => boolean {
  const { data: names } = useQuery({
    queryKey: OFFBOARDED_USERS_QUERY_KEY,
    queryFn: fetchOffboardedProfiles,
    staleTime: OFFBOARDED_STALE_TIME,
    select: (rows: OffboardedProfile[]) =>
      rows.map((r) => (r.full_name ?? "").trim().toLowerCase()).filter(Boolean),
  });

  return (name: string) => {
    const needle = (name ?? "").trim().toLowerCase();
    if (!needle || !names?.length) return false;
    return names.some((full) => full === needle || full.startsWith(`${needle} `));
  };
}
