import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Phone, Clock } from "lucide-react";
import {
  getTrendIconProps,
  formatTrendWithSign,
  getTrendColorClass,
} from "@/lib/trends";
import { format, subDays } from "date-fns";
import type { useSetterProfile } from "@/hooks/useSetterProfile";

interface Props {
  setter: NonNullable<ReturnType<typeof useSetterProfile>["setter"]>;
}

const TrendIcon = ({ score }: { score: number }) => {
  const { icon: Icon, className } = getTrendIconProps(score);
  return <Icon className={className} />;
};

export default function PerformanceTab({ setter }: Props) {
  // Build a 30-day spark history for meetings
  const today = new Date();
  const days: { date: string; meetings: number; dials: number; talk_time: number }[] = [];
  const histMap = new Map<string, any>();
  (setter.dailyHistory || []).forEach((d: any) => {
    const key = format(new Date(d.date), "yyyy-MM-dd");
    histMap.set(key, d);
  });
  for (let i = 29; i >= 0; i--) {
    const d = subDays(today, i);
    const key = format(d, "yyyy-MM-dd");
    const row = histMap.get(key) || {};
    days.push({
      date: key,
      meetings: row.meetings_booked || 0,
      dials: row.dials_made || 0,
      talk_time: row.talk_time || 0,
    });
  }

  const maxMeetings = Math.max(1, ...days.map((d) => d.meetings));

  return (
    <div className="space-y-5">
      {/* Per-metric trend cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <Calendar className="h-4 w-4 text-primary" />
              <TrendIcon score={setter.meetingTrend} />
            </div>
            <p className="text-2xl font-bold mt-2">{setter.currentPerf.meetings}</p>
            <p className="text-xs text-muted-foreground">Meetings (last 7d)</p>
            <p className={`text-xs mt-1 ${getTrendColorClass(setter.meetingTrend)}`}>
              {formatTrendWithSign(setter.meetingTrend)}% vs prev 7d
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <Phone className="h-4 w-4 text-primary" />
              <TrendIcon score={setter.dialsTrend} />
            </div>
            <p className="text-2xl font-bold mt-2">{setter.currentPerf.dials}</p>
            <p className="text-xs text-muted-foreground">Dials (last 7d)</p>
            <p className={`text-xs mt-1 ${getTrendColorClass(setter.dialsTrend)}`}>
              {formatTrendWithSign(setter.dialsTrend)}% vs prev 7d
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <Clock className="h-4 w-4 text-primary" />
              <TrendIcon score={setter.talkTimeTrend} />
            </div>
            <p className="text-2xl font-bold mt-2">{setter.currentPerf.talk_time}m</p>
            <p className="text-xs text-muted-foreground">Talk Time (last 7d)</p>
            <p className={`text-xs mt-1 ${getTrendColorClass(setter.talkTimeTrend)}`}>
              {formatTrendWithSign(setter.talkTimeTrend)}% vs prev 7d
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Composite score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Composite Trend Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <TrendIcon score={setter.compositeScore} />
            <span className={`text-sm font-medium ${getTrendColorClass(setter.compositeScore)}`}>
              {formatTrendWithSign(setter.compositeScore)}% overall vs previous week
            </span>
            <Badge
              variant={
                setter.trendStatus === "improving"
                  ? "default"
                  : setter.trendStatus === "declining"
                    ? "destructive"
                    : "secondary"
              }
              className="ml-auto capitalize"
            >
              {setter.trendStatus}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* 30-day spark history */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">30-Day Meeting History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-24">
            {days.map((d) => {
              const heightPct = (d.meetings / maxMeetings) * 100;
              return (
                <div
                  key={d.date}
                  className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors rounded-sm relative group"
                  style={{ height: `${Math.max(2, heightPct)}%` }}
                  title={`${d.date}: ${d.meetings} meetings`}
                >
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-7 left-1/2 -translate-x-1/2 bg-popover border border-border rounded text-[10px] px-1.5 py-0.5 whitespace-nowrap z-10">
                    {d.meetings}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
            <span>{format(subDays(today, 29), "MMM d")}</span>
            <span>Today</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
