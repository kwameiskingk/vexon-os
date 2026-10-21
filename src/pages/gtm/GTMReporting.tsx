import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Cell } from "recharts";

const GTMReporting = () => {
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["gtm-reporting-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gtm_campaign_metrics")
        .select("*")
        .order("campaign_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: slCampaigns, isLoading: slLoading } = useQuery({
    queryKey: ["gtm-reporting-sl-campaigns"],
    queryFn: async () => {
      const { data: metrics } = await supabase.from("gtm_smartlead_campaign_metrics").select("*");
      // Try to enrich with names from the API
      let nameMap = new Map<string, string>();
      try {
        const { data: live } = await supabase.functions.invoke("smartlead-api", { body: { action: "get-campaigns" } });
        const list = Array.isArray(live) ? live : (live?.data || []);
        list.forEach((c: any) => nameMap.set(String(c.id), c.name));
      } catch { /* ignore */ }
      return (metrics || []).map((m: any) => ({
        ...m,
        name: nameMap.get(String(m.smartlead_campaign_id)) || `Campaign ${m.smartlead_campaign_id}`,
      }));
    },
  });


  const chartData = campaigns?.map((c) => ({
    name: (c.campaign_name || c.heyreach_campaign_id || "").substring(0, 25),
    connections: c.connections_accepted || 0,
    replies: (c.messages_replied || 0) + (c.inmails_replied || 0),
    connRate: c.connections_sent ? Math.round((c.connections_accepted || 0) / c.connections_sent * 100) : 0,
    replyRate: c.messages_sent ? Math.round((c.messages_replied || 0) / c.messages_sent * 100) : 0,
  })) || [];

  const chartConfig = {
    connections: { label: "Connections", color: "hsl(217 91% 60%)" },
    replies: { label: "Replies", color: "hsl(142 71% 45%)" },
  };

  const rateConfig = {
    connRate: { label: "Connection Rate %", color: "hsl(217 91% 60%)" },
    replyRate: { label: "Reply Rate %", color: "hsl(142 71% 45%)" },
  };
  // HeyReach totals
  const totalConns = campaigns?.reduce((s, c) => s + (c.connections_accepted || 0), 0) || 0;
  const totalReplies = campaigns?.reduce((s, c) => s + (c.messages_replied || 0) + (c.inmails_replied || 0), 0) || 0;

  // Smartlead chart data + totals
  const slChartData = (slCampaigns || []).map((c: any) => ({
    name: (c.name || "").substring(0, 25),
    sent: c.emails_sent || 0,
    replies: c.emails_replied || 0,
    bounces: c.emails_bounced || 0,
    replyRate: c.emails_sent ? Math.round(((c.emails_replied || 0) / c.emails_sent) * 100) : 0,
  }));
  const slConfig = {
    sent: { label: "Sent", color: "hsl(25 95% 53%)" },
    replies: { label: "Replies", color: "hsl(142 71% 45%)" },
  };
  const slRateConfig = {
    replyRate: { label: "Reply Rate %", color: "hsl(25 95% 53%)" },
  };
  const slTotalSent = (slCampaigns || []).reduce((s: number, c: any) => s + (c.emails_sent || 0), 0);
  const slTotalReplies = (slCampaigns || []).reduce((s: number, c: any) => s + (c.emails_replied || 0), 0);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <PageHeader title="Reporting" subtitle="Outreach trends across HeyReach and Smartlead" />

        {/* Summary badges */}
        <div className="flex gap-3 flex-wrap">
          <Badge variant="secondary" className="px-3 py-1.5 text-xs gap-1.5">
            <TrendingUp className="h-3 w-3 text-blue-400" /> {totalConns} LinkedIn connections
          </Badge>
          <Badge variant="secondary" className="px-3 py-1.5 text-xs gap-1.5">
            <TrendingUp className="h-3 w-3 text-emerald-400" /> {totalReplies} LinkedIn replies
          </Badge>
          <Badge variant="secondary" className="px-3 py-1.5 text-xs gap-1.5">
            <TrendingUp className="h-3 w-3 text-orange-400" /> {slTotalSent.toLocaleString()} emails sent
          </Badge>
          <Badge variant="secondary" className="px-3 py-1.5 text-xs gap-1.5">
            <TrendingUp className="h-3 w-3 text-amber-400" /> {slTotalReplies.toLocaleString()} email replies
          </Badge>
        </div>

        {/* === HeyReach section header === */}
        <div className="flex items-center gap-2.5 pt-2">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center ring-1 ring-white/10 bg-[#0A66C2]/15">
            <BarChart3 className="h-3.5 w-3.5 text-[#6b7a90]" />
          </div>
          <h2 className="text-sm font-heading font-semibold tracking-tight">LinkedIn · HeyReach</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-white/[0.08] to-transparent ml-2" />
        </div>


        {/* Engagement chart */}
        <Card className="glass-card">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              Campaign Engagement
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {isLoading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : chartData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-72 w-full">
                <BarChart data={chartData} barGap={4}>
                  <defs>
                    <linearGradient id="gradConn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="gradReply" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142 71% 45%)" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(142 71% 45%)" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="connections" fill="url(#gradConn)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="connections" position="top" fill="hsl(var(--muted-foreground))" fontSize={10} />
                  </Bar>
                  <Bar dataKey="replies" fill="url(#gradReply)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="replies" position="top" fill="hsl(var(--muted-foreground))" fontSize={10} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No campaign data to chart yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rate comparison chart */}
        {chartData.length > 0 && (
          <Card className="glass-card">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                Conversion Rates
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <ChartContainer config={rateConfig} className="h-64 w-full">
                <BarChart data={chartData} barGap={4}>
                  <defs>
                    <linearGradient id="gradConnRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                    </linearGradient>
                    <linearGradient id="gradReplyRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142 71% 45%)" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="connRate" fill="url(#gradConnRate)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="connRate" position="top" fill="hsl(var(--muted-foreground))" fontSize={10} formatter={(v: number) => `${v}%`} />
                  </Bar>
                  <Bar dataKey="replyRate" fill="url(#gradReplyRate)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="replyRate" position="top" fill="hsl(var(--muted-foreground))" fontSize={10} formatter={(v: number) => `${v}%`} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* === Smartlead section === */}
        <div className="flex items-center gap-2.5 pt-2">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center ring-1 ring-white/10 bg-orange-500/15">
            <BarChart3 className="h-3.5 w-3.5 text-orange-400" />
          </div>
          <h2 className="text-sm font-heading font-semibold tracking-tight">Email · Smartlead</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-white/[0.08] to-transparent ml-2" />
        </div>

        <Card className="glass-card">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-orange-400" />
              </div>
              Email Volume
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {slLoading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : slChartData.length > 0 ? (
              <ChartContainer config={slConfig} className="h-72 w-full">
                <BarChart data={slChartData} barGap={4}>
                  <defs>
                    <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(25 95% 53%)" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(25 95% 53%)" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="gradSlReply" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142 71% 45%)" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(142 71% 45%)" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="sent" fill="url(#gradSent)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="sent" position="top" fill="hsl(var(--muted-foreground))" fontSize={10} />
                  </Bar>
                  <Bar dataKey="replies" fill="url(#gradSlReply)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="replies" position="top" fill="hsl(var(--muted-foreground))" fontSize={10} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No Smartlead data yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {slChartData.length > 0 && (
          <Card className="glass-card">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-orange-400" />
                </div>
                Email Reply Rate
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <ChartContainer config={slRateConfig} className="h-64 w-full">
                <BarChart data={slChartData} barGap={4}>
                  <defs>
                    <linearGradient id="gradSlReplyRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(25 95% 53%)" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="hsl(25 95% 53%)" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="replyRate" fill="url(#gradSlReplyRate)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="replyRate" position="top" fill="hsl(var(--muted-foreground))" fontSize={10} formatter={(v: number) => `${v}%`} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};


export default GTMReporting;
