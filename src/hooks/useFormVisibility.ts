// Which daily forms this user should see on the Forms page (15 Oct 2026).
// The Dev Centre toggles for Start of day and End of day used to drive only
// the pop-up modals; the Forms page showed both sections to everyone. Now the
// page honours the same two rules the modals do: the form is switched on, and
// the user holds one of its target roles.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type SettingLite = { enabled: boolean | null; target_roles: string[] | null } | null;

export function useFormVisibility() {
  const { user, userRoles } = useAuth();
  const roleKey = userRoles.join(",");
  return useQuery({
    queryKey: ["forms-visibility", user?.id, roleKey],
    queryFn: async () => {
      const [sod, eod] = await Promise.all([
        supabase.from("start_of_day_settings").select("enabled, target_roles").limit(1).maybeSingle(),
        supabase.from("eod_settings").select("enabled, target_roles").limit(1).maybeSingle(),
      ]);
      const on = (s: SettingLite) => !!s?.enabled && (s.target_roles ?? []).some((r) => userRoles.includes(r));
      return { sod: on(sod.data as SettingLite), eod: on(eod.data as SettingLite) };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
