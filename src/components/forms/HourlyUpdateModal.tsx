import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useHourlyFormRequired } from "@/hooks/useHourlyFormRequired";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { getUKDateString, getUKHour } from "@/utils/timezoneUtils";

/**
 * Popup that nudges PIP setters to submit their hourly update.
 * Shows once per (user, date, hour_slot) — dismissal is remembered in localStorage
 * so we don't re-prompt within the same hour, but a fresh prompt appears at the
 * top of every new hour 10..17 UK.
 *
 * Visibility is gated SOLELY on `setters_profiles.status = 'pip'` — no other
 * setter (or non-setter) ever sees this modal.
 */
export function HourlyUpdateModal() {
  const { user } = useAuth();
  const { required: onPIP } = useHourlyFormRequired();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  // Re-evaluate every minute so the modal opens as the hour rolls over.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayUK = getUKDateString();
  const ukHour = getUKHour();
  const inWindow = ukHour >= 10 && ukHour <= 17;

  const { data: todaysUpdates = [] } = useQuery({
    queryKey: ["my-hourly-updates", user?.id, todayUK],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("hourly_updates")
        .select("hour_slot")
        .eq("user_id", user.id)
        .eq("date", todayUK);
      return data || [];
    },
    enabled: !!user && onPIP && inWindow,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!user || !onPIP || !inWindow) return;
    const slot = ukHour;
    const submitted = todaysUpdates.some((u: any) => u.hour_slot === slot);
    if (submitted) return;
    const key = `hourly-popup-${user.id}-${todayUK}-${slot}`;
    if (localStorage.getItem(key)) return;
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, onPIP, inWindow, ukHour, todayUK, todaysUpdates.length, tick]);

  const dismiss = () => {
    if (user) {
      const key = `hourly-popup-${user.id}-${todayUK}-${ukHour}`;
      localStorage.setItem(key, "1");
    }
    setOpen(false);
  };

  const goToForm = () => {
    dismiss();
    navigate("/forms");
  };

  if (!onPIP) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Hourly Update Required</DialogTitle>
              <DialogDescription className="mt-1">
                Submit your {ukHour}:00 update — dials, talk time, and any support you need.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="flex gap-3 pt-2">
          <Button onClick={goToForm} className="flex-1">Complete now</Button>
          <Button variant="outline" onClick={dismiss} className="flex-1">Snooze this hour</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
