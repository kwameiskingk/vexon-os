import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { useGreeting } from "@/hooks/useGreeting";
import { formatDistanceToNow } from "date-fns";
import { Linkedin, Mail, RefreshCw, Radio, UserPlus, MessageSquare, Activity, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { smartleadSentiment } from "@/lib/coldOutbound";
import { cn } from "@/lib/utils";

const heyreachApi = async (action: string, params: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke("heyreach-api", {
    body: { action, ...params },
  });
  if (error) throw error;
  return data;
};

const eventTypeStyles: Record<string, { label: string; dotColor: string }> = {
  connection_request_accepted: { label: "Connected", dotColor: "bg-blue-400" },
  connection_accepted: { label: "Connected", dotColor: "bg-blue-400" },
  reply: { label: "Replied", dotColor: "bg-emerald-400" },
  replied: { label: "Replied", dotColor: "bg-emerald-400" },
  message_reply: { label: "Reply", dotColor: "bg-emerald-400" },
  inmail_reply: { label: "InMail Reply", dotColor: "bg-purple-400" },
  connection_request_sent: { label: "Request Sent", dotColor: "bg-sky-400" },
  message_sent: { label: "Message Sent", dotColor: "bg-muted-foreground" },
  inmail_sent: { label: "InMail Sent", dotColor: "bg-muted-foreground" },
};

const getStyle = (eventType: string) => {
  const key = (eventType || "").toLowerCase().replace(/\s+/g, "_");
  for (const [k, v] of Object.entries(eventTypeStyles)) {
    if (key.includes(k)) return v;
  }
  return { label: eventType, dotColor: "bg-muted-foreground" };
};

const GTMDashboard = () => {
  const { fullGreeting } = useGreeting();
  const [useApi, setUseApi] = useState(false);

  // === HeyReach: live API stats ===
  const { data: apiStats, isLoading: apiStatsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["heyreach-overall-stats"],
    queryFn: () => heyreachApi("get-overall-stats"),
    enabled: useApi,
    staleTime: 60 * 1000,
  });

  // === HeyReach webhook metrics ===
  const { data: hrMetrics, isLoading: hrMetricsLoading } = useQuery({
    queryKey: ["gtm-campaign-metrics-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gtm_campaign_metrics").select("*");
      if (error) throw error;
      return data || [];
    },
    enabled: !useApi,
  });

  const { data: hrSenders } = useQuery({
    queryKey: ["gtm-sender-accounts-count"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gtm_sender_accounts").select("id, status");
      if (error) throw error;
      return data || [];
    },
  });

  // === Smartlead campaign metrics ===
  const { data: slMetrics, isLoading: slMetricsLoading } = useQuery({
    queryKey: ["gtm-smartlead-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gtm_smartlead_campaign_metrics")
        .select("emails_sent, emails_replied, emails_bounced, smartlead_campaign_id");
      if (error) throw error;
      return data || [];
    },
  });

  // === Smartlead live campaigns (for active count) ===
  const { data: slLiveCampaigns } = useQuery({
    queryKey: ["gtm-smartlead-campaigns-live"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("smartlead-api", { body: { action: "get-campaigns" } });
      return Array.isArray(data) ? data : (data?.data || []);
    },
    staleTime: 60_000,
  });

  // === Merged recent activity (HR + SL) ===
  const { data: recentEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ["gtm-recent-events-merged"],
    queryFn: async () => {
      const [hr, sl] = await Promise.all([
        supabase
          .from("gtm_heyreach_events")
          .select("id, event_type, payload, received_at, campaign_id, campaign_name, prospect_name, prospect_company, prospect_linkedin_url, sender_name")
          .order("received_at", { ascending: false })
          .limit(15),
        supabase
          .from("gtm_smartlead_events")
          .select("id, event_type, payload, sentiment, created_at, campaign_id, lead_id")
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

      const items: any[] = [];
      (hr.data || []).forEach((e: any) => items.push({ ...e, _ts: e.received_at, _channel: "linkedin" }));
      (sl.data || []).forEach((e: any) => items.push({ ...e, _ts: e.created_at, _channel: "email" }));
      items.sort((a, b) => new Date(b._ts).getTime() - new Date(a._ts).getTime());
      return items.slice(0, 15);
    },
  });

  const syncStats = () => {
    setUseApi(true);
    toast.success("Syncing live stats from HeyReach...");
  };

  // === Compute metrics ===
  let hrReplies = 0, hrConnAccepted = 0, hrConnSent = 0, hrMsgSent = 0;
  if (useApi && apiStats) {
    hrReplies = apiStats.messagesReplied || 0;
    hrConnAccepted = apiStats.connectionRequestsAccepted || 0;
    hrConnSent = apiStats.connectionRequestsSent || 0;
    hrMsgSent = apiStats.messagesSent || 0;
  } else {
    hrReplies = (hrMetrics || []).reduce((s, c: any) => s + (c.messages_replied || 0) + (c.inmails_replied || 0), 0);
    hrConnAccepted = (hrMetrics || []).reduce((s, c: any) => s + (c.connections_accepted || 0), 0);
    hrConnSent = (hrMetrics || []).reduce((s, c: any) => s + (c.connections_sent || 0), 0);
    hrMsgSent = (hrMetrics || []).reduce((s, c: any) => s + (c.messages_sent || 0), 0);
  }
  const connRate = hrConnSent > 0 ? ((hrConnAccepted / hrConnSent) * 100).toFixed(1) : "0";
  const replyRate = hrMsgSent > 0 ? ((hrReplies / hrMsgSent) * 100).toFixed(1) : "0";
  const hrActiveCampaigns = (hrMetrics || []).filter((c: any) => c.status === "active").length;
  const hrActiveSenders = (hrSenders || []).filter((s: any) => s.status === "active").length;

  const slEmailsSent = (slMetrics || []).reduce((s, r: any) => s + (r.emails_sent || 0), 0);
  const slReplies = (slMetrics || []).reduce((s, r: any) => s + (r.emails_replied || 0), 0);
  const slBounces = (slMetrics || []).reduce((s, r: any) => s + (r.emails_bounced || 0), 0);
  const slReplyRate = slEmailsSent > 0 ? ((slReplies / slEmailsSent) * 100).toFixed(1) : "0";
  const slActiveCampaigns = (slLiveCampaigns || []).filter((c: any) => c.status === "ACTIVE").length;

  const isLoading = (useApi ? apiStatsLoading : hrMetricsLoading) || slMetricsLoading;

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <div className="space-y-6">
          {/* Hero header */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent p-6 backdrop-blur-xl">
            <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-[#0A66C2]/15 blur-3xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/25 text-[10px] uppercase tracking-[0.18em] font-semibold text-primary">
                  <span className="h-1 w-1 rounded-full bg-primary animate-pulse" /> GTM Command Centre
                </div>
                <h1 className="text-[28px] font-heading font-bold tracking-tight leading-tight bg-gradient-to-br from-foreground via-foreground to-primary/80 bg-clip-text text-transparent">
                  {fullGreeting}
                </h1>
                <p className="text-sm text-muted-foreground">
                  LinkedIn (HeyReach) + Email (Smartlead) · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {useApi && (
                  <Button variant="ghost" size="sm" onClick={() => refetchStats()}>
                    <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
                  </Button>
                )}
                <Button variant={useApi ? "secondary" : "default"} size="sm" onClick={syncStats}>
                  <RefreshCw className="h-4 w-4 mr-1.5" /> {useApi ? "Live Stats" : "Pull Live Stats"}
                </Button>
              </div>
            </div>
          </div>

          {/* LinkedIn (HeyReach) section */}
          <section className="space-y-3">
            <SectionHeader icon={Linkedin} title="LinkedIn · HeyReach" accent="text-[#6b7a90]" tint="bg-[#0A66C2]/15" />
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {isLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-2xl" />) : (
                <>
                  <MetricTile label="Replies" value={hrReplies.toLocaleString()} />
                  <MetricTile label="Connections" value={hrConnAccepted.toLocaleString()} />
                  <MetricTile label="Connection Rate" value={`${connRate}%`} />
                  <MetricTile label="Reply Rate" value={`${replyRate}%`} />
                  <MetricTile label="Campaigns" value={hrActiveCampaigns} />
                  <MetricTile label="Senders" value={hrActiveSenders} />
                </>
              )}
            </div>
          </section>

          {/* Email (Smartlead) section */}
          <section className="space-y-3">
            <SectionHeader icon={Mail} title="Email · Smartlead" accent="text-orange-400" tint="bg-orange-500/15" />
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {isLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-2xl" />) : (
                <>
                  <MetricTile label="Emails Sent" value={slEmailsSent.toLocaleString()} />
                  <MetricTile label="Replies" value={slReplies.toLocaleString()} />
                  <MetricTile label="Reply Rate" value={`${slReplyRate}%`} />
                  <MetricTile label="Bounces" value={slBounces.toLocaleString()} />
                  <MetricTile label="Active Campaigns" value={slActiveCampaigns} />
                  <MetricTile label="Total Campaigns" value={(slLiveCampaigns || []).length} />
                </>
              )}
            </div>
          </section>

          {/* Recent Activity (merged) */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h2 className="text-base font-heading font-semibold text-foreground">Recent Activity</h2>
              </div>
              {recentEvents && (
                <Badge variant="secondary" className="text-[10px] tabular-nums">{recentEvents.length} events</Badge>
              )}
            </div>

            {eventsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[68px] rounded-2xl" />)}
              </div>
            ) : recentEvents && recentEvents.length > 0 ? (
              <div className="space-y-1.5">
                {recentEvents.map((event: any) => {
                  if (event._channel === "linkedin") {
                    const style = getStyle(event.event_type);
                    return (
                      <div key={`hr-${event.id}`} className="glass-card p-4 flex items-center gap-4 group hover:bg-white/[0.06] transition-all">
                        <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${style.dotColor}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">{event.prospect_name || "Unknown"}</span>
                            {event.prospect_company && (
                              <span className="text-xs text-muted-foreground truncate hidden sm:inline">at {event.prospect_company}</span>
                            )}
                            <Badge variant="outline" className="text-[9px] gap-1 border-[#0A66C2]/30 text-[#6b7a90] bg-[#0A66C2]/10 ml-1 px-1.5 py-0">
                              <Linkedin className="h-2.5 w-2.5" /> LinkedIn
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-muted-foreground">{style.label}</span>
                            {event.campaign_name && <span className="text-[11px] text-muted-foreground truncate">· {event.campaign_name}</span>}
                            {event.sender_name && <span className="text-[11px] text-muted-foreground hidden md:inline">· via {event.sender_name}</span>}
                          </div>
                        </div>
                        {event.prospect_linkedin_url && (
                          <a href={event.prospect_linkedin_url} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors opacity-0 group-hover:opacity-100">
                            <Linkedin className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                          {formatDistanceToNow(new Date(event._ts), { addSuffix: true })}
                        </span>
                      </div>
                    );
                  }
                  // Smartlead row
                  const payload = event.payload || {};
                  const leadName = payload.lead_name || payload.first_name || payload.lead?.first_name ||
                    payload.lead_email || payload.email || payload.to_email || "Unknown";
                  const campaignName = payload.campaign_name || payload.campaign?.name || event.campaign_id || "—";
                  const sentiment = smartleadSentiment(event.sentiment);
                  const isReply = (event.event_type || "").toLowerCase().includes("repl");
                  return (
                    <div key={`sl-${event.id}`} className="glass-card p-4 flex items-center gap-4 group hover:bg-white/[0.06] transition-all">
                      <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${isReply ? "bg-orange-400" : "bg-amber-400/60"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{leadName}</span>
                          <Badge variant="outline" className="text-[9px] gap-1 border-orange-500/30 text-orange-400 bg-orange-500/10 ml-1 px-1.5 py-0">
                            <Mail className="h-2.5 w-2.5" /> Email
                          </Badge>
                          {event.sentiment && (
                            <span className={cn("text-[9px] px-1.5 py-0 rounded border", sentiment.color)}>
                              {sentiment.dot} {sentiment.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">{event.event_type}</span>
                          <span className="text-[11px] text-muted-foreground truncate">· {campaignName}</span>
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {formatDistanceToNow(new Date(event._ts), { addSuffix: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="glass-card p-12 text-center">
                <AlertCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No events received yet</p>
                <p className="text-xs text-muted-foreground mt-1">HeyReach and Smartlead activity will surface here</p>
              </div>
            )}
          </section>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

const SectionHeader = ({ icon: Icon, title, accent, tint }: any) => (
  <div className="flex items-center gap-2.5">
    <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center ring-1 ring-white/10", tint)}>
      <Icon className={cn("h-3.5 w-3.5", accent)} />
    </div>
    <h2 className="text-sm font-heading font-semibold tracking-tight text-foreground">{title}</h2>
    <div className="flex-1 h-px bg-gradient-to-r from-white/[0.08] to-transparent ml-2" />
  </div>
);

const MetricTile = ({ label, value }: { label: string; value: string | number }) => (
  <div className="glass-card p-4 flex flex-col justify-between hover:border-white/[0.12] transition-colors">
    <span className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] font-semibold">{label}</span>
    <span className="text-2xl font-heading font-bold text-foreground mt-1 tabular-nums">{value}</span>
  </div>
);

export default GTMDashboard;
