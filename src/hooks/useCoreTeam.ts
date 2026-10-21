import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEPARTMENT_HEADS } from "@/components/ceo/departmentHeadGoals";
import {
  selectCoreTeam,
  type CoreTeamMember,
  type CoreTeamProfile,
  type CoreTeamRoleRow,
} from "@/lib/coreTeam";

export type { CoreTeamMember } from "@/lib/coreTeam";

export const CORE_TEAM_QUERY_KEY = ["core-team"] as const;

/**
 * Active core-team members (leadership roles + listed department heads),
 * sorted by name. The rule lives in src/lib/coreTeam.ts — read it before
 * changing who appears here. Use this for the Projects person filter,
 * contributor pickers and the head-goals pool; useTeamUsers stays the wider
 * "everyone internal" roster for meetings and task assignment.
 */
export function useCoreTeam() {
  return useQuery({
    queryKey: CORE_TEAM_QUERY_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CoreTeamMember[]> => {
      const [rolesRes, profilesRes] = await Promise.all([
        supabase.from("user_roles").select("user_id, role"),
        supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url, offboarded_at")
          .is("offboarded_at" as never, null),
      ]);
      if (rolesRes.error) throw rolesRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const roleRows = (rolesRes.data ?? []).map((r) => ({
        user_id: r.user_id,
        role: String(r.role),
      })) as CoreTeamRoleRow[];
      const profiles = (profilesRes.data ?? []) as unknown as CoreTeamProfile[];

      return selectCoreTeam(
        profiles,
        roleRows,
        DEPARTMENT_HEADS.map((h) => h.userId),
      );
    },
  });
}
