import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, CheckCircle2, XCircle, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getUKDateString } from "@/utils/timezoneUtils";
import { toast } from "sonner";

const DISMISS_KEY_PREFIX = "confirm-todays-meetings-dismissed-";

/**
 * Acquisition setters only. Pops up once per day with today's meetings and
 * asks two questions per meeting:
 *  1) Has the prospect confirmed they'll attend?  →  meetings.client_confirmed_attendance
 *  2) Has the prospect watched the testimonial video?  →  meetings.prospect_watched_video
 *
 * A row stays in the modal until BOTH have been answered. Both questions can
 * also be answered from the setter's Appointments → "Needs Confirmation" tab —
 * the two surfaces share the same row, so answering in one place removes the
 * obligation in the other.
 */
export function ConfirmTodaysMeetingsModal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const todayUK = getUKDateString();

  // Gate to acquisition setters only.
  const { data: setterProfile } = useQuery({
    queryKey: ["confirm-modal-setter-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("setters_profiles")
        .select("department")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });
  const isAcquisition = setterProfile?.department === "acquisition";

  const { data: meetings = [], refetch } = useQuery({
    queryKey: ["confirm-todays-meetings", user?.id, todayUK],
    enabled: !!user?.id && isAcquisition,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, company_name, prospect_name, prospect_email, meeting_time, status, attendance_status, client_confirmed_attendance, prospect_watched_video")
        .or(`setter_id.eq.${user!.id},logged_by_setter_id.eq.${user!.id}`)
        .eq("meeting_date", todayUK);
      if (error) throw error;
      return (data || []).filter(
        (m: any) =>
          m.status !== "cancelled" &&
          m.attendance_status !== "cancelled" &&
          m.attendance_status !== "rescheduled" &&
          (m.client_confirmed_attendance === null || m.prospect_watched_video === null)
      );
    },
  });

  useEffect(() => {
    if (!meetings.length) {
      setOpen(false);
      return;
    }
    // Keyed on the user too (12 Oct): a shared browser must not dismiss it for everyone.
    if (localStorage.getItem(DISMISS_KEY_PREFIX + todayUK + "-" + user?.id)) return;
    setOpen(true);
  }, [meetings.length, todayUK, user?.id]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY_PREFIX + todayUK + "-" + user?.id, "1");
    setOpen(false);
  };

  const answer = async (
    meetingId: string,
    field: "client_confirmed_attendance" | "prospect_watched_video",
    value: boolean
  ) => {
    const key = `${meetingId}-${field}`;
    setSavingKey(key);
    try {
      const { error } = await supabase
        .from("meetings")
        .update({ [field]: value } as any)
        .eq("id", meetingId);
      if (error) throw error;
      toast.success("Saved");
      await refetch();
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["setter-meetings-data"] });
      qc.invalidateQueries({ queryKey: ["ae-discovery-meetings"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to update meeting");
    } finally {
      setSavingKey(null);
    }
  };

  if (!open || !meetings.length || !isAcquisition) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-primary/10">
              <CalendarClock className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-xl">Confirm today's meetings</DialogTitle>
          </div>
          <DialogDescription>
            You have {meetings.length} meeting{meetings.length === 1 ? "" : "s"} booked for today. For each one, confirm attendance and whether the prospect watched the testimonial video.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {meetings.map((m: any) => (
            <div key={m.id} className="rounded-lg border border-border/50 p-3 space-y-3 bg-muted/20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.company_name}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    {m.prospect_name} · {m.prospect_email}
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0">{m.meeting_time?.slice(0, 5)}</Badge>
              </div>

              {/* Q1 — Attendance */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Has the prospect confirmed they'll attend?
                  </div>
                  {m.client_confirmed_attendance !== null && (
                    <Badge variant={m.client_confirmed_attendance ? "success" : "secondary"} className="text-[10px]">
                      {m.client_confirmed_attendance ? "Yes" : "No"}
                    </Badge>
                  )}
                </div>
                {m.client_confirmed_attendance === null && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1"
                      disabled={savingKey === `${m.id}-client_confirmed_attendance`}
                      onClick={() => answer(m.id, "client_confirmed_attendance", true)}
                    >
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={savingKey === `${m.id}-client_confirmed_attendance`}
                      onClick={() => answer(m.id, "client_confirmed_attendance", false)}
                    >
                      No
                    </Button>
                  </div>
                )}
              </div>

              {/* Q2 — Watched video */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <PlayCircle className="h-3.5 w-3.5" />
                    Has the prospect watched the testimonial video?
                  </div>
                  {m.prospect_watched_video !== null && (
                    <Badge variant={m.prospect_watched_video ? "success" : "secondary"} className="text-[10px]">
                      {m.prospect_watched_video ? "Yes" : "No"}
                    </Badge>
                  )}
                </div>
                {m.prospect_watched_video === null && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1"
                      disabled={savingKey === `${m.id}-prospect_watched_video`}
                      onClick={() => answer(m.id, "prospect_watched_video", true)}
                    >
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={savingKey === `${m.id}-prospect_watched_video`}
                      onClick={() => answer(m.id, "prospect_watched_video", false)}
                    >
                      No
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={dismiss}>Remind me later</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
