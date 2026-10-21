import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { CheckCircle, FileText, Users, PoundSterling, BarChart3, Flame } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface PeriodData {
  label: string;
  startDate: Date;
  endDate: Date;
  meetingsSat: number;
  termsSent: number;
  vacanciesTakenOn: number;
}

export interface ClientMetricsViewProps {
  loading: boolean;
  metrics: {
    meetingsSat: number;
    termsSent: number;
    vacanciesTakenOn: number;
    potentialPlacementFeeValue: number;
    contractValue: number;
    warmLeadsCreated: number;
  };
  weeklyData: PeriodData[];
  monthlyData: PeriodData[];
  formatCurrency: (value: number) => string;
}

export const ClientMetricsView = (props: ClientMetricsViewProps) => {
  const { loading, metrics, weeklyData, monthlyData, formatCurrency } = props;
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");

  return (
    <DashboardLayout role="client">
      <PageContainer>
        <PageHeader
          title="Metrics"
          subtitle="Detailed breakdown of your campaign performance"
          gradient
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card className="border-border shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Meetings Sat</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{metrics.meetingsSat}</div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Terms Sent</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{metrics.termsSent}</div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Potential Vacancies</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{metrics.vacanciesTakenOn}</div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Potential Placement Fees</CardTitle>
              <PoundSterling className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold">{formatCurrency(metrics.potentialPlacementFeeValue)}</div>
              )}
            </CardContent>
          </Card>


          <Card className="border-border shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Warm Leads Created</CardTitle>
              <Flame className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{metrics.warmLeadsCreated}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Period Toggle and Breakdown */}
        <Tabs value={period} onValueChange={(v) => setPeriod(v as "weekly" | "monthly")} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Performance Breakdown
            </h2>
            <TabsList>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="weekly">
            <Card className="border-border shadow-card">
              <CardHeader>
                <CardTitle>Weekly Performance</CardTitle>
                <CardDescription>Activity over the last 8 weeks</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-center">Meetings Sat</TableHead>
                        <TableHead className="text-center">Terms Sent</TableHead>
                        <TableHead className="text-center">Potential Vacancies</TableHead>

                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weeklyData.map((row, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-center">{row.meetingsSat}</TableCell>
                          <TableCell className="text-center">{row.termsSent}</TableCell>
                          <TableCell className="text-center">{row.vacanciesTakenOn}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="monthly">
            <Card className="border-border shadow-card">
              <CardHeader>
                <CardTitle>Monthly Performance</CardTitle>
                <CardDescription>Activity over the last 6 months</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-center">Meetings Sat</TableHead>
                        <TableHead className="text-center">Terms Sent</TableHead>
                        <TableHead className="text-center">Potential Vacancies</TableHead>

                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyData.map((row, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-center">{row.meetingsSat}</TableCell>
                          <TableCell className="text-center">{row.termsSent}</TableCell>
                          <TableCell className="text-center">{row.vacanciesTakenOn}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageContainer>
    </DashboardLayout>
  );
};

const ClientMetrics = () => {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    meetingsSat: 0,
    termsSent: 0,
    vacanciesTakenOn: 0,
    potentialPlacementFeeValue: 0,
    contractValue: 0,
    warmLeadsCreated: 0,
  });
  const [weeklyData, setWeeklyData] = useState<PeriodData[]>([]);
  const [monthlyData, setMonthlyData] = useState<PeriodData[]>([]);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: linkedProfiles } = await supabase
        .from("client_profile_users")
        .select("client_profile_id")
        .eq("user_id", user.id);

      const { data: directProfile } = await supabase
        .from("client_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const allProfileIds = new Set<string>();
      linkedProfiles?.forEach(p => allProfileIds.add(p.client_profile_id));
      if (directProfile) allProfileIds.add(directProfile.id);

      const profileIdsArray = Array.from(allProfileIds);
      if (profileIdsArray.length === 0) { setLoading(false); return; }

      // Fetch profile data including contract_value
      const { data: profileData } = await supabase
        .from("client_profiles")
        .select("kpi_meetings_sat, terms_sent, vacancies_taken_on, potential_placement_fee_value, contract_value")
        .in("id", profileIdsArray);

      let meetingsSat = 0, termsSent = 0, vacanciesTakenOn = 0, potentialPlacementFeeValue = 0, contractValue = 0;
      profileData?.forEach(profile => {
        meetingsSat += (profile as any).kpi_meetings_sat || 0;
        termsSent += (profile as any).terms_sent || 0;
        vacanciesTakenOn += (profile as any).vacancies_taken_on || 0;
        potentialPlacementFeeValue += (profile as any).potential_placement_fee_value || 0;
        contractValue += (profile as any).contract_value || 0;
      });

      // Count warm leads for this client using filter
      let warmLeadsTotal = 0;
      for (const pid of profileIdsArray) {
        const { count } = await supabase
          .from("warm_leads")
          .select("id", { count: "exact", head: true })
          .filter("client_profile_id", "eq", pid)
          .eq("approval_status", "approved");
        warmLeadsTotal += count || 0;
      }

      setMetrics({ meetingsSat, termsSent, vacanciesTakenOn, potentialPlacementFeeValue, contractValue, warmLeadsCreated: warmLeadsTotal });

      // Fetch meetings for sat breakdown
      const { data: meetingsData } = await supabase
        .from("meetings")
        .select("id, meeting_date, attendance_status")
        .in("client_profile_id", profileIdsArray)
        .eq("attendance_status", "sat")
        .order("meeting_date", { ascending: false });

      // Fetch dated metric entries for terms_sent and vacancies_taken_on
      const { data: metricEntries } = await supabase
        .from("client_metric_entries" as any)
        .select("*")
        .in("client_profile_id", profileIdsArray)
        .order("entry_date", { ascending: false });

      // Process weekly data (last 8 weeks)
      const weeks: PeriodData[] = [];
      for (let i = 0; i < 8; i++) {
        const weekStart = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
        const weekEnd = endOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });

        const satMeetings = meetingsData?.filter(m => {
          const d = parseISO(m.meeting_date);
          return d >= weekStart && d <= weekEnd;
        }) || [];

        const weekTerms = (metricEntries as any[])?.filter((e: any) => {
          const d = parseISO(e.entry_date);
          return e.metric_type === 'terms_sent' && d >= weekStart && d <= weekEnd;
        }) || [];

        const weekVacancies = (metricEntries as any[])?.filter((e: any) => {
          const d = parseISO(e.entry_date);
          return e.metric_type === 'vacancies_taken_on' && d >= weekStart && d <= weekEnd;
        }) || [];

        weeks.push({
          label: `Week ${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d")}`,
          startDate: weekStart,
          endDate: weekEnd,
          meetingsSat: satMeetings.length,
          termsSent: weekTerms.reduce((sum: number, e: any) => sum + (e.value || 0), 0),
          vacanciesTakenOn: weekVacancies.reduce((sum: number, e: any) => sum + (e.value || 0), 0),
        });
      }
      setWeeklyData(weeks);

      // Process monthly data (last 6 months)
      const months: PeriodData[] = [];
      for (let i = 0; i < 6; i++) {
        const monthStart = startOfMonth(subMonths(new Date(), i));
        const monthEnd = endOfMonth(subMonths(new Date(), i));

        const satMeetings = meetingsData?.filter(m => {
          const d = parseISO(m.meeting_date);
          return d >= monthStart && d <= monthEnd;
        }) || [];

        const monthTerms = (metricEntries as any[])?.filter((e: any) => {
          const d = parseISO(e.entry_date);
          return e.metric_type === 'terms_sent' && d >= monthStart && d <= monthEnd;
        }) || [];

        const monthVacancies = (metricEntries as any[])?.filter((e: any) => {
          const d = parseISO(e.entry_date);
          return e.metric_type === 'vacancies_taken_on' && d >= monthStart && d <= monthEnd;
        }) || [];

        months.push({
          label: format(monthStart, "MMMM yyyy"),
          startDate: monthStart,
          endDate: monthEnd,
          meetingsSat: satMeetings.length,
          termsSent: monthTerms.reduce((sum: number, e: any) => sum + (e.value || 0), 0),
          vacanciesTakenOn: monthVacancies.reduce((sum: number, e: any) => sum + (e.value || 0), 0),
        });
      }
      setMonthlyData(months);

    } catch (error) {
      console.error("Failed to load metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <ClientMetricsView
      loading={loading}
      metrics={metrics}
      weeklyData={weeklyData}
      monthlyData={monthlyData}
      formatCurrency={formatCurrency}
    />
  );
};

export default ClientMetrics;
