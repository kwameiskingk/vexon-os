import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Linkedin, Mail, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const heyreachApi = async (action: string, params: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke("heyreach-api", {
    body: { action, ...params },
  });
  if (error) throw error;
  return data;
};

const smartleadApi = async (action: string, params: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke("smartlead-api", {
    body: { action, ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};

const GTMSenders = () => {
  const [useApi, setUseApi] = useState(false);

  // Existing webhook-derived data
  const { data: senders, isLoading: sendersLoading } = useQuery({
    queryKey: ["gtm-senders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gtm_sender_accounts")
        .select("*")
        .order("last_activity_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !useApi,
  });

  // Fallback from events
  const { data: eventSenders } = useQuery({
    queryKey: ["gtm-senders-from-events"],
    enabled: !useApi && !sendersLoading && (!senders || senders.length === 0),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gtm_heyreach_events")
        .select("sender_name, sender_email, received_at")
        .not("sender_name", "is", null)
        .not("sender_name", "eq", "")
        .order("received_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, { sender_name: string; sender_email: string | null; last_activity_at: string }>();
      data?.forEach((e) => {
        if (e.sender_name && !map.has(e.sender_name)) {
          map.set(e.sender_name, { sender_name: e.sender_name, sender_email: e.sender_email, last_activity_at: e.received_at });
        }
      });
      return Array.from(map.values());
    },
  });

  // Per-sender event counts
  const { data: senderStats } = useQuery({
    queryKey: ["gtm-sender-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gtm_heyreach_events").select("sender_name, event_type");
      if (error) throw error;
      const stats: Record<string, { total: number; connections: number; replies: number }> = {};
      data?.forEach((e) => {
        if (!e.sender_name) return;
        if (!stats[e.sender_name]) stats[e.sender_name] = { total: 0, connections: 0, replies: 0 };
        stats[e.sender_name].total++;
        const et = e.event_type?.toLowerCase() || "";
        if (et.includes("accepted") || et.includes("connection")) stats[e.sender_name].connections++;
        if (et.includes("reply") || et.includes("replied")) stats[e.sender_name].replies++;
      });
      return stats;
    },
    enabled: !useApi,
  });

  // Live API senders
  const { data: apiSenders, isLoading: apiLoading, refetch: refetchApi } = useQuery({
    queryKey: ["heyreach-senders-live"],
    queryFn: () => heyreachApi("get-senders"),
    enabled: useApi,
    staleTime: 60 * 1000,
  });

  const syncFromApi = () => {
    setUseApi(true);
    toast.success("Syncing senders from HeyReach...");
  };

  // Build display list
  const displaySenders = useApi
    ? (Array.isArray(apiSenders) ? apiSenders : []).map((s: any) => ({
        id: s.id,
        name: `${s.firstName || ""} ${s.lastName || ""}`.trim() || s.linkedInUrl,
        email: s.email,
        linkedin: s.linkedInUrl,
        status: s.isLoggedIn ? "active" : "inactive",
        warmup: s.warmupEnabled,
        dailyLimit: s.dailyInvitationLimit,
      }))
    : senders && senders.length > 0
    ? senders.map((s) => ({
        id: s.id,
        name: s.sender_name,
        email: s.sender_email,
        linkedin: s.linkedin_url,
        status: s.status,
        warmup: null,
        dailyLimit: null,
      }))
    : (eventSenders || []).map((s, i) => ({
        id: `derived-${i}`,
        name: s.sender_name,
        email: s.sender_email,
        linkedin: null,
        status: "active",
        warmup: null,
        dailyLimit: null,
      }));

  const isLoading = useApi ? apiLoading : sendersLoading;

  // Smartlead email accounts
  const { data: emailAccounts, isLoading: emailLoading, refetch: refetchEmail } = useQuery({
    queryKey: ["gtm-smartlead-email-accounts"],
    queryFn: async () => {
      try {
        const data = await smartleadApi("get-email-accounts");
        return Array.isArray(data) ? data : (data?.data || []);
      } catch (e) {
        console.warn("smartlead email accounts unavailable", e);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Senders" subtitle="LinkedIn and email sender accounts across all channels" />
          <div className="flex items-center gap-2">
            {useApi && (
              <Button variant="ghost" size="sm" onClick={() => refetchApi()}>
                <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
              </Button>
            )}
            <Button variant={useApi ? "secondary" : "default"} size="sm" onClick={syncFromApi}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> {useApi ? "Live" : "Sync Senders"}
            </Button>
          </div>
        </div>

        {/* ============ LinkedIn senders (HeyReach) ============ */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Linkedin className="h-4 w-4 text-[#0A66C2]" />
            <h2 className="text-sm font-heading font-semibold bg-gradient-to-r from-foreground to-[#0A66C2]/80 bg-clip-text text-transparent">
              LinkedIn · HeyReach
            </h2>
            <span className="text-[11px] text-muted-foreground">({displaySenders.length})</span>
          </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-[160px] rounded-2xl" />)}
          </div>
        ) : displaySenders.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displaySenders.map((sender) => {
              const stats = !useApi ? (senderStats?.[sender.name] || { total: 0, connections: 0, replies: 0 }) : null;
              const initials = (sender.name || "?").split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();

              return (
                <div key={sender.id} className="glass-card p-5 group hover-lift">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 flex items-center justify-center text-sm font-heading font-semibold text-primary flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading font-semibold text-foreground text-sm truncate">{sender.name}</h3>
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${sender.status === "active" ? "bg-emerald-400" : "bg-muted-foreground/50"}`} />
                      </div>
                      {sender.email && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {sender.email}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stats — webhook mode shows event counts, API mode shows account details */}
                  {stats ? (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-border/50">
                        <span className="text-lg font-heading font-bold text-foreground tabular-nums">{stats.total}</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Events</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-border/50">
                        <span className="text-lg font-heading font-bold text-blue-400 tabular-nums">{stats.connections}</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Connects</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-border/50">
                        <span className="text-lg font-heading font-bold text-emerald-400 tabular-nums">{stats.replies}</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Replies</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-border/50">
                        <span className="text-sm font-semibold text-foreground">{sender.warmup ? "On" : "Off"}</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Warmup</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-border/50">
                        <span className="text-sm font-semibold text-foreground tabular-nums">{sender.dailyLimit ?? "—"}</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Daily Limit</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <Badge variant={sender.status === "active" ? "default" : "secondary"} className="text-[10px]">
                      {sender.status}
                    </Badge>
                    {sender.linkedin && (
                      <a
                        href={sender.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 transition-colors px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/15"
                      >
                        <Linkedin className="h-3 w-3" /> Profile
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-card p-12 text-center">
            <Users className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No sender accounts detected yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Sync Senders" to pull accounts from HeyReach</p>
          </div>
        )}
        </div>

        {/* ============ Email senders (Smartlead) ============ */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-orange-500" />
            <h2 className="text-sm font-heading font-semibold bg-gradient-to-r from-foreground to-orange-400/80 bg-clip-text text-transparent">
              Email · Smartlead
            </h2>
            <span className="text-[11px] text-muted-foreground">
              ({Array.isArray(emailAccounts) ? emailAccounts.length : 0})
            </span>
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => refetchEmail()}>
              <RefreshCw className={`h-3.5 w-3.5 ${emailLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {emailLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-[140px] rounded-2xl" />)}
            </div>
          ) : Array.isArray(emailAccounts) && emailAccounts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {emailAccounts.map((a: any) => {
                const email = a.from_email || a.email || "—";
                const name = a.from_name || email;
                const warmup = a.warmup_details?.status || (a.warmup_enabled ? "ACTIVE" : "—");
                const dailyLimit = a.message_per_day ?? "—";
                const initials = (name || email).split(/[\s@.]/).filter(Boolean).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join("");
                const isActive = warmup === "ACTIVE";
                return (
                  <div key={a.id || email} className="glass-card p-5 group hover-lift">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-orange-400/25 to-amber-500/10 flex items-center justify-center text-sm font-heading font-semibold text-orange-500 flex-shrink-0">
                        {initials || "@"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-heading font-semibold text-foreground text-sm truncate">{name}</h3>
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isActive ? "bg-emerald-400" : "bg-muted-foreground/50"}`} />
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {email}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-border/50">
                        <span className="text-sm font-semibold text-foreground">{warmup}</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Warmup</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-border/50">
                        <span className="text-sm font-semibold text-foreground tabular-nums">{dailyLimit}</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Daily Limit</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] border-orange-500/40 text-orange-600">
                        Smartlead
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-card p-8 text-center">
              <Mail className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-xs text-muted-foreground">No Smartlead mailboxes available</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default GTMSenders;
