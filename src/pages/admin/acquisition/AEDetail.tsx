import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft,
  Phone,
  PhoneForwarded,
  Trophy,
  PoundSterling,
  Target,
  TrendingUp,
  Calendar,
  Star,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ExternalLink,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { getCommissionCycleDates } from "@/utils/commissionCycle";
import { getUniqueConvertedDeals, sumConvertedDealValue } from "@/lib/convertedDeals";

export function AEDetailView({
  aeId,
  backPath = "/admin/sales/ae-management",
  hideCompensation = false,
}: {
  aeId: string | undefined;
  backPath?: string;
  /** Manager mode (sdr_manager): compensation is never shown to managers
   *  (ruling 2026-08-06). RLS already returns nothing from ae_compensation for
   *  them — this flag removes the comp UI (goal progress, base salary,
   *  Settings tab) and the Feedback tab, whose tables managers cannot read,
   *  so nothing renders permanently empty. */
  hideCompensation?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [goalInput, setGoalInput] = useState("");
  const [salaryInput, setSalaryInput] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const { start, end } = getCommissionCycleDates();
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");
  const daysLeft = Math.max(0, differenceInCalendarDays(end, new Date()));
  const totalDays = differenceInCalendarDays(end, start);
  const daysPassed = totalDays - daysLeft;

  // Fetch AE profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["ae-detail-profile", aeId, hideCompensation],
    queryFn: async () => {
      const [profileRes, compRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").eq("id", aeId!).single(),
        hideCompensation
          ? Promise.resolve({ data: null })
          : supabase.from("ae_compensation").select("*").eq("user_id", aeId!).maybeSingle(),
      ]);
      return {
        ...profileRes.data!,
        base_salary: (compRes.data as any)?.base_salary || 0,
        cash_collected_goal: (compRes.data as any)?.cash_collected_goal || 0,
        commission_per_deal: (compRes.data as any)?.commission_per_deal || 0,
        commission_percentage: (compRes.data as any)?.commission_percentage || 0,
      };
    },
    enabled: !!aeId,
  });

  // Load settings inputs once
  if (profile && !settingsLoaded) {
    setSalaryInput(profile.base_salary?.toString() || "0");
    setGoalInput(profile.cash_collected_goal?.toString() || "0");
    setSettingsLoaded(true);
  }

  // Fetch all discovery meetings assigned to this AE in cycle
  const { data: discoveryData, isLoading: discLoading } = useQuery({
    queryKey: ["ae-detail-discoveries", aeId, startStr, endStr],
    queryFn: async () => {
      const { data: meetings } = await supabase
        .from("meetings")
        .select("id, company_name, meeting_date, attendance_status, client_outcome, approved_by_admin, created_at")
        .eq("assigned_ae_id", aeId!)
        .eq("department", "acquisition")
        .gte("meeting_date", startStr)
        .lte("meeting_date", endStr)
        .order("meeting_date", { ascending: false });

      const meetingIds = (meetings || []).map((m) => m.id);
      if (!meetingIds.length) return { meetings: meetings || [], logs: [], pitchCalls: [], discoveryFeedback: [], pitchFeedback: [] };

      const [logsRes, feedbackRes] = await Promise.all([
        supabase
          .from("sales_discovery_logs")
          .select("id, meeting_id, client_name, outcome, client_interest, contract_value, contract_term, follow_up_date, converted_to_client, fathom_url, updated_at, meeting_at")
          .in("meeting_id", meetingIds),
        supabase
          .from("post_discovery_feedback")
          .select("id, discovery_log_id, client_name, summary, icp_fit_score, pain_severity_score, budget_confidence_score, urgency_score, decision_maker_access_score, ae_what_went_well, ae_what_to_improve, status, call_recording_link, admin_commentary, admin_rating")
          .eq("ae_user_id", aeId!),
      ]);

      const logs = logsRes.data || [];
      const logIds = logs.map((l) => l.id);

      let pitchCalls: any[] = [];
      let pitchFeedback: any[] = [];

      if (logIds.length > 0) {
        const [pcRes, pfRes] = await Promise.all([
          supabase
            .from("pitch_calls")
            .select("id, discovery_log_id, client_name, pitch_call_date, status, converted_to_client, contract_value, marked_not_proceeding, has_feedback, updated_at")
            .in("discovery_log_id", logIds),
          supabase
            .from("post_pitch_call_feedback")
            .select("id, pitch_call_id, client_name, summary, proposal_clarity_score, objection_handling_score, closing_confidence_score, decision_timeline_score, competitor_awareness_score, ae_what_went_well, ae_what_to_improve, status, call_recording_link, admin_commentary, admin_rating")
            .eq("ae_user_id", aeId!),
        ]);
        pitchCalls = pcRes.data || [];
        pitchFeedback = pfRes.data || [];
      }

      return { meetings: meetings || [], logs, pitchCalls, discoveryFeedback: feedbackRes.data || [], pitchFeedback };
    },
    enabled: !!aeId,
  });

  // Compute metrics
  const meetings = discoveryData?.meetings || [];
  const logs = discoveryData?.logs || [];
  const pitchCalls = discoveryData?.pitchCalls || [];
  const discoveryFeedback = discoveryData?.discoveryFeedback || [];
  const pitchFeedback = discoveryData?.pitchFeedback || [];

  const totalDiscoveries = meetings.length;
  const satMeetings = meetings.filter((m) => m.attendance_status === "sat").length;
  const noShows = meetings.filter((m) => m.attendance_status === "no_show").length;
  const cancelled = meetings.filter((m) => m.attendance_status === "cancelled").length;

  const logsWithFollowUp = logs.filter((l) => l.follow_up_date);
  const followUpCount = logsWithFollowUp.length;

  const convertedDiscovery = logs.filter(
    (l) => l.converted_to_client && l.updated_at >= `${startStr}T00:00:00` && l.updated_at <= `${endStr}T23:59:59`
  );
  const convertedPitch = pitchCalls.filter(
    (p) => p.converted_to_client && p.updated_at >= `${startStr}T00:00:00` && p.updated_at <= `${endStr}T23:59:59`
  );
  const uniqueDeals = getUniqueConvertedDeals(convertedPitch, convertedDiscovery);
  const dealsClosed = uniqueDeals.length;
  const cashCollected = sumConvertedDealValue(uniqueDeals);

  // Build a lookup for display names from source records
  const dealDisplayData = uniqueDeals.map((deal) => {
    const pitchMatch = convertedPitch.find((p) => p.id === deal.key || `pitch:${p.id}` === deal.key || (deal.discoveryLogId && p.discovery_log_id === deal.discoveryLogId));
    const discoveryMatch = convertedDiscovery.find((d) => d.id === deal.discoveryLogId || `discovery:${d.id}` === deal.key);
    const displayName = pitchMatch?.client_name || discoveryMatch?.client_name || "Unknown";
    return { ...deal, displayName };
  });

  const showUpRate = totalDiscoveries > 0 ? Math.round((satMeetings / totalDiscoveries) * 100) : 0;
  const closeRate = followUpCount > 0 ? Math.round((dealsClosed / followUpCount) * 100) : 0;
  const avgDealSize = dealsClosed > 0 ? Math.round(cashCollected / dealsClosed) : 0;

  const goalPct = (profile?.cash_collected_goal || 0) > 0
    ? Math.min(Math.round((cashCollected / profile!.cash_collected_goal) * 100), 100)
    : 0;
  const dailyPace = daysLeft > 0 && profile?.cash_collected_goal
    ? Math.max(0, Math.round((profile.cash_collected_goal - cashCollected) / daysLeft))
    : 0;

  // Active pipeline (in follow-up, not closed, not marked not proceeding)
  const activePipeline = pitchCalls.filter((p) => !p.converted_to_client && !p.marked_not_proceeding);
  const pipelineValue = activePipeline.reduce((s, p) => s + (p.contract_value || 0), 0);

  // Save settings
  const saveMutation = useMutation({
    mutationFn: async ({ goal, salary }: { goal: number; salary: number }) => {
      const { error } = await supabase
        .from("ae_compensation")
        .upsert(
          { user_id: aeId!, cash_collected_goal: goal, base_salary: salary, updated_at: new Date().toISOString() } as any,
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["ae-detail-profile", aeId] });
      queryClient.invalidateQueries({ queryKey: ["ae-management-cards"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });

  const getOutcomeBadge = (outcome: string | null) => {
    switch (outcome) {
      case "sat": return <Badge className="bg-green-500/10 text-green-600 border-green-200">Sat</Badge>;
      case "no_show": return <Badge variant="destructive">No Show</Badge>;
      case "cancelled": return <Badge variant="secondary">Cancelled</Badge>;
      case "rescheduled": return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">Rescheduled</Badge>;
      default: return <Badge variant="outline">Pending</Badge>;
    }
  };

  const getInterestBadge = (interest: string | null) => {
    switch (interest) {
      case "interested": return <Badge className="bg-green-500/10 text-green-600 border-green-200">Interested</Badge>;
      case "unsure": return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">Unsure</Badge>;
      case "not_interested": return <Badge variant="destructive">Not Interested</Badge>;
      default: return null;
    }
  };

  const avgScore = (fb: any, keys: string[]) => {
    const scores = keys.map((k) => fb[k] || 0);
    return scores.length > 0 ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1) : "0";
  };

  if (profileLoading || discLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 text-center py-20 text-muted-foreground">
        <p>Account Executive not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(backPath)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>
    );
  }

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="p-6 space-y-5">
      {/* Compact header: stats lead the page, not the name banner */}
      <div className="flex items-center gap-3 pb-4 border-b border-[var(--hairline)]">
        <Button variant="ghost" size="icon" onClick={() => navigate(backPath)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 ring-2 ring-brand-500/20 flex items-center justify-center text-brand-700 font-bold text-sm shrink-0">
          {getInitials(profile.full_name || "")}
        </div>
        <div className="min-w-0 flex-1 flex items-baseline gap-2 flex-wrap">
          <h1 className="font-heading text-xl font-bold text-foreground truncate">{profile.full_name}</h1>
          <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
        </div>
        <div className="board-ctl px-[13px] py-[6px] shrink-0">
          <p className="micro-label uppercase text-txt-micro whitespace-nowrap">
            Cycle {format(start, "d MMM")} – {format(end, "d MMM")}
          </p>
          <div className="h-4 w-px bg-[rgba(38,53,107,.1)]" />
          <p className="micro-label text-txt-faint whitespace-nowrap normal-case">{daysLeft}d left</p>
        </div>
      </div>

      {/* KPI strip: one connected band, not seven floating boxes. Colour only
          where it carries meaning (Sat green, No Shows red when present). */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-px rounded-xl overflow-hidden border border-[var(--hairline)] bg-[var(--hairline)] shadow-sm">
        {[
          { label: "Discoveries", value: totalDiscoveries, icon: Phone, iconColor: "text-brand-500", valueColor: "" },
          { label: "Sat", value: satMeetings, icon: CheckCircle2, iconColor: "text-emerald-600", valueColor: "text-emerald-700 dark:text-emerald-500" },
          { label: "No Shows", value: noShows, icon: XCircle, iconColor: noShows > 0 ? "text-rag-crit" : "text-muted-foreground/50", valueColor: noShows > 0 ? "text-rag-crit" : "" },
          { label: "Follow-ups", value: followUpCount, icon: PhoneForwarded, iconColor: "text-muted-foreground/70", valueColor: "" },
          { label: "Closed", value: dealsClosed, icon: Trophy, iconColor: "text-emerald-600", valueColor: dealsClosed > 0 ? "text-emerald-700 dark:text-emerald-500" : "" },
          { label: "Show-up %", value: `${showUpRate}%`, icon: TrendingUp, iconColor: "text-muted-foreground/70", valueColor: "" },
          { label: "Close %", value: `${closeRate}%`, icon: Target, iconColor: "text-muted-foreground/70", valueColor: "" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card px-3 py-3 text-center transition-colors hover:bg-muted/30">
            <kpi.icon className={`h-3.5 w-3.5 mx-auto mb-1.5 ${kpi.iconColor}`} />
            <p className={`font-heading text-2xl font-bold tabular-nums leading-none ${kpi.valueColor || "text-foreground"}`}>{kpi.value}</p>
            <p className="micro-label uppercase text-txt-micro mt-1.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Cash + pipeline: one compact stat band (deal detail lives in the tabs) */}
      <Card className="border-border/50">
        <CardContent className="pt-4 space-y-3">
          <div className={`grid grid-cols-2 ${hideCompensation ? "md:grid-cols-4" : "md:grid-cols-5"} gap-3`}>
            <div className="p-3 rounded-lg bg-emerald-500/[0.06] border-l-2 border-l-emerald-500">
              <p className="micro-label uppercase text-emerald-700 dark:text-emerald-500 flex items-center gap-1">
                <PoundSterling className="h-3 w-3" /> Cash Collected
              </p>
              <p className="font-heading text-2xl font-bold tabular-nums leading-tight mt-1">£{cashCollected.toLocaleString()}</p>
              {!hideCompensation && profile.cash_collected_goal > 0 && (
                <p className="text-[11px] text-muted-foreground">of £{profile.cash_collected_goal.toLocaleString()} goal</p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border-l-2 border-l-border">
              <p className="micro-label uppercase text-txt-micro">Avg Deal</p>
              <p className="font-heading text-2xl font-bold tabular-nums leading-tight mt-1">£{avgDealSize.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-sky-500/[0.05] border-l-2 border-l-sky-500">
              <p className="micro-label uppercase text-sky-700 dark:text-sky-400 flex items-center gap-1">
                <BarChart3 className="h-3 w-3" /> Active Pipeline
              </p>
              <p className="font-heading text-2xl font-bold tabular-nums leading-tight mt-1">{activePipeline.length}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">£{pipelineValue.toLocaleString()} value</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border-l-2 border-l-border">
              <p className="micro-label uppercase text-txt-micro">Days Passed</p>
              <p className="font-heading text-2xl font-bold tabular-nums leading-tight mt-1">{daysPassed}/{totalDays}</p>
            </div>
            {!hideCompensation && (
              <div className="p-3 rounded-lg bg-muted/40 border-l-2 border-l-border">
                <p className="micro-label uppercase text-txt-micro">Base Salary</p>
                <p className="font-heading text-2xl font-bold tabular-nums leading-tight mt-1">£{profile.base_salary.toLocaleString()}</p>
              </div>
            )}
          </div>
          {!hideCompensation && profile.cash_collected_goal > 0 && (
            <>
              <Progress value={goalPct} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{goalPct}% achieved</span>
                <span>£{dailyPace.toLocaleString()}/day needed</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Discoveries, Follow-ups, Feedback, Settings */}
      <Tabs defaultValue="discoveries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="discoveries">Discoveries ({totalDiscoveries})</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups ({pitchCalls.length})</TabsTrigger>
          {!hideCompensation && (
            <TabsTrigger value="feedback">Feedback ({discoveryFeedback.length + pitchFeedback.length})</TabsTrigger>
          )}
          <TabsTrigger value="closed">Closed Deals ({dealsClosed})</TabsTrigger>
          {!hideCompensation && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>

        {/* Discoveries Tab */}
        <TabsContent value="discoveries">
          <Card className="border-border/50">
            <CardContent className="pt-4">
              {meetings.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No discovery meetings this cycle.</p>
              ) : (
                <div className="space-y-2">
                  {meetings.map((m) => {
                    const log = logs.find((l) => l.meeting_id === m.id);
                    return (
                      <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{m.company_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(m.meeting_date), "MMM d, yyyy")}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {getOutcomeBadge(m.attendance_status)}
                          {log && getInterestBadge(log.client_interest)}
                          {log?.converted_to_client && <Badge className="bg-green-600 text-white">Won</Badge>}
                          {log?.follow_up_date && !log.converted_to_client && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              F/U: {format(new Date(log.follow_up_date), "MMM d")}
                            </Badge>
                          )}
                          {log?.contract_value ? (
                            <span className="text-xs font-medium">£{log.contract_value.toLocaleString()}</span>
                          ) : null}
                          {log?.fathom_url && (
                            <a href={log.fathom_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Follow-ups Tab */}
        <TabsContent value="followups">
          <Card className="border-border/50">
            <CardContent className="pt-4">
              {pitchCalls.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No follow-up calls this cycle.</p>
              ) : (
                <div className="space-y-2">
                  {pitchCalls.map((pc) => (
                    <div key={pc.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                      <PhoneForwarded className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{pc.client_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">
                          {pc.pitch_call_date ? format(new Date(pc.pitch_call_date), "MMM d, yyyy") : "No date"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {pc.converted_to_client ? (
                          <Badge className="bg-green-600 text-white">Won</Badge>
                        ) : pc.marked_not_proceeding ? (
                          <Badge variant="destructive">Not Proceeding</Badge>
                        ) : pc.status === "completed" ? (
                          <Badge variant="secondary">Completed</Badge>
                        ) : (
                          <Badge variant="outline">Pending</Badge>
                        )}
                        {pc.contract_value ? (
                          <span className="text-xs font-medium">£{pc.contract_value.toLocaleString()}</span>
                        ) : null}
                        {pc.has_feedback && <MessageSquare className="h-3.5 w-3.5 text-green-500" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feedback Tab */}
        <TabsContent value="feedback">
          <div className="space-y-4">
            {discoveryFeedback.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Discovery Feedback</h3>
                {discoveryFeedback.map((fb) => (
                  <Card key={fb.id} className="border-border/50">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{fb.client_name}</p>
                          <Badge variant={fb.status === "reviewed" ? "default" : "outline"} className="text-xs mt-1">
                            {fb.status === "reviewed" ? "Reviewed" : "Pending Review"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-amber-500" />
                          <span className="font-bold">
                            {avgScore(fb, ["icp_fit_score", "pain_severity_score", "budget_confidence_score", "urgency_score", "decision_maker_access_score"])}
                          </span>
                          <span className="text-xs text-muted-foreground">/10</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{fb.summary}</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">What went well</p>
                          <p className="text-sm">{fb.ae_what_went_well}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">What to improve</p>
                          <p className="text-sm">{fb.ae_what_to_improve}</p>
                        </div>
                      </div>
                      {fb.admin_commentary && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground mb-1">Admin Commentary</p>
                          <p className="text-sm">{fb.admin_commentary}</p>
                          {fb.admin_rating && <p className="text-xs mt-1">Rating: {fb.admin_rating}/10</p>}
                        </div>
                      )}
                      {fb.call_recording_link && (
                        <a href={fb.call_recording_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Call Recording
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {pitchFeedback.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Follow-up Feedback</h3>
                {pitchFeedback.map((fb) => (
                  <Card key={fb.id} className="border-border/50">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{fb.client_name}</p>
                          <Badge variant={fb.status === "reviewed" ? "default" : "outline"} className="text-xs mt-1">
                            {fb.status === "reviewed" ? "Reviewed" : "Pending Review"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-amber-500" />
                          <span className="font-bold">
                            {avgScore(fb, ["proposal_clarity_score", "objection_handling_score", "closing_confidence_score", "decision_timeline_score", "competitor_awareness_score"])}
                          </span>
                          <span className="text-xs text-muted-foreground">/10</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{fb.summary}</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">What went well</p>
                          <p className="text-sm">{fb.ae_what_went_well}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">What to improve</p>
                          <p className="text-sm">{fb.ae_what_to_improve}</p>
                        </div>
                      </div>
                      {fb.admin_commentary && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground mb-1">Admin Commentary</p>
                          <p className="text-sm">{fb.admin_commentary}</p>
                          {fb.admin_rating && <p className="text-xs mt-1">Rating: {fb.admin_rating}/10</p>}
                        </div>
                      )}
                      {fb.call_recording_link && (
                        <a href={fb.call_recording_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Call Recording
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {discoveryFeedback.length === 0 && pitchFeedback.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">No feedback submitted this cycle.</p>
            )}
          </div>
        </TabsContent>

        {/* Closed Deals Tab */}
        <TabsContent value="closed">
          <Card className="border-border/50">
            <CardContent className="pt-4">
              {dealDisplayData.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No closed deals this cycle.</p>
              ) : (
                <div className="space-y-2">
                  {dealDisplayData.map((deal) => (
                    <div key={deal.key} className="flex items-center gap-3 p-3 rounded-lg border border-green-200 bg-green-500/5">
                      <Trophy className="h-4 w-4 text-green-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{deal.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          Closed {deal.updatedAt ? format(new Date(deal.updatedAt), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                      <span className="font-semibold text-green-700">£{(deal.contractValue || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card className="border-border/50 max-w-lg">
            <CardHeader>
              <CardTitle className="text-base">AE Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Base Salary (£)</Label>
                <Input type="number" value={salaryInput} onChange={(e) => setSalaryInput(e.target.value)} placeholder="e.g. 30000" />
              </div>
              <div className="space-y-2">
                <Label>Cash Collected Goal (£)</Label>
                <Input type="number" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="e.g. 50000" />
                <p className="text-xs text-muted-foreground">
                  Target for current cycle ({format(start, "MMM d")} – {format(end, "MMM d")})
                </p>
              </div>
              <Button
                onClick={() => saveMutation.mutate({ goal: parseFloat(goalInput) || 0, salary: parseFloat(salaryInput) || 0 })}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AEDetail() {
  const { aeId } = useParams<{ aeId: string }>();

  return (
    <DashboardLayout role="admin">
      <AEDetailView aeId={aeId} />
    </DashboardLayout>
  );
}
