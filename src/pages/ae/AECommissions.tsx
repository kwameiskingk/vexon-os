import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Panel, Pill, Row, RowList, RowName, RowNum, StatStrip } from "@/components/ui-v2";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getCommissionCycleDates } from "@/utils/commissionCycle";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function AECommissions() {
  const { user } = useAuth();
  const { start: cycleStart, end: cycleEnd } = getCommissionCycleDates();
  const cycleStartStr = format(cycleStart, "yyyy-MM-dd");
  const cycleEndStr = format(cycleEnd, "yyyy-MM-dd");

  // AE compensation
  const { data: compensation } = useQuery({
    queryKey: ["ae-compensation", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("ae_compensation").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const commissionPct = Number(compensation?.commission_percentage || 0);
  const baseSalary = Number(compensation?.base_salary || 0);

  // Cycle payments + deals
  const { data: cycle, isLoading: isLoadingCycle } = useQuery({
    queryKey: ["ae-cycle-payments", user?.id, cycleStartStr, cycleEndStr],
    queryFn: async () => {
      if (!user?.id) return { payments: [], deals: [] };

      const { data: payments } = await (supabase.from("ae_deal_payments").select("id, pitch_call_id, amount, paid_on") as any)
        .eq("ae_user_id", user.id)
        .gte("paid_on", cycleStartStr)
        .lte("paid_on", cycleEndStr)
        .order("paid_on", { ascending: false });

      const pitchIds: string[] = Array.from(new Set(((payments || []) as any[]).map((p) => String(p.pitch_call_id))));
      let deals: any[] = [];
      if (pitchIds.length) {
        const { data } = await supabase
          .from("pitch_calls")
          .select("id, client_name, company_name, contract_value, contract_term, is_pif, pif_amount, cash_collected, closed_on, updated_at")
          .in("id", pitchIds);
        deals = data || [];
      }

      return { payments: payments || [], deals };
    },
    enabled: !!user?.id,
  });

  const cashCollected = (cycle?.payments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const commissionEarned = (cashCollected * commissionPct) / 100;
  const dealsClosedThisCycle = new Set((cycle?.deals || []).filter((d) => d.closed_on && d.closed_on >= cycleStartStr && d.closed_on <= cycleEndStr).map((d) => d.id)).size;
  const pifCount = (cycle?.deals || []).filter((d) => d.is_pif).length;
  const cycleEarnings = baseSalary + commissionEarned;

  // Trend chart: cash collected over last 6 cycles
  const { data: trend = [] } = useQuery({
    queryKey: ["ae-cash-trend", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const today = new Date();
      const ranges = Array.from({ length: 6 }, (_, i) => {
        const ref = subMonths(today, 5 - i);
        const { start, end } = getCommissionCycleDates(ref);
        return { label: format(ref, "MMM"), startStr: format(start, "yyyy-MM-dd"), endStr: format(end, "yyyy-MM-dd") };
      });
      const results = await Promise.all(
        ranges.map(async ({ startStr, endStr }) => {
          const { data } = await (supabase.from("ae_deal_payments").select("amount") as any)
            .eq("ae_user_id", user.id)
            .gte("paid_on", startStr)
            .lte("paid_on", endStr);
          return (data || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
        })
      );
      return ranges.map((r, i) => ({ month: r.label, cash: results[i], commission: (results[i] * commissionPct) / 100 }));
    },
    enabled: !!user?.id && !!compensation,
  });

  const fmt = (v: number) => `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtShort = (v: number) => (v >= 1000 ? `£${(v / 1000).toFixed(1)}k` : `£${v.toLocaleString()}`);
  const cycleLabel = `${format(cycleStart, "d MMM")} – ${format(cycleEnd, "d MMM yyyy")}`;

  // Deals table rows (map deal → cycle payments)
  const dealRows = (cycle?.deals || []).map((d) => {
    const paymentsForDeal = (cycle?.payments || []).filter((p: any) => p.pitch_call_id === d.id);
    const cycleCashForDeal = paymentsForDeal.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    return {
      id: d.id,
      name: d.company_name || d.client_name || "Unknown",
      contract_value: Number(d.contract_value || 0),
      contract_term: d.contract_term || "—",
      is_pif: d.is_pif,
      cash_collected_total: Number(d.cash_collected || 0),
      cycle_cash: cycleCashForDeal,
      commission: (cycleCashForDeal * commissionPct) / 100,
      closed_on: d.closed_on || d.updated_at,
    };
  }).sort((a, b) => (b.cycle_cash - a.cycle_cash));

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader title="Commissions" subtitle={`Cycle: ${cycleLabel}`} />

        <div className="space-y-6">
          <StatStrip
            hero
            stats={[
              { label: "Cycle earnings", value: fmt(cycleEarnings), caption: `Base ${fmt(baseSalary)} + ${commissionPct}% on ${fmt(cashCollected)} cash collected` },
              { label: "Cash collected", value: fmtShort(cashCollected), caption: "This cycle" },
              { label: "Commission", value: fmt(commissionEarned) },
              { label: "Deals closed", value: dealsClosedThisCycle },
              { label: "PIFs", value: pifCount, caption: "Paid in full" },
            ]}
          />

          <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
            {/* Trend */}
            <Panel title="Cash collected" meta="Last six cycles">
                <div className="h-56 pt-3">
                  {trend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v === 0 ? "£0" : `£${(v / 1000).toFixed(0)}k`)} />
                        <Tooltip formatter={(v: number, name: string) => [fmt(v), name === "cash" ? "Cash Collected" : "Commission"]} />
                        <Area type="monotone" dataKey="cash" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-[12px] text-[var(--dim)]">
                      No cash-collected history yet
                    </div>
                  )}
                </div>
            </Panel>

            {/* Deals table */}
            <Panel title="Deals" meta="This cycle" aside={<Pill>{dealRows.length}</Pill>}>
                {isLoadingCycle ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : dealRows.length === 0 ? (
                  <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No cash collected this cycle</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    <RowList columns="1fr auto">
                      {dealRows.map((d) => (
                        <Row key={d.id}>
                          <RowName primary={<span className="flex items-center gap-[6px]">{d.name}{d.is_pif && <Pill variant="ok">PIF</Pill>}</span>} secondary={`${d.contract_term} · cash total ${fmtShort(d.cash_collected_total)} / ${fmtShort(d.contract_value)}`} />
                          <div className="text-right">
                            <RowNum>{fmtShort(d.cycle_cash)}</RowNum>
                            <div className="mt-[2px]"><Pill variant="ok">+{fmt(d.commission)}</Pill></div>
                          </div>
                        </Row>
                      ))}
                    </RowList>
                  </div>
                )}
            </Panel>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
