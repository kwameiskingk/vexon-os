import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, CheckSquare, Square } from "lucide-react";
import { format } from "date-fns";
import CoachingSessionModal from "@/components/sdr-manager/CoachingSessionModal";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  setterProfileId: string;
  setterFullName: string;
}

export default function CoachingTab({ setterProfileId, setterFullName }: Props) {
  const { user } = useAuth();
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const { data: sessions = [] } = useQuery({
    queryKey: ["setter-coaching-sessions", setterProfileId],
    queryFn: async () => {
      const { data } = await supabase
        .from("coaching_sessions")
        .select("*")
        .eq("setter_profile_id", setterProfileId)
        .order("session_date", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!setterProfileId,
  });

  const { data: actionItems = [] } = useQuery({
    queryKey: ["setter-coaching-action-items", setterProfileId],
    queryFn: async () => {
      const { data } = await supabase
        .from("coaching_action_items")
        .select("*")
        .eq("setter_profile_id", setterProfileId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!setterProfileId,
  });

  return (
    <>
      <div className="space-y-5">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setScheduleOpen(true)} className="gap-1.5">
            <CalendarPlus className="h-3.5 w-3.5" />
            Schedule next session
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Past 1-to-1 Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No coaching sessions yet.</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s: any) => (
                  <div key={s.id} className="p-3 rounded-md border border-border/50 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {s.custom_session_label || s.session_type?.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(s.session_date), "dd MMM yyyy")}
                          {s.session_time ? ` · ${s.session_time}` : ""}
                        </p>
                      </div>
                      <Badge
                        variant={s.status === "completed" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {s.status}
                      </Badge>
                    </div>
                    {s.improvements && (
                      <p className="text-xs text-muted-foreground mt-2">{s.improvements}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Action Items</CardTitle>
          </CardHeader>
          <CardContent>
            {actionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No action items.</p>
            ) : (
              <div className="space-y-2">
                {actionItems.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/30">
                    {a.status === "completed" ? (
                      <CheckSquare className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${a.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                        {a.description}
                      </p>
                      {a.due_date && (
                        <p className="text-xs text-muted-foreground">
                          Due {format(new Date(a.due_date), "dd MMM yyyy")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {user?.id && (
        <CoachingSessionModal
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          setters={[{ id: setterProfileId, full_name: setterFullName }]}
          managerId={user.id}
        />
      )}
    </>
  );
}
