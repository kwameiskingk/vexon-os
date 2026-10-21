import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, addWeeks, startOfWeek, endOfWeek } from "date-fns";

export default function AccountingCashflow() {
  // Fetch cash flow forecast data
  const { data: forecastData, isLoading } = useQuery({
    queryKey: ['cashflow-forecast'],
    queryFn: async () => {
      const today = new Date();
      const weeks: any[] = [];

      // Generate 8 weeks of data
      for (let i = 0; i < 8; i++) {
        const weekStart = startOfWeek(addWeeks(today, i));
        const weekEnd = endOfWeek(addWeeks(today, i));
        
        weeks.push({
          weekStart,
          weekEnd,
          label: `Week ${i + 1}`,
          dateLabel: format(weekStart, 'dd MMM'),
          inflows: 0,
          outflows: 0
        });
      }

      // Fetch expected inflows from payment installments
      const { data: installments, error: instError } = await supabase
        .from('payment_installments')
        .select('due_date, amount, status, deferral_end_date')
        .neq('status', 'paid');

      if (instError) throw instError;

      // Calculate inflows per week
      installments?.forEach(inst => {
        const dueDate = new Date(inst.deferral_end_date || inst.due_date);
        weeks.forEach(week => {
          if (dueDate >= week.weekStart && dueDate <= week.weekEnd) {
            week.inflows += inst.amount || 0;
          }
        });
      });

      // Fetch operating costs for outflows
      const { data: costs, error: costsError } = await supabase
        .from('operating_costs')
        .select('amount, frequency, start_date, end_date');

      if (costsError) throw costsError;

      // Calculate monthly outflows and distribute across weeks
      let monthlyOutflows = 0;
      costs?.forEach(cost => {
        if (cost.frequency === 'monthly') {
          monthlyOutflows += cost.amount || 0;
        } else if (cost.frequency === 'weekly') {
          monthlyOutflows += (cost.amount || 0) * 4;
        } else if (cost.frequency === 'quarterly') {
          monthlyOutflows += (cost.amount || 0) / 3;
        } else if (cost.frequency === 'yearly') {
          monthlyOutflows += (cost.amount || 0) / 12;
        }
      });

      // Distribute monthly outflows across weeks
      const weeklyOutflow = monthlyOutflows / 4;
      weeks.forEach(week => {
        week.outflows = weeklyOutflow;
      });

      return weeks;
    }
  });

  // Calculate totals
  const totalInflows = forecastData?.reduce((sum, w) => sum + w.inflows, 0) || 0;
  const totalOutflows = forecastData?.reduce((sum, w) => sum + w.outflows, 0) || 0;
  const netCashflow = totalInflows - totalOutflows;

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="Cash Flow Forecast"
          subtitle="Expected inflows vs outflows over the next 8 weeks"
        />
        
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Expected Inflows</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">
                  £{totalInflows.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Next 8 weeks</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Expected Outflows</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">
                  £{totalOutflows.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Next 8 weeks</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Net Cash Flow</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${netCashflow >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  £{netCashflow.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Projected balance</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Weekly Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={forecastData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="dateLabel" 
                        className="text-xs fill-muted-foreground"
                      />
                      <YAxis 
                        className="text-xs fill-muted-foreground"
                        tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        formatter={(value: number) => `£${value.toLocaleString()}`}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Bar 
                        dataKey="inflows" 
                        name="Inflows" 
                        fill="hsl(142.1 76.2% 36.3%)" 
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar 
                        dataKey="outflows" 
                        name="Outflows" 
                        fill="hsl(0 84.2% 60.2%)" 
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
