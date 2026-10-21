import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Send, Pause, Play, RefreshCw, Inbox, CheckCircle2, XCircle, HelpCircle, Sparkles, Clock, CalendarPlus, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { smartleadSentiment, JAMES_SETTER_PROFILE_ID } from "@/lib/coldOutbound";
import { useMessageSentiment } from "@/hooks/useMessageSentiment";
import { cn } from "@/lib/utils";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";

const EmailSentimentChip = ({ text }: { text: string }) => {
  const { data, isLoading } = useMessageSentiment(text, { channel: "email" });
  if (isLoading) {
    return <span className="text-[10px] text-muted-foreground/70 italic">analysing…</span>;
  }
  if (!data || data === "unclassified") return null;
  const meta = smartleadSentiment(data);
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border", meta.color)}>
      {meta.dot} {meta.label}
    </span>
  );
};

const sl = async (action: string, params: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke("smartlead-api", {
    body: { action, ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};

/* ============================== INBOX ============================== */

export const InboxTab = () => {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);
  const [replyText, setReplyText] = useState("");
  const [showBookedForm, setShowBookedForm] = useState(false);
  const [bookedForm, setBookedForm] = useState({
    assigned_ae_id: "",
    meeting_date: "",
    meeting_time: "",
    prospect_name: "",
    prospect_job_title: "",
    company_name: "",
    notes: "",
  });

  // List of Account Executives the discovery can be assigned to.
  const aesQ = useQuery({
    queryKey: ["sl-ae-list"],
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["account_executive", "admin"]);
      // Former employees are no longer assignable owners.
      const offboarded = await fetchOffboardedUserIds();
      const ids = Array.from(
        new Set((roleRows || []).map((r: any) => r.user_id).filter((id: string) => !offboarded.has(id)))
      );
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const roleByUser = new Map((roleRows || []).map((r: any) => [r.user_id, r.role]));
      return (profs || [])
        .filter((p: any) => roleByUser.get(p.id) === 'account_executive' || roleByUser.get(p.id) === 'admin')
        .sort((a: any, b: any) => {
          const ra = roleByUser.get(a.id) === 'account_executive' ? 0 : 1;
          const rb = roleByUser.get(b.id) === 'account_executive' ? 0 : 1;
          if (ra !== rb) return ra - rb;
          return (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "");
        });
    },
  });

  // Drive the inbox directly from stored webhook events (Smartlead deprecated the
  // master-inbox endpoint and it now returns 404).
  const eventsQ = useQuery({
    queryKey: ["sl-reply-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gtm_smartlead_events")
        .select("id, campaign_id, sentiment, payload, created_at")
        .eq("event_type", "EMAIL_REPLY")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  const actionedQ = useQuery({
    queryKey: ["sl-actioned"],
    queryFn: async () => {
      const { data } = await supabase.from("smartlead_reply_actions").select("event_id, action");
      return data || [];
    },
  });

  const actionedIds = useMemo(
    () => new Set((actionedQ.data || []).map((r: any) => r.event_id)),
    [actionedQ.data],
  );

  const enriched = useMemo(() => {
    const rows: any[] = [];
    const seen = new Set<string>();
    for (const ev of eventsQ.data || []) {
      const p: any = ev.payload || {};
      const corr = p.leadCorrespondence || {};
      const leadEmail = corr.replyReceivedFrom || corr.targetLeadEmail || p.from_email || "";
      const campaignId = ev.campaign_id ? Number(ev.campaign_id) : (p.campaign_id ? Number(p.campaign_id) : null);
      // Extract numeric lead_id from app_url (?leadMap=...)
      let leadId: number | null = null;
      const urlMatch = typeof p.app_url === "string" ? p.app_url.match(/leadMap=(\d+)/) : null;
      if (urlMatch) leadId = Number(urlMatch[1]);

      // Dedupe by campaign+lead so a noisy lead doesn't fill the inbox
      const key = `${campaignId}::${leadEmail.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const nameFromEmail = leadEmail.split("@")[0]?.replace(/[._-]+/g, " ");
      rows.push({
        _event: ev,
        _actioned: actionedIds.has(ev.id),
        lead_id: leadId,
        lead_email: leadEmail,
        lead_first_name: nameFromEmail,
        lead_last_name: "",
        lead_company: (leadEmail.split("@")[1] || "").split(".")[0] || "",
        campaign_id: campaignId,
        campaign_name: p.campaign_name || (campaignId ? `Campaign ${campaignId}` : ""),
        reply_message_body: p.preview_text || p.reply_body || "",
        reply_time: p.event_timestamp || ev.created_at,
        created_at: ev.created_at,
      });
    }
    return rows;
  }, [eventsQ.data, actionedIds]);

  // Smartlead deprecated the thread endpoint; we render directly from the stored payload.
  const thread = useMemo(() => {
    if (!selected?._event) return [];
    const p: any = selected._event.payload || {};
    return [
      {
        from_email: p.leadCorrespondence?.replyReceivedFrom || selected.lead_email,
        email_body: p.reply_body || p.preview_text || "",
        time: p.event_timestamp || selected._event.created_at,
        subject: p.description || "",
        type: "RECEIVED",
        message_id: p.message_id,
      },
    ];
  }, [selected]);


  const sendReplyMut = useMutation({
    mutationFn: async () => {
      if (!selected?.lead_id) throw new Error("Cannot send reply: missing lead id for this thread.");
      const last: any = thread[thread.length - 1] || {};
      await sl("reply-to-lead", {
        campaign_id: selected.campaign_id,
        lead_id: selected.lead_id,
        email_stats_id: last.stats_id || last.id,
        email_body: replyText,
        reply_message_id: last.message_id,
        reply_email_time: new Date().toISOString(),
        reply_email_body: replyText,
      });
    },
    onSuccess: () => {
      toast.success("Reply sent");
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["sl-thread"] });
    },
    onError: (e: any) => toast.error(`Send failed: ${e.message}`),
  });

  const outcomeMut = useMutation({
    mutationFn: async (action: string) => {
      if (!selected?._event?.id) throw new Error("No matching event for this reply.");
      const { error } = await supabase.from("smartlead_reply_actions").insert({
        event_id: selected._event.id,
        action,
        actioned_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Outcome saved");
      qc.invalidateQueries({ queryKey: ["sl-actioned"] });
      qc.invalidateQueries({ queryKey: ["marketing-overview"] });
      setSelected(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bookedDiscoveryMut = useMutation({
    mutationFn: async () => {
      if (!selected?._event?.id) throw new Error("No matching event.");
      const { assigned_ae_id, meeting_date, meeting_time, prospect_name, prospect_job_title, company_name, notes } = bookedForm;
      if (!assigned_ae_id || !meeting_date || !meeting_time || !prospect_name.trim() || !company_name.trim()) {
        throw new Error("AE, date, time, prospect name and company are required.");
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const { error: mErr } = await supabase.from("meetings").insert({
        prospect_name: prospect_name.trim(),
        prospect_email: selected.lead_email,
        company_name: company_name.trim(),
        prospect_job_title: prospect_job_title.trim() || null,
        meeting_date,
        meeting_time,
        notes: notes.trim() || `Booked from Smartlead reply (${selected.campaign_name || selected.campaign_id}).`,
        setter_id: user.id,
        setter_profile_id: JAMES_SETTER_PROFILE_ID,
        logged_by_setter_id: user.id,
        status: "pending",
        department: "acquisition",
        is_rebook: false,
        lead_type: "video_conference",
        assigned_ae_id,
        appointment_source: "cold_email",
      });
      if (mErr) throw mErr;
      const { error: aErr } = await supabase.from("smartlead_reply_actions").insert({
        event_id: selected._event.id,
        action: "booked",
        actioned_by: user.id,
      });
      if (aErr) throw aErr;
    },
    onSuccess: () => {
      toast.success("Discovery call logged and assigned to AE");
      qc.invalidateQueries({ queryKey: ["sl-actioned"] });
      qc.invalidateQueries({ queryKey: ["marketing-overview"] });
      setShowBookedForm(false);
      setSelected(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Prefill the booked form when a reply is opened.
  const openBookedForm = () => {
    if (!selected) return;
    setBookedForm({
      assigned_ae_id: "",
      meeting_date: "",
      meeting_time: "",
      prospect_name: [selected.lead_first_name, selected.lead_last_name].filter(Boolean).join(" ").trim() || selected.lead_email || "",
      prospect_job_title: "",
      company_name: selected.lead_company || "",
      notes: "",
    });
    setShowBookedForm(true);
  };

  return (
    <>

      <Card className="overflow-hidden border-border/40">
        <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
          <Inbox className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-semibold">Replied Leads</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => eventsQ.refetch()}>
            <RefreshCw className={cn("h-3.5 w-3.5", eventsQ.isFetching && "animate-spin")} />
          </Button>
        </div>
        {eventsQ.isLoading ? (
          <div className="p-4 space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14" />)}</div>
        ) : enriched.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No replies yet</div>
        ) : (
          <div className="divide-y divide-border/30">
            {enriched.map((r: any, idx: number) => {
              const sentiment = smartleadSentiment(r._event?.sentiment);
              const snippet = (r.reply_message_body || r.email_body || r.message || "").replace(/<[^>]+>/g, " ").trim().slice(0, 80);
              const name = [r.lead_first_name, r.lead_last_name].filter(Boolean).join(" ") || r.lead_email || "Unknown";
              return (
                <button
                  key={`${r.lead_id}-${idx}`}
                  onClick={() => { setSelected(r); setReplyText(""); }}
                  className="w-full text-left px-4 py-3 hover:bg-orange-500/5 transition-colors flex items-start gap-3"
                >
                  <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                    r._actioned ? "bg-muted text-muted-foreground" : "bg-orange-500/15 text-orange-600")}>
                    {name[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-medium truncate", r._actioned && "text-muted-foreground")}>{name}</span>
                      {!r._actioned && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border ml-auto shrink-0", sentiment.color)}>
                        {sentiment.dot} {sentiment.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {r.lead_company || r.company || "—"} • {r.campaign_name || `Campaign ${r.campaign_id}`}
                    </div>
                    {snippet && <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{snippet}</div>}
                  </div>
                  {(r.reply_time || r.created_at) && (
                    <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap shrink-0">
                      {formatDistanceToNow(new Date(r.reply_time || r.created_at), { addSuffix: true })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setShowBookedForm(false); } }}>
        <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col">
          <SheetHeader className="px-5 py-4 border-b border-border/30">
            <SheetTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-orange-500" />
              {[selected?.lead_first_name, selected?.lead_last_name].filter(Boolean).join(" ") || selected?.lead_email}
            </SheetTitle>
            <div className="text-xs text-muted-foreground">
              {selected?.lead_email} • {selected?.campaign_name || `Campaign ${selected?.campaign_id}`}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
            {thread.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">No reply content captured.</div>
            )}
            {thread.map((m: any, i: number) => {
              const isFromUs = m.type === "SENT" || m.email_type === "SENT" || m.is_sender;
              const body = m.email_body || m.body || m.message || "";
              return (
                <div key={i} className={cn("rounded-lg p-3 text-sm", isFromUs ? "bg-orange-500/8 border border-orange-500/20 ml-6" : "bg-muted/40 mr-6")}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-between gap-2">
                    <span>{isFromUs ? "Sent" : "Received"} • {m.from || m.from_email || ""}</span>
                    <div className="flex items-center gap-1.5">
                      {!isFromUs && body && <EmailSentimentChip text={body} />}
                      {m.time && <span><Clock className="inline h-2.5 w-2.5 mr-0.5" />{formatDistanceToNow(new Date(m.time), { addSuffix: true })}</span>}
                    </div>
                  </div>
                  {m.subject && <div className="font-semibold text-xs mb-1">{m.subject}</div>}
                  <div className="whitespace-pre-wrap text-xs" dangerouslySetInnerHTML={{ __html: body }} />
                </div>
              );
            })}
          </div>

          {showBookedForm && (
            <div className="border-t border-border/30 px-5 py-4 bg-emerald-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold flex items-center gap-1.5 text-emerald-700">
                  <CalendarPlus className="h-3.5 w-3.5" /> Log discovery call for AE
                </div>
                <button onClick={() => setShowBookedForm(false)} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  Cancel <ChevronUp className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-[11px]">Assigned to Account Executive *</Label>
                  <Select value={bookedForm.assigned_ae_id} onValueChange={(v) => setBookedForm(f => ({ ...f, assigned_ae_id: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={aesQ.isLoading ? "Loading…" : "Select an AE"} /></SelectTrigger>
                    <SelectContent>
                      {(aesQ.data || []).map((ae: any) => (
                        <SelectItem key={ae.id} value={ae.id} className="text-xs">{ae.full_name || ae.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Date *</Label>
                  <Input type="date" className="h-8 text-xs" value={bookedForm.meeting_date} onChange={(e) => setBookedForm(f => ({ ...f, meeting_date: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-[11px]">Time *</Label>
                  <Input type="time" className="h-8 text-xs" value={bookedForm.meeting_time} onChange={(e) => setBookedForm(f => ({ ...f, meeting_time: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-[11px]">Prospect name *</Label>
                  <Input className="h-8 text-xs" value={bookedForm.prospect_name} onChange={(e) => setBookedForm(f => ({ ...f, prospect_name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-[11px]">Job title</Label>
                  <Input className="h-8 text-xs" value={bookedForm.prospect_job_title} onChange={(e) => setBookedForm(f => ({ ...f, prospect_job_title: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label className="text-[11px]">Company *</Label>
                  <Input className="h-8 text-xs" value={bookedForm.company_name} onChange={(e) => setBookedForm(f => ({ ...f, company_name: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label className="text-[11px]">Notes for AE</Label>
                  <Textarea className="text-xs min-h-[60px] resize-none" value={bookedForm.notes} onChange={(e) => setBookedForm(f => ({ ...f, notes: e.target.value }))} placeholder="Context from the reply, prospect priorities…" />
                </div>
              </div>
              <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => bookedDiscoveryMut.mutate()} disabled={bookedDiscoveryMut.isPending}>
                <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
                {bookedDiscoveryMut.isPending ? "Saving…" : "Save discovery & mark booked"}
              </Button>
            </div>
          )}

          <div className="border-t border-border/30 px-5 py-3 space-y-3">
            <Textarea
              placeholder="Type your reply..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <OutcomeBtn icon={CheckCircle2} label="Booked" color="emerald" onClick={openBookedForm} disabled={outcomeMut.isPending || showBookedForm} />
                <OutcomeBtn icon={XCircle} label="Not Booked" color="zinc" onClick={() => outcomeMut.mutate("not_booked")} disabled={outcomeMut.isPending} />
                <OutcomeBtn icon={XCircle} label="Not Interested" color="red" onClick={() => outcomeMut.mutate("not_interested")} disabled={outcomeMut.isPending} />
                <OutcomeBtn icon={Sparkles} label="Needs Nurturing" color="amber" onClick={() => outcomeMut.mutate("needs_nurturing")} disabled={outcomeMut.isPending} />
                <OutcomeBtn icon={HelpCircle} label="More Info" color="blue" onClick={() => outcomeMut.mutate("more_info")} disabled={outcomeMut.isPending} />
              </div>
              <Button size="sm" onClick={() => sendReplyMut.mutate()} disabled={!replyText.trim() || sendReplyMut.isPending} className="bg-orange-500 hover:bg-orange-600">
                <Send className="h-3.5 w-3.5 mr-1.5" /> Send
              </Button>
            </div>
          </div>

        </SheetContent>
      </Sheet>
    </>
  );
};

const OutcomeBtn = ({ icon: Icon, label, color, onClick, disabled }: any) => {
  const map: Record<string, string> = {
    emerald: "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10",
    red: "border-red-500/40 text-red-600 hover:bg-red-500/10",
    amber: "border-amber-500/40 text-amber-600 hover:bg-amber-500/10",
    blue: "border-blue-500/40 text-blue-600 hover:bg-blue-500/10",
    zinc: "border-border text-muted-foreground hover:bg-muted/50",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-50", map[color])}>
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
};

/* ============================== CAMPAIGNS ============================== */

export const CampaignsTab = () => {
  const qc = useQueryClient();
  const campaignsQ = useQuery({
    queryKey: ["sl-campaigns"],
    queryFn: async () => {
      const data = await sl("get-campaigns");
      return Array.isArray(data) ? data : (data?.data || []);
    },
  });

  const metricsQ = useQuery({
    queryKey: ["sl-campaign-metrics"],
    queryFn: async () => {
      const { data } = await supabase.from("gtm_smartlead_campaign_metrics").select("*");
      const map = new Map<string, any>();
      (data || []).forEach((r: any) => map.set(String(r.smartlead_campaign_id), r));
      return map;
    },
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, paused }: { id: any; paused: boolean }) => {
      await sl(paused ? "pause-campaign" : "resume-campaign", { campaign_id: id });
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["sl-campaigns"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="overflow-hidden border-border/40">
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
        <span className="text-sm font-semibold">Campaigns</span>
        <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => campaignsQ.refetch()}>
          <RefreshCw className={cn("h-3.5 w-3.5", campaignsQ.isFetching && "animate-spin")} />
        </Button>
      </div>
      {campaignsQ.isLoading ? (
        <div className="p-4 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Campaign</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Sent</th>
                <th className="text-right px-4 py-2">Replies</th>
                <th className="text-right px-4 py-2">Bounce %</th>
                <th className="text-center px-4 py-2">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {(campaignsQ.data || []).map((c: any) => {
                const m = metricsQ.data?.get(String(c.id));
                const sent = m?.emails_sent ?? c.sent_count ?? 0;
                const replies = m?.emails_replied ?? c.replies_count ?? 0;
                const bounces = m?.emails_bounced ?? 0;
                const bouncePct = sent > 0 ? ((bounces / sent) * 100).toFixed(1) : "0.0";
                const isActive = c.status === "ACTIVE";
                return (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20" : ""}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{sent.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{replies.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{bouncePct}%</td>
                    <td className="px-4 py-2.5 text-center">
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => statusMut.mutate({ id: c.id, paused: !checked })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

/* ============================== EMAIL ACCOUNTS ============================== */

export const EmailAccountsTab = () => {
  const qc = useQueryClient();
  const accountsQ = useQuery({
    queryKey: ["sl-email-accounts"],
    queryFn: async () => sl("get-email-accounts"),
  });

  const mappedQ = useQuery({
    queryKey: ["sl-mapped-accounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("gtm_smartlead_sender_accounts")
        .select("smartlead_account_id, setter_profile_id");
      return data || [];
    },
  });

  const syncMut = useMutation({
    mutationFn: async () => sl("sync-sender-accounts", { setter_profile_id: JAMES_SETTER_PROFILE_ID }),
    onSuccess: (data: any) => {
      toast.success(`Synced ${data?.synced ?? 0} sending accounts`);
      qc.invalidateQueries({ queryKey: ["sl-mapped-accounts"] });
      qc.invalidateQueries({ queryKey: ["sl-email-accounts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const mappedIds = useMemo(
    () => new Set((mappedQ.data || []).filter((r: any) => r.setter_profile_id === JAMES_SETTER_PROFILE_ID).map((r: any) => r.smartlead_account_id)),
    [mappedQ.data],
  );

  return (
    <Card className="overflow-hidden border-border/40">
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
        <span className="text-sm font-semibold">Email Accounts</span>
        <span className="text-xs text-muted-foreground">
          {Array.isArray(accountsQ.data) ? `${accountsQ.data.length} total` : ""}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 border-orange-500/40 text-orange-600 hover:bg-orange-500/10"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncMut.isPending && "animate-spin")} />
          Sync sending accounts
        </Button>
      </div>
      {accountsQ.isLoading ? (
        <div className="p-4 space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10" />)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Email</th>
                <th className="text-left px-4 py-2">Warmup</th>
                <th className="text-right px-4 py-2">Daily limit</th>
                <th className="text-center px-4 py-2">Mapped to Tom</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {(accountsQ.data || []).map((a: any) => {
                const warmup = a.warmup_details?.status || "—";
                const mapped = mappedIds.has(a.id);
                return (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{a.from_email}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={warmup === "ACTIVE" ? "border-emerald-500/40 text-emerald-600" : ""}>
                        {warmup}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{a.message_per_day ?? "—"}</td>
                    <td className="px-4 py-2 text-center">
                      {mapped
                        ? <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30 hover:bg-orange-500/20">✓ Mapped</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">Unmapped</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

/* ============================== PAGE ============================== */

const MarketingEmail = () => {
  const [tab, setTab] = useState("inbox");

  return (
    <MarketingLayout>
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/30 ring-1 ring-white/15">
          <Mail className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] font-bold tracking-tight leading-tight bg-gradient-to-br from-foreground via-foreground to-orange-300/80 bg-clip-text text-transparent">Email · Smartlead</h1>
          <p className="text-[13px] text-muted-foreground">Manage cold email replies, campaigns and sending accounts.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3 bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm">
          <TabsTrigger value="inbox" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500/20 data-[state=active]:to-amber-500/10 data-[state=active]:text-foreground">Inbox</TabsTrigger>
          <TabsTrigger value="campaigns" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500/20 data-[state=active]:to-amber-500/10 data-[state=active]:text-foreground">Campaigns</TabsTrigger>
          <TabsTrigger value="accounts" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500/20 data-[state=active]:to-amber-500/10 data-[state=active]:text-foreground">Email Accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="mt-4"><InboxTab /></TabsContent>
        <TabsContent value="campaigns" className="mt-4"><CampaignsTab /></TabsContent>
        <TabsContent value="accounts" className="mt-4"><EmailAccountsTab /></TabsContent>
      </Tabs>
    </MarketingLayout>
  );
};

export default MarketingEmail;
