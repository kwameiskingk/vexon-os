import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subDays } from "date-fns";
import { 
  TrendingUp, 
  Phone, 
  Clock, 
  Calendar,
  Target,
  DollarSign,
  Building2,
  Award
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ClientAssignmentSection } from "@/components/admin/ClientAssignmentSection";
import { TARGET_DEFAULTS, fetchSetterTargets } from "@/hooks/useSetterTargets";

interface EmployeePerformanceTabProps {
  employee: any;
}

export function EmployeePerformanceTab({ employee }: EmployeePerformanceTabProps) {
  const isSetter = employee.role === 'setter';
  const isAE = employee.role === 'account_executive';

  // Fetch setter performance data
  const { data: setterPerformance, isLoading: isLoadingSetterData } = useQuery({
    queryKey: ['setter-performance', employee.id],
    queryFn: async () => {
      // Get last 30 days performance
      const thirtyDaysAgo = subDays(new Date(), 30);
      
      const { data: performanceData } = await supabase
        .from('performance_history')
        .select('*')
        .eq('user_id', employee.id)
        .gte('date', format(thirtyDaysAgo, 'yyyy-MM-dd'))
        .order('date', { ascending: true });

      // Get setter profile (targets come from setter_targets, keyed by profile id)
      const { data: setterProfile } = await supabase
        .from('setters_profiles')
        .select('*')
        .eq('user_id', employee.id)
        .maybeSingle();

      const targets = setterProfile ? await fetchSetterTargets(setterProfile.id) : TARGET_DEFAULTS.fulfilment;

      return {
        history: performanceData || [],
        profile: setterProfile,
        targets
      };
    },
    enabled: isSetter
  });

  // Fetch AE performance data
  const { data: aePerformance, isLoading: isLoadingAEData } = useQuery({
    queryKey: ['ae-performance', employee.id],
    queryFn: async () => {
      const startMonth = startOfMonth(new Date());
      const startMonthStr = format(startMonth, 'yyyy-MM-dd');

      // Get closed deals this month
      const { data: closedDealsRaw } = await supabase
        .from('pitch_calls')
        .select('id, company_name, pitch_call_date, contract_value')
        .eq('created_by', employee.id)
        .eq('converted_to_client', true)
        .gte('pitch_call_date', startMonthStr);
      
      const closedDeals = (closedDealsRaw as unknown as Array<{
        id: string;
        company_name: string;
        pitch_call_date: string;
        contract_value: number | null;
      }>) || [];

      // Get compensation settings
      const { data: compensation } = await supabase
        .from('ae_compensation')
        .select('commission_percentage, commission_per_deal, base_salary')
        .eq('user_id', employee.id)
        .maybeSingle();

      // Get last 6 months data for trend
      const sixMonthsAgo = subDays(new Date(), 180);
      const sixMonthsAgoStr = format(sixMonthsAgo, 'yyyy-MM-dd');
      
      const { data: allDealsRaw } = await supabase
        .from('pitch_calls')
        .select('pitch_call_date, contract_value')
        .eq('created_by', employee.id)
        .eq('converted_to_client', true)
        .gte('pitch_call_date', sixMonthsAgoStr);

      const allDeals = (allDealsRaw as unknown as Array<{
        pitch_call_date: string;
        contract_value: number | null;
      }>) || [];

      return {
        closedDeals,
        compensation,
        allDeals
      };
    },
    enabled: isAE
  });

  // Calculate setter metrics
  const setterMetrics = setterPerformance?.history.length ? {
    totalDials: setterPerformance.history.reduce((sum: number, d: any) => sum + (d.dials_made || 0), 0),
    totalTalkTime: setterPerformance.history.reduce((sum: number, d: any) => sum + (d.talk_time || 0), 0),
    totalMeetings: setterPerformance.history.reduce((sum: number, d: any) => sum + (d.meetings_booked || 0), 0),
    totalConversations: setterPerformance.history.reduce((sum: number, d: any) => sum + (d.conversations || 0), 0),
    avgDailyDials: Math.round(setterPerformance.history.reduce((sum: number, d: any) => sum + (d.dials_made || 0), 0) / setterPerformance.history.length),
  } : null;

  // Calculate AE metrics
  const aeMetrics = aePerformance ? {
    dealsClosedThisMonth: aePerformance.closedDeals.length,
    contractValueThisMonth: aePerformance.closedDeals.reduce((sum: number, d: any) => sum + (d.contract_value || 0), 0),
    commissionEarned: (() => {
      const contractValue = aePerformance.closedDeals.reduce((sum: number, d: any) => sum + (Number(d.contract_value) || 0), 0);
      const commissionPct = Number(aePerformance.compensation?.commission_percentage) || 0;
      const perDealBonus = Number(aePerformance.compensation?.commission_per_deal) || 0;
      return (contractValue * (commissionPct / 100)) + (aePerformance.closedDeals.length * perDealBonus);
    })()
  } : null;

  // Not applicable for other roles
  if (!isSetter && !isAE) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Performance tracking is not applicable for this role.</p>
          <p className="text-sm mt-2">Performance metrics are available for Setters and Account Executives.</p>
        </CardContent>
      </Card>
    );
  }

  // Setter Performance View
  if (isSetter) {
    if (isLoadingSetterData) {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      );
    }

    const profile = setterPerformance?.profile;
    const targets = setterPerformance?.targets ?? TARGET_DEFAULTS.fulfilment;
    const chartData = setterPerformance?.history.slice(-14).map((d: any) => ({
      date: format(new Date(d.date), 'dd MMM'),
      dials: d.dials_made || 0,
      meetings: d.meetings_booked || 0
    })) || [];

    return (
      <div className="space-y-6">
        {/* Targets Card */}
        {profile && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5" />
                Daily Targets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Daily Dials</p>
                  <p className="text-2xl font-bold">{targets.daily_dials_target}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Daily Meetings</p>
                  <p className="text-2xl font-bold">{targets.daily_meetings_target}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Daily Talk Time</p>
                  <p className="text-2xl font-bold">{targets.daily_talk_time_target} min</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Weekly Meetings</p>
                  <p className="text-2xl font-bold">{targets.weekly_meetings_target}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Last 30 Days Stats */}
        {setterMetrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Phone className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Dials</p>
                    <p className="text-xl font-bold">{setterMetrics.totalDials.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Calendar className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Meetings Booked</p>
                    <p className="text-xl font-bold">{setterMetrics.totalMeetings}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <Clock className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Talk Time</p>
                    <p className="text-xl font-bold">{Math.round(setterMetrics.totalTalkTime / 60)}h</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Daily Dials</p>
                    <p className="text-xl font-bold">{setterMetrics.avgDailyDials}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Performance Chart */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Performance Trend (Last 14 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="dials" 
                      stroke="hsl(var(--primary))" 
                      fill="hsl(var(--primary)/0.2)"
                      name="Dials"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="meetings" 
                      stroke="hsl(142, 76%, 36%)" 
                      fill="hsla(142, 76%, 36%, 0.2)"
                      name="Meetings"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Compensation */}
        {profile && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Compensation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Per Meeting Bonus</p>
                  <p className="text-xl font-bold">£{profile.per_meeting_bonus}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Meetings Sat</p>
                  <p className="text-xl font-bold">{profile.meetings_sat || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Commission Earned</p>
                  <p className="text-xl font-bold text-emerald-500">
                    £{(profile.commission_earned || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Client Assignments (Fulfilment only) */}
        {employee.department === 'fulfilment' && profile && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Client Assignments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ClientAssignmentSection
                setterId={profile.id}
                setterUserId={employee.id}
                department={employee.department}
              />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // AE Performance View
  if (isAE) {
    if (isLoadingAEData) {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      );
    }

    const compensation = aePerformance?.compensation;

    return (
      <div className="space-y-6">
        {/* This Month Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Award className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Deals Closed (MTD)</p>
                  <p className="text-xl font-bold">{aeMetrics?.dealsClosedThisMonth || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Building2 className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Contract Value (MTD)</p>
                  <p className="text-xl font-bold">£{(aeMetrics?.contractValueThisMonth || 0).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <DollarSign className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Commission Earned (MTD)</p>
                  <p className="text-xl font-bold text-emerald-500">£{(aeMetrics?.commissionEarned || 0).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Compensation Settings */}
        {compensation && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Compensation Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Commission %</p>
                  <p className="text-xl font-bold">{compensation.commission_percentage}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Per Deal Bonus</p>
                  <p className="text-xl font-bold">£{compensation.commission_per_deal}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Base Salary</p>
                  <p className="text-xl font-bold">£{(compensation.base_salary || 0).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Closed Deals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Closed Deals This Month</CardTitle>
          </CardHeader>
          <CardContent>
            {aePerformance?.closedDeals.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No deals closed this month yet.</p>
            ) : (
              <div className="space-y-3">
                {aePerformance?.closedDeals.map((deal: any) => (
                  <div key={deal.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <p className="font-medium">{deal.company_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Closed {format(new Date(deal.pitch_call_date), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">£{(deal.contract_value || 0).toLocaleString()}</p>
                      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                        Converted
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
