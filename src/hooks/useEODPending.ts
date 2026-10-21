import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getUKDateString, hasUKTimePassed } from "@/utils/timezoneUtils";

export function useEODPending() {
  const { user, userRoles } = useAuth();

  return useQuery({
    queryKey: ["eod-pending", user?.id],
    queryFn: async () => {
      if (!user) return { pending: false };

      const { data: settings } = await supabase
        .from("eod_settings")
        .select("enabled, target_roles, popup_time")
        .limit(1)
        .maybeSingle();

      if (!settings?.enabled) return { pending: false };

      const targetRoles = (settings.target_roles as string[]) || [];
      const hasTargetRole = userRoles.some((r) => targetRoles.includes(r));
      if (!hasTargetRole) return { pending: false };

      const popupTime = (settings.popup_time as string) || "17:15";
      const compactTime = popupTime.slice(0, 5);

      if (!hasUKTimePassed(compactTime)) return { pending: false };

      const ukDate = getUKDateString();
      const { data: existing } = await supabase
        .from("setter_feedback")
        .select("id")
        .eq("setter_id", user.id)
        .eq("date", ukDate)
        .maybeSingle();

      if (existing) return { pending: false };

      const dismissKey = `eod-dismissed-${user.id}-${ukDate}`;
      if (typeof window !== "undefined" && localStorage.getItem(dismissKey)) {
        return { pending: false };
      }

      return { pending: true };
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });
}
