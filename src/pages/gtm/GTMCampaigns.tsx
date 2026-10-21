import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Radio, UserPlus, MessageSquare, Mail, RefreshCw, Play, Pause, Linkedin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const sl = async (action: string, params: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke("smartlead-api", { body: { action, ...params } });
  if (error) throw error;
  return data;
};


const heyreachApi = async (action: string, params: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke("heyreach-api", {
    body: { action, ...params },
  });
  if (error) throw error;
  return data;
};

const GTMCampaigns = () => {
  const queryClient = useQueryClient();
  const [useApi, setUseApi] = useState(false);

  // Webhook-derived data (fallback)
  const { data: webhookCampaigns, isLoading: webhookLoading } = useQuery({
    queryKey: ["gtm-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gtm_campaign_metrics")
        .select("*")
        .order("last_event_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !useApi,
  });

  // Live API data
  const { data: apiCampaigns, isLoading: apiLoading, refetch: refetchApi } = useQuery({
    queryKey: ["heyreach-campaigns-live"],
    queryFn: () => heyreachApi("get-campaigns", { pageSize: 50 }),
    enabled: useApi,
    staleTime: 60 * 1000,
  });

  const syncFromApi = async () => {
    setUseApi(true);
    toast.success("Syncing live data from HeyReach...");
  };

  // Pause/resume mutations
  const pauseMutation = useMutation({
    mutationFn: (campaignId: number) => heyreachApi("pause-campaign", { campaignId }),
    onSuccess: () => { toast.success("Campaign paused"); refetchApi(); },
    onError: (e: any) => toast.error(e.message || "Failed to pause"),
  });

  const resumeMutation = useMutation({
    mutationFn: (campaignId: number) => heyreachApi("resume-campaign", { campaignId }),
    onSuccess: () => { toast.success("Campaign resumed"); refetchApi(); },
    onError: (e: any) => toast.error(e.message || "Failed to resume"),
  });

  const isLoading = useApi ? apiLoading : webhookLoading;
  const liveCampaigns = apiCampaigns?.items || apiCampaigns || [];

  const statusColor = (status: string) => {
    const s = status?.toUpperCase();
    if (s === "ACTIVE" || s === "active") return "bg-emerald-400";
    if (s === "PAUSED" || s === "paused") return "bg-amber-400";
    return "bg-muted-foreground/50";
  };

  // === Smartlead campaigns ===
  const slCampaignsQ = useQuery({
    queryKey: ["gtm-sl-campaigns"],
    queryFn: async () => {
      const data = await sl("get-campaigns");
      return Array.isArray(data) ? data : (data?.data || []);
    },
  });

  const slMetricsQ = useQuery({
    queryKey: ["gtm-sl-campaign-metrics"],
    queryFn: async () => {
      const { data } = await supabase.from("gtm_smartlead_campaign_metrics").select("*");
      const map = new Map<string, any>();
      (data || []).forEach((r: any) => map.set(String(r.smartlead_campaign_id), r));
      return map;
    },
  });

  const slStatusMut = useMutation({
    mutationFn: async ({ id, paused }: { id: any; paused: boolean }) => {
      await sl(paused ? "pause-campaign" : "resume-campaign", { campaign_id: id });
    },
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["gtm-sl-campaigns"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Campaigns" subtitle="HeyReach and Smartlead campaign performance" />
          <div className="flex items-center gap-2">
            {useApi && (
              <Button variant="ghost" size="sm" onClick={() => refetchApi()}>
                <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
              </Button>
            )}
            <Button variant={useApi ? "secondary" : "default"} size="sm" onClick={syncFromApi}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> {useApi ? "Live" : "Sync from HeyReach"}
            </Button>
          </div>
        </div>

        {/* === LinkedIn · HeyReach === */}
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center ring-1 ring-white/10 bg-[#0A66C2]/15">
            <Linkedin className="h-3.5 w-3.5 text-[#6b7a90]" />
          </div>
          <h2 className="text-sm font-heading font-semibold tracking-tight">LinkedIn · HeyReach</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-white/[0.08] to-transparent ml-2" />
        </div>


        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-[200px] rounded-[18px]" />)}
          </div>
        ) : useApi && liveCampaigns.length > 0 ? (
          /* === LIVE API VIEW === */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {liveCampaigns.map((campaign: any) => {
              const stats = campaign.progressStats || {};
              const total = stats.totalLeads || 0;
              const finished = stats.finished || 0;
              const progressPct = total > 0 ? (finished / total) * 100 : 0;
              const status = campaign.status || "UNKNOWN";

              return (
                <Card key={campaign.id} className="glass-card group hover-lift overflow-hidden relative">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColor(status)}`} />
                  <CardContent className="p-5 pl-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-heading font-semibold text-foreground truncate text-sm">
                          {campaign.name || `Campaign ${campaign.id}`}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {total} total leads · {stats.inProgress || 0} in progress
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-2">
                        <Badge variant={status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">
                          {status}
                        </Badge>
                        {status === "ACTIVE" ? (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => pauseMutation.mutate(campaign.id)}
                            disabled={pauseMutation.isPending}
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </Button>
                        ) : status === "PAUSED" ? (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => resumeMutation.mutate(campaign.id)}
                            disabled={resumeMutation.isPending}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 mb-4 text-center">
                      {[
                        { label: "Pending", value: stats.pending || 0 },
                        { label: "In Progress", value: stats.inProgress || 0 },
                        { label: "Finished", value: finished },
                        { label: "Failed", value: stats.failed || 0 },
                      ].map((s) => (
                        <div key={s.label} className="p-2 rounded-lg bg-white/[0.03] border border-border/50">
                          <span className="text-sm font-semibold tabular-nums text-foreground">{s.value}</span>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Progress</span>
                        <span className="text-[10px] font-semibold tabular-nums">{progressPct.toFixed(1)}%</span>
                      </div>
                      <Progress value={progressPct} className="h-1.5" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : !useApi && webhookCampaigns && webhookCampaigns.length > 0 ? (
          /* === WEBHOOK FALLBACK VIEW === */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {webhookCampaigns.map((campaign) => {
              const connRate = campaign.connections_sent
                ? ((campaign.connections_accepted || 0) / campaign.connections_sent * 100) : 0;
              const replyRate = campaign.messages_sent
                ? ((campaign.messages_replied || 0) / campaign.messages_sent * 100) : 0;
              return (
                <Card key={campaign.id} className="glass-card group hover-lift overflow-hidden relative">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${campaign.status === "active" ? "bg-emerald-400" : "bg-muted-foreground/50"}`} />
                  <CardContent className="p-5 pl-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-heading font-semibold text-foreground truncate text-sm">
                          {campaign.campaign_name || campaign.heyreach_campaign_id}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Last activity {campaign.last_event_at ? formatDistanceToNow(new Date(campaign.last_event_at), { addSuffix: true }) : "—"}
                        </p>
                      </div>
                      <Badge variant={campaign.status === "active" ? "default" : "secondary"} className="text-[10px] ml-2">
                        {campaign.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
                          <UserPlus className="h-3.5 w-3.5 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold tabular-nums">{campaign.connections_accepted || 0}<span className="text-muted-foreground font-normal">/{campaign.connections_sent || 0}</span></p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Connections</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                          <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold tabular-nums">{campaign.messages_replied || 0}<span className="text-muted-foreground font-normal">/{campaign.messages_sent || 0}</span></p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Replies</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-purple-500/15 flex items-center justify-center">
                          <Mail className="h-3.5 w-3.5 text-purple-400" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold tabular-nums">{campaign.inmails_replied || 0}<span className="text-muted-foreground font-normal">/{campaign.inmails_sent || 0}</span></p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">InMails</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Acceptance Rate</span>
                          <span className="text-[10px] font-semibold tabular-nums">{connRate.toFixed(1)}%</span>
                        </div>
                        <Progress value={connRate} className="h-1.5" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Reply Rate</span>
                          <span className="text-[10px] font-semibold tabular-nums">{replyRate.toFixed(1)}%</span>
                        </div>
                        <Progress value={replyRate} className="h-1.5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="glass-card">
            <CardContent className="p-5">
              <div className="text-center py-12 text-muted-foreground">
                <Radio className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No campaigns tracked yet</p>
                <p className="text-xs mt-1">Click "Sync from HeyReach" to pull live campaign data</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* === Email · Smartlead === */}
        <div className="flex items-center gap-2.5 pt-2">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center ring-1 ring-white/10 bg-orange-500/15">
            <Mail className="h-3.5 w-3.5 text-orange-400" />
          </div>
          <h2 className="text-sm font-heading font-semibold tracking-tight">Email · Smartlead</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-white/[0.08] to-transparent ml-2" />
        </div>

        {slCampaignsQ.isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2].map(i => <Skeleton key={i} className="h-[160px] rounded-[18px]" />)}
          </div>
        ) : (slCampaignsQ.data || []).length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(slCampaignsQ.data || []).map((c: any) => {
              const m = slMetricsQ.data?.get(String(c.id));
              const sent = m?.emails_sent ?? c.sent_count ?? 0;
              const replies = m?.emails_replied ?? c.replies_count ?? 0;
              const bounces = m?.emails_bounced ?? 0;
              const bouncePct = sent > 0 ? ((bounces / sent) * 100).toFixed(1) : "0.0";
              const replyPct = sent > 0 ? ((replies / sent) * 100).toFixed(1) : "0.0";
              const isActive = c.status === "ACTIVE";
              return (
                <Card key={c.id} className="glass-card group hover-lift overflow-hidden relative">
                  <div className={cn("absolute left-0 top-0 bottom-0 w-1", isActive ? "bg-emerald-400" : "bg-muted-foreground/50")} />
                  <CardContent className="p-5 pl-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-heading font-semibold text-foreground truncate text-sm">{c.name}</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Smartlead · ID {c.id}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge variant={isActive ? "default" : "secondary"} className={cn("text-[10px]", isActive && "bg-emerald-500/15 text-emerald-500 border-emerald-500/30")}>
                          {c.status}
                        </Badge>
                        <Switch
                          checked={isActive}
                          onCheckedChange={(checked) => slStatusMut.mutate({ id: c.id, paused: !checked })}
                          disabled={slStatusMut.isPending}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                      <div className="p-2 rounded-lg bg-white/[0.03] border border-border/50">
                        <span className="text-sm font-semibold tabular-nums">{sent.toLocaleString()}</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Sent</p>
                      </div>
                      <div className="p-2 rounded-lg bg-white/[0.03] border border-border/50">
                        <span className="text-sm font-semibold tabular-nums">{replies.toLocaleString()}</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Replies</p>
                      </div>
                      <div className="p-2 rounded-lg bg-white/[0.03] border border-border/50">
                        <span className="text-sm font-semibold tabular-nums">{bouncePct}%</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Bounce</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Reply Rate</span>
                        <span className="text-[10px] font-semibold tabular-nums">{replyPct}%</span>
                      </div>
                      <Progress value={Number(replyPct)} className="h-1.5" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="glass-card">
            <CardContent className="p-5">
              <div className="text-center py-10 text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No Smartlead campaigns found</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};


export default GTMCampaigns;
