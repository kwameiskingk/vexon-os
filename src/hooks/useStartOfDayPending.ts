import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getUKDateString, hasUKTimePassed } from "@/utils/timezoneUtils";

export function useStartOfDayPending() {
  const { user, userRoles } = useAuth();

  return useQuery({
    queryKey: ["start-of-day-pending", user?.id],
    queryFn: async () => {
      if (!user) return { pending: false };

      const { data: settings } = await supabase
        .from("start_of_day_settings")
        .select("enabled, target_roles, popup_time")
        .limit(1)
        .maybeSingle();

      if (!settings?.enabled) return { pending: false };

      const targetRoles = (settings.target_roles as string[]) || [];
      const hasTargetRole = userRoles.some((r) => targetRoles.includes(r));
      if (!hasTargetRole) return { pending: false };

      const popupTime = (settings.popup_time as string) || "09:30";
      // popup_time is stored as "HH:MM:SS" — strip seconds for compare
      const compactTime = popupTime.slice(0, 5);

      if (!hasUKTimePassed(compactTime)) return { pending: false };

      const ukDate = getUKDateString();
      const { data: existing } = await supabase
        .from("start_of_day_submissions")
        .select("id, missed")
        .eq("user_id", user.id)
        .eq("date", ukDate)
        .maybeSingle();

      // If there's any submission row (real or marked-missed), don't re-prompt
      if (existing) return { pending: false };

      // Local localStorage gate — once dismissed, don't re-open today
      const dismissKey = `sod-dismissed-${user.id}-${ukDate}`;
      if (typeof window !== "undefined" && localStorage.getItem(dismissKey)) {
        return { pending: false };
      }

      return { pending: true };
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });
}
