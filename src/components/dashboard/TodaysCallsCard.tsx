import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Phone, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { TodaysCallsModal } from "./TodaysCallsModal";
import { useAuth } from "@/contexts/AuthContext";

interface ScheduledCall {
  id: string;
  company_name: string;
  time: string;
  type: "discovery" | "pitch";
  client_name?: string;
}

export function TodaysCallsCard() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const isAE = userRole === 'account_executive';
  
  const [discoveryCalls, setDiscoveryCalls] = useState<ScheduledCall[]>([]);
  const [pitchCalls, setPitchCalls] = useState<ScheduledCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadTodaysCalls();
  }, []);

  const loadTodaysCalls = async () => {
    setIsLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");

    // Fetch today's discovery calls (acquisition meetings)
    const { data: meetings } = await supabase
      .from("meetings")
      .select("id, company_name, meeting_time, prospect_name")
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
        }))
      );
    }

    // Fetch today's pitch calls
    const { data: pitches } = await supabase
      .from("pitch_calls")
      .select("id, company_name, pitch_call_time, client_name")
      .eq("pitch_call_date", today)
      .not("status", "eq", "cancelled")
      .order("pitch_call_time", { ascending: true });

    if (pitches) {
      setPitchCalls(
        pitches.map((p) => ({
          id: p.id,
          company_name: p.company_name || "Unknown Company",
          time: p.pitch_call_time || "TBD",
          type: "pitch" as const,
          client_name: p.client_name,
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

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">Today's Calls</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const totalCalls = discoveryCalls.length + pitchCalls.length;

  const handleCardClick = () => {
    if (isAE) {
      navigate('/ae/discovery-calls');
    } else {
      setIsModalOpen(true);
    }
  };

  return (
    <>
    <Card className="h-full cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200" onClick={handleCardClick}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10">
              <Calendar className="h-4.5 w-4.5 text-primary" />
            </div>
            <CardTitle className="text-base font-semibold">Today's Calls</CardTitle>
          </div>
          {totalCalls > 0 && (
            <Badge variant="secondary" className="text-xs font-medium">
              {totalCalls} scheduled
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalCalls === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No calls scheduled today</p>
          </div>
        ) : (
          <>
            {/* Discovery Calls */}
            {discoveryCalls.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <Phone className="h-3 w-3" />
                  Discovery Calls ({discoveryCalls.length})
                </div>
                <div className="space-y-2">
                  {discoveryCalls.map((call) => (
                    <div
                      key={call.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{call.company_name}</p>
                        {call.client_name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {call.client_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                        <Clock className="h-3 w-3" />
                        {formatTime(call.time)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up Calls */}
            {pitchCalls.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <Phone className="h-3 w-3" />
                  Follow-up Calls ({pitchCalls.length})
                </div>
                <div className="space-y-2">
                  {pitchCalls.map((call) => (
                    <div
                      key={call.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors border border-primary/10"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{call.company_name}</p>
                        {call.client_name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {call.client_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                        <Clock className="h-3 w-3" />
                        {formatTime(call.time)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
    <TodaysCallsModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  );
}
