import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";

export interface TeamUser {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
}

/**
 * All internal team members (anyone with a non-client role) with their primary role.
 */
export const useTeamUsers = () => {
  return useQuery({
    queryKey: ["team-users-with-roles"],
    queryFn: async () => {
      const { data: roleRows, error: rerr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rerr) throw rerr;

      // Former employees drop off every live picker (their history is retained).
      const offboarded = await fetchOffboardedUserIds();
      const internal = (roleRows || []).filter(
        (r) => r.role !== "client" && !offboarded.has(r.user_id)
      );
      const ids = Array.from(new Set(internal.map((r) => r.user_id)));
      if (ids.length === 0) return [] as TeamUser[];

      const roleByUser = new Map<string, string>();
      internal.forEach((r) => {
        if (!roleByUser.has(r.user_id)) roleByUser.set(r.user_id, r.role);
      });

      const { data: profs, error: perr } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      if (perr) throw perr;

      return (profs || [])
        .map((p) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          role: roleByUser.get(p.id) || null,
        }))
        .sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""));
    },
  });
};
