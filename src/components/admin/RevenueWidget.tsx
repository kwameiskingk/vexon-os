import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, AlertCircle } from "lucide-react";

export function RevenueWidget() {
  const { data: revenueStats, isLoading } = useQuery({
    queryKey: ['revenue-stats'],
    queryFn: async () => {
      const { data: records, error } = await supabase
        .from('accounting_records')
        .select('amount, status, next_payment_due, is_ceased')
        .eq('status', 'paid')
        .eq('is_ceased', false)
        .not('amount', 'is', null);
      
      if (error) throw error;

      const totalMRR = records.reduce((sum, r) => sum + (r.amount || 0), 0);
      
      const { data: dueRecords } = await supabase
        .from('accounting_records')
        .select('amount')
        .in('status', ['due', 'overdue'])
        .eq('is_ceased', false)
        .not('amount', 'is', null);

      const outstanding = dueRecords?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;
      const collected = totalMRR - outstanding;

      return {
        totalMRR,
        projectedNextMonth: totalMRR,
        collected,
        outstanding
      };
    }
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-24"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-32"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const stats = [
    {
      title: "Total MRR",
      value: `£${revenueStats?.totalMRR.toLocaleString() || 0}`,
      icon: DollarSign,
      color: "text-primary"
    },
    {
      title: "Projected Next Month",
      value: `£${revenueStats?.projectedNextMonth.toLocaleString() || 0}`,
      icon: TrendingUp,
      color: "text-accent"
    },
    {
      title: "Collected",
      value: `£${revenueStats?.collected.toLocaleString() || 0}`,
      icon: DollarSign,
      color: "text-green-500"
    },
    {
      title: "Outstanding",
      value: `£${revenueStats?.outstanding.toLocaleString() || 0}`,
      icon: AlertCircle,
      color: "text-destructive"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      {stats.map((stat, idx) => (
        <Card key={idx} className="hover-lift border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              {stat.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}