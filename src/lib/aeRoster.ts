// Who counts as an Account Executive right now — the ONE answer, shared.
//
// 2 Sep 2026: both real AEs are gone (Oliver exiting, Rory now an
// acquisition setter) and Marcus (admin) works the AE pipeline himself.
// Nine surfaces used to enumerate AEs straight off user_roles and all went
// blank at once, even though every deal/payment row correctly carries
// Marcus's id — the money was in the ledger, the tiles couldn't find a
// person to hang it on. This module is the single roster definition:
// role-holders, minus the offboarded, plus the explicit acting-AE list.
//
// Keep ACTING_AE_USER_IDS a deliberate, tiny allowlist (the
// EXTRA_ASSIGNABLE_USER_IDS precedent in SetterMeetings) — it is an org
// decision, not a role grant. Do NOT "fix" this by giving Marcus a second
// user_roles row: userRole is first-row-wins with no priority order, and the
// AE role would also trip the AE department/workspace lockdowns.

import { supabase } from "@/integrations/supabase/client";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";
import { CEO_USER_ID } from "@/lib/ceo";

/** Users treated as Account Executives without holding the role. */
export const ACTING_AE_USER_IDS: string[] = [CEO_USER_ID];

/**
 * Live AE roster: user ids for everyone currently working the AE pipeline —
 * account_executive role-holders plus the acting allowlist, minus anyone
 * offboarded. Never empty while an acting AE is listed, which is the point.
 */
export async function fetchActiveAeUserIds(): Promise<string[]> {
  const { data: roleRows, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "account_executive");
  if (error) throw error;
  const offboarded = await fetchOffboardedUserIds();
  const ids = new Set<string>((roleRows ?? []).map((r) => r.user_id));
  for (const id of ACTING_AE_USER_IDS) ids.add(id);
  return [...ids].filter((id) => !offboarded.has(id));
}
