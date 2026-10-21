import { Card, CardContent } from "@/components/ui/card";
import { Phone, Calendar, UserCheck, Clock, XCircle } from "lucide-react";

interface SummaryProps {
  leads: Array<{
    lead_status: string;
    last_status_update: string | null;
  }>;
}

export function WeeklyLeadSummary({ leads }: SummaryProps) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const recentlyUpdated = leads.filter(
    (l) => l.last_status_update && new Date(l.last_status_update) >= oneWeekAgo
  );

  const contacted = leads.filter((l) =>
    ["1st_attempt", "2nd_attempt", "3rd_attempt", "connected"].includes(l.lead_status)
  ).length;

  const meetingsBooked = leads.filter((l) => l.lead_status === "meeting_booked").length;
  const interested = leads.filter((l) => l.lead_status === "interested").length;
  const pendingFollowUp = leads.filter((l) =>
    ["no_show_follow_up", "callback_scheduled"].includes(l.lead_status)
  ).length;
  const notInterested = leads.filter((l) =>
    ["not_interested", "dead"].includes(l.lead_status)
  ).length;

  const stats = [
    { label: "Contacted", value: contacted, icon: Phone, color: "text-blue-500" },
    { label: "Interested", value: interested, icon: UserCheck, color: "text-emerald-500" },
    { label: "Meetings Booked", value: meetingsBooked, icon: Calendar, color: "text-primary" },
    { label: "Pending Follow-Up", value: pendingFollowUp, icon: Clock, color: "text-amber-500" },
    { label: "Closed/Dead", value: notInterested, icon: XCircle, color: "text-destructive" },
  ];

  return (
    <Card className="border-border">
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">Lead Summary</p>
          <p className="text-xs text-muted-foreground">
            {recentlyUpdated.length} updated this week
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <div>
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
