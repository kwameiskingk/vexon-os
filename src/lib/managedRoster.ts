// Whose setters does this manager run? — the ONE roster resolution, shared.
//
// Real SDR managers are scoped by sdr_manager_assignments (RLS and the
// auto-assign trigger key off those rows — untouched). Marcus (admin) took
// over both departments on 2 Sep with ZERO assignment rows, so every
// `.eq('manager_user_id', user.id)` roster went silently empty.
//
// Resolution (2 Sep ruling — acting manager runs the WHOLE company):
//   1. Assignment rows exist → exactly those setter profiles (real manager;
//      behaviour byte-identical to before).
//   2. No rows AND the manager holds admin/dev → the full department roster:
//      every active, non-test setters_profiles row across both departments.
//   3. No rows, not admin-tier → empty (unchanged).
//
// Callers keep their own downstream filters (department scoping, active,
// is_test_account, setter-role gate) — this helper only answers "which
// setter_profile ids are mine", the piece that used to come from the
// assignments query.

import { supabase } from "@/integrations/supabase/client";
import { filterToSetterRoleIds } from "@/lib/setterRoleFilter";

/**
 * Setter profile ids managed by `managerUserId`. Drop-in replacement for the
 * `sdr_manager_assignments … eq(manager_user_id)` id fetch.
 */
export async function fetchManagedSetterProfileIds(
  managerUserId: string,
): Promise<string[]> {
  const { data: assignmentRows, error } = await supabase
    .from("sdr_manager_assignments")
    .select("setter_profile_id")
    .eq("manager_user_id", managerUserId);
  if (error) throw error;
  const assigned = (assignmentRows ?? []).map((r) => String(r.setter_profile_id));
  if (assigned.length > 0) return assigned;

  // No assignments — acting-manager path. Check the manager's own roles
  // (reading another user's rows only works for admin sessions, which is
  // exactly who this branch is for; anyone else just gets []).
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", managerUserId)
    .in("role", ["admin", "dev"]);
  if (!roleRows?.length) return [];

  const { data: setterRows } = await supabase
    .from("setters_profiles")
    .select("id, user_id")
    .in("department", ["fulfilment", "acquisition"])
    .eq("active", true)
    .eq("is_test_account", false);
  const rows = (setterRows ?? []).filter((r) => r.user_id);
  // Genuine-setter gate (2 Sep hotfix, spotted in the owner's first live test):
  // Daniel (csm) and Elena (ops) carry leftover ACTIVE setters_profiles rows,
  // so a pure department roster served them into the coaching picker and every
  // other converted surface. Real managers never hit this — assignments are
  // admin-curated — but the department branch must apply the same role gate
  // the strict surfaces (Metrics R8, managerTeamWindow) already do.
  const setterIds = await filterToSetterRoleIds(rows.map((r) => String(r.user_id)));
  return rows
    .filter((r) => setterIds.has(String(r.user_id)))
    .map((r) => String(r.id));
}
