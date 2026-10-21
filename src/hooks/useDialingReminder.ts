import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getUKDateString, hasUKTimePassed } from "@/utils/timezoneUtils";
import { toast } from "sonner";

// Follows the Start of day form's on/off and roles (the midday report it used
// to read is retired, 15 Oct 2026).
const REMINDER_TIME = "09:50";

export function useDialingReminder() {
  const { user, userRoles } = useAuth();

  const { data: settings } = useQuery({
    queryKey: ["start-of-day-settings-for-dialing"],
    queryFn: async () => {
      const { data } = await supabase
        .from("start_of_day_settings")
        .select("enabled, target_roles")
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!user || !settings?.enabled) return;
    const targetRoles = (settings.target_roles as string[]) || [];
    if (!userRoles.some((r) => targetRoles.includes(r))) return;

    const check = () => {
      if (!hasUKTimePassed(REMINDER_TIME)) return;
      const ukDate = getUKDateString();
      const key = `dialing-reminder-${user.id}-${ukDate}`;
      if (localStorage.getItem(key)) return;
      toast("🕙 Dialing time in 10 minutes — get ready to make your first call at 10:00 AM!", {
        duration: 8000,
      });
      localStorage.setItem(key, "1");
    };

    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [user, userRoles, settings?.enabled, settings?.target_roles]);
}
