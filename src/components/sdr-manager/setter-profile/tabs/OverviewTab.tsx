import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Phone, Clock, Target } from "lucide-react";
import type { useSetterProfile } from "@/hooks/useSetterProfile";

interface Props {
  setter: NonNullable<ReturnType<typeof useSetterProfile>["setter"]>;
}

export default function OverviewTab({ setter }: Props) {
  const today = setter.dailyHistory?.find((d: any) => {
    const dStr = new Date(d.date).toDateString();
    return dStr === new Date().toDateString();
  });

  const stats = [
    {
      label: "Today's Dials",
      value: today?.dials_made ?? 0,
      target: setter.daily_dials_target ?? 150,
      icon: Phone,
    },
    {
      label: "Today's Talk Time",
      value: `${today?.talk_time ?? 0}m`,
      target: `${setter.daily_talk_time_target ?? 90}m`,
      icon: Clock,
    },
    {
      label: "Today's Meetings",
      value: today?.meetings_booked ?? 0,
      target: setter.daily_meetings_target ?? 2,
      icon: Calendar,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Quick KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</span>
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-2xl font-bold mt-2">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">Target: {s.target}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Coaching focus */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Current Coaching Focus
          </CardTitle>
        </CardHeader>
        <CardContent>
          {setter.current_coaching_focus ? (
            <p className="text-sm">{setter.current_coaching_focus}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No coaching focus set. Use "Log Coaching Note" in the header to add one.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Bio */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Email</p>
              <p>{setter.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Phone</p>
              <p>{setter.userProfile?.phone || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Department</p>
              <p className="capitalize">{setter.department}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Timezone</p>
              <p>{setter.userProfile?.timezone || "Europe/London"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
