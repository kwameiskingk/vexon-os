// Setter demo lens (3 Sep, R9): where the SDR onboarding sandbox lands when
// the finish card says "Take me to my dashboard". Renders the real setter
// shell (DashboardLayout role="setter") and the real dashboard building
// blocks (PageHeader, KPICard, the glass cards) on fixture data.
//
// No Supabase import is allowed in this file or its fixtures
// (src/lib/demoSetterData.ts); the sidebar collapses to Overview + Exit demo
// while the path starts with /setter/demo (AppSidebar).
//
// SetterDashboard itself is a single 850-line container with its queries
// inline (no View split), so this lens composes the same widgets rather
// than extracting it; the one-UI property holds at the component level.

import { Building2, Calendar, ChevronRight, DollarSign, Phone, Clock, Trophy } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { KPICard } from "@/components/dashboard/KPICard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  demoSetter,
  demoSetterToday,
  demoSetterUpcoming,
  demoSetterWeek,
  formatTalkTime,
} from "@/lib/demoSetterData";

const timeOfDay = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

export default function SetterDemoPortal() {
  return (
    <DashboardLayout role="setter">
      <PageContainer>
        <PageHeader
          title={`${timeOfDay()}, ${demoSetter.firstName}`}
          subtitle="Your performance overview"
          actions={
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
              Demo lens · fixture data
            </Badge>
          }
        />
        <div className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="glass-card p-4 h-full">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Today's Assignment</p>
                    <p className="text-lg font-semibold mt-0.5">{demoSetter.todayClient.company_name}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">View assignment details →</p>
            </Card>

            <Card className="glass-card p-4 h-full">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Commission Overview · Current Cycle</p>
                    <p className="text-2xl font-bold text-primary mt-0.5">
                      ${demoSetter.commissionEarned.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Meetings Sat</span>
                <span className="font-semibold">{demoSetter.meetingsSat}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">Per-Meeting Bonus</span>
                <span className="font-semibold text-primary">${demoSetter.perMeetingBonus}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">View full details →</p>
            </Card>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KPICard title="Calls Today" value={demoSetterToday.calls_made} icon={Phone} />
            <KPICard title="Talk Time" value={formatTalkTime(demoSetterToday.total_call_time)} icon={Clock} />
            <KPICard title="Conversations" value={demoSetterToday.leads_created} icon={Trophy} />
            <KPICard title="Meetings Booked" value={demoSetterToday.meetings_booked} icon={Calendar} className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="glass-card p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">This week</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Day</TableHead>
                    <TableHead className="text-xs">Calls</TableHead>
                    <TableHead className="text-xs">Talk time</TableHead>
                    <TableHead className="text-xs">Convos</TableHead>
                    <TableHead className="text-xs">Meetings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoSetterWeek.map((d) => (
                    <TableRow key={d.day}>
                      <TableCell className="text-sm">{d.day}</TableCell>
                      <TableCell className="text-sm">{d.calls}</TableCell>
                      <TableCell className="text-sm">{formatTalkTime(d.talkSeconds)}</TableCell>
                      <TableCell className="text-sm">{d.conversations}</TableCell>
                      <TableCell className="text-sm">{d.meetings}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="glass-card p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">Upcoming meetings</p>
              <ul className="divide-y divide-border/60">
                {demoSetterUpcoming.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.prospect} · {m.company}</p>
                      <p className="text-xs text-muted-foreground truncate">for {m.client}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">{m.when}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
