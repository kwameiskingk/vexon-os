import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Linkedin, Activity, AlertCircle, Inbox, Radio, Megaphone, Target, CalendarCheck2 } from "lucide-react";
import { formatDistanceToNow, startOfDay, startOfWeek } from "date-fns";
import { Link } from "react-router-dom";
import { smartleadSentiment } from "@/lib/coldOutbound";
import { useMarketingLeads, MarketingLead } from "@/hooks/useMarketingLeads";
import { cn } from "@/lib/utils";

const startToday = () => startOfDay(new Date()).toISOString();
const startThisWeek = () => startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

const useOverviewData = () => {
  return useQuery({
    queryKey: ["marketing-overview"],
    refetchInterval: 60_000,
    queryFn: async () => {
      // Email (Smartlead) retired from the hub 2026-08-26 — HeyReach only.
      const [
        hrMetrics,
        hrEventsActioned,
        recentHr,
      ] = await Promise.all([
        supabase.from("gtm_campaign_metrics").select("connections_sent, messages_sent, messages_replied, updated_at"),
        supabase.from("heyreach_reply_actions").select("event_id"),
        supabase.from("gtm_heyreach_events").select("id, event_type, payload, received_at, campaign_id, campaign_name, prospect_name, sender_name").order("received_at", { ascending: false }).limit(10),
      ]);

      const linkedinTouches = (hrMetrics.data || []).reduce(
        (s, r: any) => s + (r.connections_sent || 0) + (r.messages_sent || 0),
        0,
      );

      // For Active HeyReach campaign count: distinct heyreach_campaign_ids active in the last 30 days
      const { data: hrCampaignRows } = await supabase
        .from("gtm_campaign_metrics")
        .select("heyreach_campaign_id, updated_at")
        .gte("updated_at", new Date(Date.now() - 30 * 86400_000).toISOString());
      const activeHr = new Set((hrCampaignRows || []).map((r: any) => r.heyreach_campaign_id)).size;

      const hrActionedIds = new Set((hrEventsActioned.data || []).map((r: any) => r.event_id));

      // For accurate unactioned counts, pull recent reply events and exclude actioned
      const { data: hrReplyEvents } = await supabase
        .from("gtm_heyreach_events")
        .select("id, event_type")
        .ilike("event_type", "%repl%")
        .order("received_at", { ascending: false })
        .limit(500);

      const hrUnactioned = (hrReplyEvents || []).filter((e: any) => !hrActionedIds.has(e.id)).length;

      return {
        linkedinTouches,
        activeHr,
        hrUnactioned,
        recentHr: recentHr.data || [],
      };
    },
  });
};

const StatCard = ({ icon: Icon, label, value, accent, gradient }: any) => (
  <Card className={cn(
    "relative p-5 border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-xl overflow-hidden group hover:border-orange-500/40 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-500/10",
  )}>
    <div className={cn("absolute -top-12 -right-12 h-32 w-32 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500", gradient || "bg-orange-500/30")} />
    <div className="relative flex items-start justify-between">
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">{label}</div>
        <div className="text-[28px] font-bold mt-2 tabular-nums tracking-tight">{value}</div>
      </div>
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-white/10 backdrop-blur-sm", accent || "bg-orange-500/15 text-orange-400")}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
  </Card>
);

const MarketingOverview = () => {
  const { data, isLoading } = useOverviewData();
  const { data: leadRows } = useMarketingLeads();

  const today = startToday();
  const week = startThisWeek();
  const leadStats = (source: MarketingLead["source"]) => {
    const rows = (leadRows || []).filter((l) => l.source === source);
    return {
      today: rows.filter((l) => l.created_at >= today).length,
      week: rows.filter((l) => l.created_at >= week).length,
    };
  };
  const ads = leadStats("meta_ads");
  const hr = leadStats("heyreach");
  const latestLeads = (leadRows || []).slice(0, 5);

  return (
    <MarketingLayout>
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-gradient-to-r from-orange-500/15 to-amber-500/5 border border-orange-500/25 text-[10px] uppercase tracking-[0.18em] font-semibold text-orange-400">
          <span className="h-1 w-1 rounded-full bg-orange-400 animate-pulse" /> Live • refreshes every 60s
        </div>
        <h1 className="text-[34px] font-bold tracking-tight leading-tight bg-gradient-to-br from-foreground via-foreground to-orange-300/80 bg-clip-text text-transparent">
          Marketing Hub
        </h1>
        <p className="text-sm text-muted-foreground">New leads from the ads funnel and HeyReach, plus real-time LinkedIn outreach KPIs.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/marketing/leads">
          <StatCard icon={Megaphone} label="New leads — Ads (today / week)" value={`${ads.today} / ${ads.week}`} gradient="bg-orange-500/30" />
        </Link>
        <Link to="/marketing/leads">
          <StatCard icon={Target} label="New leads — HeyReach (today / week)" value={`${hr.today} / ${hr.week}`} accent="bg-[#0A66C2]/15 text-[#6b7a90]" gradient="bg-[#0A66C2]/30" />
        </Link>
      </div>

      {latestLeads.length > 0 && (
        <Card className="p-0 border-white/[0.06] overflow-hidden bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-xl">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 bg-white/[0.02]">
            <Target className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-semibold tracking-tight">Latest leads</span>
            <Link to="/marketing/leads" className="ml-auto text-[11px] font-semibold text-orange-400 hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {latestLeads.map((l) => (
              <Link key={l.id} to="/marketing/leads" className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                {!l.seen_at && <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium truncate block">{l.name || l.email || "Unknown"}</span>
                  <span className="text-[11px] text-muted-foreground truncate block">
                    {(l.source === "meta_ads" ? "Ads" : "HeyReach")}{l.company_name ? ` • ${l.company_name}` : ""}
                  </span>
                </div>
                {l.outcome === "meeting_booked" && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-violet-500/15 text-violet-400 border-violet-500/30 font-semibold shrink-0">
                    <CalendarCheck2 className="h-3 w-3" /> Booked
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap shrink-0">
                  {formatDistanceToNow(new Date(l.submitted_at || l.created_at), { addSuffix: true })}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <StatCard icon={Linkedin} label="LinkedIn touches (total)" value={data?.linkedinTouches?.toLocaleString() ?? 0} accent="bg-[#0A66C2]/15 text-[#6b7a90]" gradient="bg-[#0A66C2]/30" />
            <StatCard icon={Radio} label="Active HeyReach campaigns" value={data?.activeHr ?? 0} accent="bg-[#0A66C2]/15 text-[#6b7a90]" gradient="bg-[#0A66C2]/30" />
          </div>

          <Card className="relative overflow-hidden p-5 border-orange-500/30 bg-gradient-to-br from-orange-500/[0.08] via-orange-500/[0.03] to-transparent backdrop-blur-xl">
            <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-orange-500/20 blur-3xl" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/30 ring-1 ring-white/15">
                  <AlertCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">Unactioned replies</div>
                  <div className="text-3xl font-bold mt-0.5 tabular-nums bg-gradient-to-r from-foreground to-orange-300 bg-clip-text text-transparent">{data?.hrUnactioned ?? 0}</div>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground space-y-1">
                <div>HeyReach (LinkedIn)</div>
              </div>
            </div>
          </Card>

          {/* Activity Feed */}
          <FeedCard title="HeyReach activity" icon={Linkedin} accent="text-[#6b7a90]" events={data?.recentHr || []} kind="hr" />
        </>
      )}
    </MarketingLayout>
  );
};

const FeedCard = ({ title, icon: Icon, accent, events, kind }: any) => (
  <Card className="p-0 border-white/[0.06] overflow-hidden bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-xl">
    <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 bg-white/[0.02]">
      <Icon className={cn("h-4 w-4", accent)} />
      <span className="text-sm font-semibold tracking-tight">{title}</span>
      <span className="ml-auto text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">Last 10</span>
    </div>
    <div className="divide-y divide-white/[0.04] max-h-[420px] overflow-auto">
      {events.length === 0 && (
        <div className="p-6 text-center text-xs text-muted-foreground">No recent activity</div>
      )}
      {events.map((e: any) => {
        const payload = e.payload || {};
        const leadName = e.prospect_name || payload.lead_name || payload.first_name || payload.lead?.first_name ||
          (payload.lead_email ?? payload.email ?? payload.to_email ?? "Unknown");
        const campaignName = e.campaign_name || payload.campaign_name || payload.campaign?.name || e.campaign_id || "—";
        const sentiment = kind === "sl" ? smartleadSentiment(e.sentiment) : null;
        const ts = e.received_at || e.created_at;
        return (
          <div key={e.id} className="px-4 py-2.5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{leadName}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {e.event_type} • {campaignName}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {sentiment && (
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", sentiment.color)}>
                    {sentiment.dot} {sentiment.label}
                  </span>
                )}
                {ts && <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                  {formatDistanceToNow(new Date(ts), { addSuffix: true })}
                </span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </Card>
);

export default MarketingOverview;
