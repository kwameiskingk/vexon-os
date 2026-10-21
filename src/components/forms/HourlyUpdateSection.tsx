import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";
import { getUKDateString, getUKHour } from "@/utils/timezoneUtils";
import { useHourlyFormRequired } from "@/hooks/useHourlyFormRequired";

interface Props {
  onSubmitted?: () => void;
}

/**
 * Hourly Update form for setters who are either on PIP or manually required.
 * Captures dials, talk time, connects, and support needed for the current
 * UK hour slot (10..17). One submission per (user, date, hour_slot).
 */
export function HourlyUpdateSection({ onSubmitted }: Props) {
  const { user } = useAuth();
  const { isPip } = useHourlyFormRequired();
  const queryClient = useQueryClient();
  const [dials, setDials] = useState("");
  const [talkTime, setTalkTime] = useState("");
  const [connects, setConnects] = useState("");
  const [support, setSupport] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const todayUK = getUKDateString();
  const ukHour = getUKHour();
  const inWindow = ukHour >= 10 && ukHour <= 17;
  const slot = ukHour;

  const { data: todaysUpdates = [] } = useQuery({
    queryKey: ["my-hourly-updates", user?.id, todayUK],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("hourly_updates")
        .select("hour_slot, dials_count, talk_time, connects_count, support_needed, submitted_at")
        .eq("user_id", user.id)
        .eq("date", todayUK)
        .order("hour_slot", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  const currentSlotSubmitted = todaysUpdates.some((u: any) => u.hour_slot === slot);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!inWindow) {
      toast.error("Hourly updates are only accepted between 10:00 and 17:00 UK time.");
      return;
    }
    if (currentSlotSubmitted) {
      toast.error("You've already submitted this hour's update.");
      return;
    }
    if (!dials || !talkTime) {
      toast.error("Dials and talk time are required.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("hourly_updates").insert({
      user_id: user.id,
      hour_slot: slot,
      date: todayUK,
      dials_count: parseInt(dials) || 0,
      talk_time: talkTime,
      connects_count: parseInt(connects) || 0,
      support_needed: support.trim() || null,
      submitted_at_uk: new Date().toISOString(),
    } as any);
    setSubmitting(false);
    if (error) {
      toast.error(`Failed to submit: ${error.message}`);
      return;
    }
    toast.success(`Hourly update submitted for ${slot}:00.`);
    setDials(""); setTalkTime(""); setConnects(""); setSupport("");
    queryClient.invalidateQueries({ queryKey: ["my-hourly-updates"] });
    onSubmitted?.();
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {isPip
            ? "You're currently on a Performance Improvement Plan. Submit a brief update every hour between 10:00 and 17:00 UK time."
            : "Hourly updates are required for you today. Submit a brief update every hour between 10:00 and 17:00 UK time."}
        </p>
      </div>

      {!inWindow ? (
        <div className="text-sm text-muted-foreground p-4 rounded-lg border border-border/40 bg-muted/20">
          Outside the hourly update window (10:00–17:00 UK). The form will reopen at the top of
          the next hour.
        </div>
      ) : currentSlotSubmitted ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm font-medium text-green-600 dark:text-green-400">
            {slot}:00 update submitted. Next one is due at {Math.min(slot + 1, 17)}:00.
          </span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <Label className="text-sm font-medium">
              Update for the {slot}:00 hour (UK)
            </Label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Dials *</Label>
              <Input type="number" min="0" value={dials} onChange={(e) => setDials(e.target.value)} placeholder="0" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Talk time *</Label>
              <Input value={talkTime} onChange={(e) => setTalkTime(e.target.value)} placeholder="e.g. 12m" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Connects</Label>
              <Input type="number" min="0" value={connects} onChange={(e) => setConnects(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Support needed (optional)</Label>
            <Textarea
              value={support}
              onChange={(e) => setSupport(e.target.value)}
              placeholder="Anything blocking you, or coaching you'd like from your manager?"
              rows={2}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting} size="sm">
              {submitting ? "Submitting..." : "Submit hourly update"}
            </Button>
          </div>
        </form>
      )}

      {todaysUpdates.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-border/40">
          <Label className="text-xs text-muted-foreground">Today's submissions</Label>
          <div className="flex flex-wrap gap-2">
            {todaysUpdates.map((u: any) => (
              <Badge key={u.hour_slot} variant="outline" className="gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                {u.hour_slot}:00 · {u.dials_count} dials · {u.talk_time}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
