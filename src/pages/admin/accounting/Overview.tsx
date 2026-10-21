import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

import { DollarSign, AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { format, addDays, addMonths } from "date-fns";

export default function AccountingOverview() {
  // Fetch accounting metrics from real data
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['accounting-overview-metrics'],
    queryFn: async () => {
      const today = new Date();
      const next7Days = addDays(today, 7);
      const next30Days = addDays(today, 30);

      // Get all accounting records
      const { data: records, error } = await supabase
        .from('accounting_records')
        .select(`
          id,
          amount,
          status,
          next_payment_due,
          paid_in_full,
          client_profiles!inner (
            id,
            company_name
          )
        `)
        .eq('paid_in_full', false);

      if (error) throw error;

      // Calculate metrics
      const totalReceivables = records?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;
      const overdueRecords = records?.filter(r => {
        if (!r.next_payment_due) return false;
        return new Date(r.next_payment_due) < today && r.status !== 'paid';
      }) || [];
      const overdueCount = overdueRecords.length;
      const overdueAmount = overdueRecords.reduce((sum, r) => sum + (r.amount || 0), 0);

      // Expected cash-in next 7 days
      const cashIn7Days = records?.filter(r => {
        if (!r.next_payment_due) return false;
        const dueDate = new Date(r.next_payment_due);
        return dueDate >= today && dueDate <= next7Days;
      }).reduce((sum, r) => sum + (r.amount || 0), 0) || 0;

      // Expected cash-in next 30 days
      const cashIn30Days = records?.filter(r => {
        if (!r.next_payment_due) return false;
        const dueDate = new Date(r.next_payment_due);
        return dueDate >= today && dueDate <= next30Days;
      }).reduce((sum, r) => sum + (r.amount || 0), 0) || 0;

      // Top 10 overdue clients
      const top10Overdue = overdueRecords
        .sort((a, b) => {
          const aDate = new Date(a.next_payment_due || 0);
          const bDate = new Date(b.next_payment_due || 0);
          return aDate.getTime() - bDate.getTime();
        })
        .slice(0, 10)
        .map(r => ({
          id: r.id,
          companyName: r.client_profiles?.company_name || 'Unknown',
          amount: r.amount || 0,
          dueDate: r.next_payment_due,
          daysOverdue: Math.ceil((today.getTime() - new Date(r.next_payment_due || 0).getTime()) / (1000 * 60 * 60 * 24))
        }));

      return {
        totalReceivables,
        overdueCount,
        overdueAmount,
        cashIn7Days,
        cashIn30Days,
        top10Overdue
      };
    }
  });

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="Accounting Overview"
          subtitle="Financial metrics and receivables at a glance"
          
        />
        
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading ? (
              <>
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
              </>
            ) : (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Receivables</CardTitle>
                    <DollarSign className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">£{metrics?.totalReceivables?.toLocaleString() || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Active unpaid invoices</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Overdue Invoices</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive">{metrics?.overdueCount || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      £{metrics?.overdueAmount?.toLocaleString() || 0} outstanding
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Expected (7 Days)</CardTitle>
                    <Clock className="h-4 w-4 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">£{metrics?.cashIn7Days?.toLocaleString() || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Due within next week</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Expected (30 Days)</CardTitle>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">£{metrics?.cashIn30Days?.toLocaleString() || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Due within next month</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Top 10 Overdue Clients */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top 10 Overdue Clients</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : metrics?.top10Overdue?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No overdue clients — great job! 🎉
                </div>
              ) : (
                <div className="space-y-2">
                  {metrics?.top10Overdue?.map((client, index) => (
                    <div 
                      key={client.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
                        <div>
                          <p className="font-medium">{client.companyName}</p>
                          <p className="text-xs text-muted-foreground">
                            Due {client.dueDate ? format(new Date(client.dueDate), 'dd MMM yyyy') : 'N/A'}
                            <span className="text-destructive ml-2">({client.daysOverdue} days overdue)</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">£{client.amount.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
