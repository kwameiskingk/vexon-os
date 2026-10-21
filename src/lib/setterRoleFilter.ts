import { supabase } from "@/integrations/supabase/client";

/**
 * Returns only user_ids whose role in user_roles is exactly 'setter'.
 * Excludes csm / ops / dev / sdr_manager / account_executive / admin / finance /
 * ops_assistant — even if those users happen to share a department in
 * setters_profiles for assignment / scheduling purposes.
 */
export async function filterToSetterRoleIds(
  userIds: (string | null | undefined)[],
): Promise<Set<string>> {
  const ids = userIds.filter((u): u is string => !!u);
  if (ids.length === 0) return new Set();
  const { data } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", ids);
  return new Set((data || []).filter((r) => r.role === "setter").map((r) => r.user_id));
}
