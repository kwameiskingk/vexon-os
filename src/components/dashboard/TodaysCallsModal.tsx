import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, Phone, Clock, Building2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

interface ScheduledCall {
  id: string;
  company_name: string;
  time: string;
  type: "discovery" | "followup";
  client_name?: string;
  email?: string;
}

interface TodaysCallsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TodaysCallsModal({ open, onOpenChange }: TodaysCallsModalProps) {
  const [discoveryCalls, setDiscoveryCalls] = useState<ScheduledCall[]>([]);
  const [followupCalls, setFollowupCalls] = useState<ScheduledCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      loadTodaysCalls();
    }
  }, [open]);

  const loadTodaysCalls = async () => {
    setIsLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");

    // Fetch today's discovery calls (acquisition meetings)
    const { data: meetings } = await supabase
      .from("meetings")
      .select("id, company_name, meeting_time, prospect_name, prospect_email")
      .eq("department", "acquisition")
      .eq("meeting_date", today)
      .order("meeting_time", { ascending: true });

    if (meetings) {
      setDiscoveryCalls(
        meetings.map((m) => ({
          id: m.id,
          company_name: m.company_name,
          time: m.meeting_time,
          type: "discovery" as const,
          client_name: m.prospect_name,
          email: m.prospect_email,
        }))
      );
    }

    // Fetch today's follow-up calls
    const { data: pitches } = await supabase
      .from("pitch_calls")
      .select("id, company_name, pitch_call_time, client_name, client_email")
      .eq("pitch_call_date", today)
      .not("status", "eq", "cancelled")
      .order("pitch_call_time", { ascending: true });

    if (pitches) {
      setFollowupCalls(
        pitches.map((p) => ({
          id: p.id,
          company_name: p.company_name || "Unknown Company",
          time: p.pitch_call_time || "TBD",
          type: "followup" as const,
          client_name: p.client_name,
          email: p.client_email,
        }))
      );
    }

    setIsLoading(false);
  };

  const formatTime = (time: string) => {
    if (!time || time === "TBD") return "TBD";
    try {
      const [hours, minutes] = time.split(":");
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? "PM" : "AM";
      const hour12 = hour % 12 || 12;
      return `${hour12}:${minutes} ${ampm}`;
    } catch {
      return time;
    }
  };

  const handleCallClick = () => {
    onOpenChange(false);
    navigate("/admin/acquisition/meetings");
  };

  const totalCalls = discoveryCalls.length + followupCalls.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Today's Calls
            {totalCalls > 0 && (
              <Badge variant="secondary" className="ml-2">
                {totalCalls} scheduled
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : totalCalls === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">No calls scheduled today</p>
            <p className="text-sm mt-1">Enjoy your meeting-free day!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Discovery Calls */}
            {discoveryCalls.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Phone className="h-4 w-4 text-primary" />
                  Discovery Calls ({discoveryCalls.length})
                </div>
                <div className="space-y-2">
                  {discoveryCalls.map((call) => (
                    <div
                      key={call.id}
                      onClick={handleCallClick}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer border border-border"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{call.company_name}</p>
                          {call.client_name && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <User className="h-3 w-3" />
                              {call.client_name}
                            </div>
                          )}
                          {call.email && (
                            <p className="text-xs text-muted-foreground">{call.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {formatTime(call.time)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up Calls */}
            {followupCalls.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Phone className="h-4 w-4 text-amber-500" />
                  Follow-up Calls ({followupCalls.length})
                </div>
                <div className="space-y-2">
                  {followupCalls.map((call) => (
                    <div
                      key={call.id}
                      onClick={handleCallClick}
                      className="flex items-center justify-between p-4 rounded-lg bg-amber-500/5 hover:bg-amber-500/10 transition-colors cursor-pointer border border-amber-500/20"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/10">
                          <Building2 className="h-5 w-5 text-amber-500" />
                        </div>
                        <div>
                          <p className="font-medium">{call.company_name}</p>
                          {call.client_name && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <User className="h-3 w-3" />
                              {call.client_name}
                            </div>
                          )}
                          {call.email && (
                            <p className="text-xs text-muted-foreground">{call.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {formatTime(call.time)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
