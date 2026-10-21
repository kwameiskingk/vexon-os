import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { format, addDays, subDays } from "date-fns";
import {
  CalendarIcon,
  Sparkles,
  Loader2,
  PlayCircle,
  AlertCircle,
  Lightbulb,
  Headphones,
  Info,
  Copy,
  Check,
  Send,
  ArrowRight,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { DateRange } from "react-day-picker";

interface Props {
  setterProfileId: string;
  setterFullName: string;
}

interface FunnelCounts {
  raw?: number;
  too_short?: number;
  non_prospect?: number;
  qualifying?: number;
  analysed?: number;
  already_scored?: number;
}

interface BriefJson {
  verdict?: string;
  funnel?: FunnelCounts;
  patterns?: Array<{ title: string; detail: string; frequency?: string }>;
  recommended_listens?: Array<{ call_id: string; reason: string; what_to_listen_for?: string }>;
  excluded_calls?: Array<{ call_id: string; reason: string; duration_s?: number }>;
  coaching_brief?: Array<{ behaviour: string; why?: string; example_phrase?: string }>;
}

interface BriefRow {
  id: string;
  status: "running" | "done" | "error";
  brief: BriefJson | null;
  error: string | null;
  call_count: number | null;
  date_from: string;
  date_to: string;
  created_at: string;
}

interface PushedItem {
  source_brief_id: string;
  description: string;
}

const recordingUrl = (callId: string) => {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  return `https://${projectId}.supabase.co/functions/v1/close-recording?call_id=${encodeURIComponent(callId)}`;
};

/**
 * Strip artefacts the AI sometimes leaks into prose:
 *  - Close activity IDs like `acti_uk29gut...`
 *  - Section symbols `§` (replaced with "Section " when followed by a number, else removed)
 *  - Stray double-spaces and orphan punctuation left behind
 */
const sanitizeText = (input?: string | null): string => {
  if (!input) return "";
  return input
    .replace(/\bacti_[A-Za-z0-9]+/g, "")
    .replace(/§\s*(\d+)/g, "Section $1")
    .replace(/§/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*,\s*\)/g, ")")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
};

const reasonStyle = (reason: string): string => {
  const r = reason.toLowerCase();
  if (r.includes("too_short") || r.includes("short")) return "bg-muted/40 text-muted-foreground border-border/50";
  if (r.includes("voicemail")) return "bg-blue-500/10 text-blue-300 border-blue-500/30";
  if (r.includes("ai_screener") || r.includes("ai")) return "bg-purple-500/10 text-purple-300 border-purple-500/30";
  if (r.includes("gatekeeper")) return "bg-amber-500/10 text-amber-300 border-amber-500/30";
  if (r.includes("no_transcript") || r.includes("transcript")) return "bg-orange-500/10 text-orange-300 border-orange-500/30";
  return "bg-muted/40 text-muted-foreground border-border/50";
};


export default function CallReviewTab({ setterProfileId, setterFullName }: Props) {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [generating, setGenerating] = useState(false);
  const [activeBriefId, setActiveBriefId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [pushItem, setPushItem] = useState<null | {
    index: number;
    behaviour: string;
    why?: string;
    example_phrase?: string;
  }>(null);

  const briefsQuery = useQuery({
    queryKey: ["call-review-briefs", setterProfileId],
    queryFn: async () => {
      const { data } = await supabase
        .from("call_review_briefs" as any)
        .select("*")
        .eq("setter_profile_id", setterProfileId)
        .order("created_at", { ascending: false })
        .limit(10);
      return (data || []) as unknown as BriefRow[];
    },
  });

  const activeBrief = useMemo(() => {
    const list = briefsQuery.data || [];
    return activeBriefId ? list.find((b) => b.id === activeBriefId) : list[0];
  }, [briefsQuery.data, activeBriefId]);

  // Track which coaching items from the active brief have already been pushed
  const pushedQuery = useQuery({
    queryKey: ["call-review-pushed", activeBrief?.id],
    enabled: !!activeBrief?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("coaching_action_items")
        .select("description, source_brief_id")
        .eq("source_brief_id", activeBrief!.id);
      return (data || []) as unknown as PushedItem[];
    },
  });

  const isPushed = (behaviour: string) =>
    (pushedQuery.data || []).some((p) => p.description.startsWith(behaviour.slice(0, 60)));

  // Realtime: update list when this setter's briefs change
  useEffect(() => {
    const channel = supabase
      .channel(`call-review-briefs-${setterProfileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_review_briefs", filter: `setter_profile_id=eq.${setterProfileId}` },
        () => queryClient.invalidateQueries({ queryKey: ["call-review-briefs", setterProfileId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [setterProfileId, queryClient]);

  const handleGenerate = async () => {
    if (!range?.from || !range?.to) {
      toast({ title: "Pick a date range", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("sdr-call-review-agent", {
        body: {
          setter_profile_id: setterProfileId,
          date_from: format(range.from, "yyyy-MM-dd"),
          date_to: format(range.to, "yyyy-MM-dd"),
        },
      });
      if (error) throw error;
      if (data?.brief_id) setActiveBriefId(data.brief_id);
      toast({ title: "Generating brief", description: "This usually takes 30–90 seconds." });
      await queryClient.invalidateQueries({ queryKey: ["call-review-briefs", setterProfileId] });
    } catch (e: any) {
      toast({ title: "Could not start brief", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Controls */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground mb-1">Date range</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-[260px] justify-start text-left font-normal", !range && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {range?.from
                    ? range.to
                      ? `${format(range.from, "dd MMM")} – ${format(range.to, "dd MMM yyyy")}`
                      : format(range.from, "dd MMM yyyy")
                    : "Pick a range"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={setRange}
                  numberOfMonths={2}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={handleGenerate} disabled={generating} className="gap-2 mt-5">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate brief
          </Button>
          <div className="ml-auto flex items-center gap-2 mt-5">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Live from Close · 30–90s
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setInfoOpen(true)}
              aria-label="How this works"
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      {(briefsQuery.data || []).length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Past briefs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(briefsQuery.data || []).map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveBriefId(b.id)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1.5",
                  activeBrief?.id === b.id
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "border-border/50 text-muted-foreground hover:bg-muted/40",
                )}
              >
                {b.status === "running" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                )}
                {b.status === "error" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                )}
                {format(new Date(b.date_from), "dd MMM")} – {format(new Date(b.date_to), "dd MMM")}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Active brief */}
      {!activeBrief && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No brief yet. Pick a date range and click <span className="font-medium text-foreground">Generate brief</span>.
          </CardContent>
        </Card>
      )}

      {activeBrief?.status === "running" && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-sm font-medium">Analysing {setterFullName}'s calls…</p>
            <p className="text-xs text-muted-foreground mt-1">
              Pulling transcripts from Close and reasoning across them. This usually takes 30–90 seconds.
            </p>
          </CardContent>
        </Card>
      )}

      {activeBrief?.status === "error" && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="text-sm font-medium">Brief failed</p>
              <p className="text-xs text-muted-foreground mt-1">{activeBrief.error || "Unknown error"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {activeBrief?.status === "done" && activeBrief.brief && (
        <BriefView
          brief={activeBrief.brief}
          briefId={activeBrief.id}
          callCount={activeBrief.call_count}
          setterProfileId={setterProfileId}
          isPushed={isPushed}
          onPushClick={(item) => setPushItem(item)}
        />
      )}

      <InfoModal open={infoOpen} onOpenChange={setInfoOpen} />

      {pushItem && activeBrief && (
        <PushToCoachingDialog
          item={pushItem}
          briefId={activeBrief.id}
          setterProfileId={setterProfileId}
          onClose={() => setPushItem(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["call-review-pushed", activeBrief.id] });
            setPushItem(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Info Modal                                                       */
/* ---------------------------------------------------------------- */

function InfoModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            How the Call Review brief works
          </DialogTitle>
          <DialogDescription>
            A quick tour so you know what you're looking at — and what you can't trust yet.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm">
          <Section title="What it does">
            Pick a date range and click <em>Generate brief</em>. An AI assistant pulls every call the
            setter made in that window directly from Close, reads the transcripts, and writes a
            coaching summary.
          </Section>
          <Section title="How it filters the calls">
            Anything under 90 seconds gets dropped (voicemail snippets, hang-ups). The rest gets
            quickly classified — voicemails, IVR/AI screeners, and gatekeeper-only calls are set
            aside. What's left (real prospect conversations) is ranked so the longest, highest-signal
            calls — especially ones that didn't book a meeting — go to the top of the analysis queue.
          </Section>
          <Section title="What you get back">
            A verdict on the period, recurring patterns, 2–3 calls worth listening to (with what to
            listen for), and a short coaching brief grounded in the Fulfilment Setting playbook and
            the scorecard rubric.
          </Section>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-medium text-xs uppercase tracking-wide">
              <AlertCircle className="h-3.5 w-3.5" />
              Work in progress — read this
            </div>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
              <li>
                Calls that come back from Close <strong>without a transcript</strong> are excluded
                automatically — even if the conversation was genuinely good. Always spot-check the
                "Excluded" list; anything over ~2 minutes is worth a listen even if the AI skipped it.
              </li>
              <li>
                The voicemail-vs-prospect classification is fast but not flawless. Use the Recording
                button to override its judgement.
              </li>
              <li>
                Treat the coaching brief as a <strong>starting point</strong> for your 1-to-1, not the
                final word.
              </li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Tip:</strong> a 1-week window works well for weekly
            coaching. Use a 1-day window if you want to debrief a single shift.
          </p>
        </div>
        <DialogFooter className="px-6 py-3 border-t border-border/50">
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
      <p className="text-sm leading-relaxed text-foreground/90">{children}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Push-to-coaching dialog                                          */
/* ---------------------------------------------------------------- */

function PushToCoachingDialog({
  item,
  briefId,
  setterProfileId,
  onClose,
  onSuccess,
}: {
  item: { behaviour: string; why?: string; example_phrase?: string };
  briefId: string;
  setterProfileId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [description, setDescription] = useState(item.behaviour);
  const [notes, setNotes] = useState(
    [item.why, item.example_phrase ? `Example: "${item.example_phrase}"` : null]
      .filter(Boolean)
      .join("\n\n"),
  );
  const [dueDate, setDueDate] = useState<Date>(addDays(new Date(), 7));
  const [saving, setSaving] = useState(false);

  const handlePush = async () => {
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const managerId = userRes?.user?.id;
      if (!managerId) throw new Error("Not signed in");

      // Find or create a session of type 'ai_brief' for this brief
      const { data: existingSession } = await supabase
        .from("coaching_sessions")
        .select("id")
        .eq("setter_profile_id", setterProfileId)
        .eq("manager_user_id", managerId)
        .eq("session_type", "ai_brief")
        .eq("custom_session_label", `AI Call Review Brief · ${briefId.slice(0, 8)}`)
        .maybeSingle();

      let sessionId = existingSession?.id as string | undefined;
      if (!sessionId) {
        const { data: newSession, error: sErr } = await supabase
          .from("coaching_sessions")
          .insert({
            setter_profile_id: setterProfileId,
            manager_user_id: managerId,
            session_type: "ai_brief",
            custom_session_label: `AI Call Review Brief · ${briefId.slice(0, 8)}`,
            session_date: format(new Date(), "yyyy-MM-dd"),
            status: "completed",
            notes: "Auto-created from AI Call Review brief.",
          })
          .select("id")
          .single();
        if (sErr) throw sErr;
        sessionId = newSession.id;
      }

      const fullDescription = notes
        ? `${description}\n\n${notes}`
        : description;

      const { error: aErr } = await supabase
        .from("coaching_action_items")
        .insert({
          coaching_session_id: sessionId!,
          setter_profile_id: setterProfileId,
          manager_user_id: managerId,
          description: fullDescription,
          due_date: format(dueDate, "yyyy-MM-dd"),
          status: "open",
          source: "call_review_brief",
          source_brief_id: briefId,
        });
      if (aErr) throw aErr;

      toast({ title: "Pushed to Coaching", description: "Action item created on the setter's Coaching tab." });
      onSuccess();
    } catch (e: any) {
      toast({ title: "Couldn't push", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Push to Coaching
          </DialogTitle>
          <DialogDescription>
            Adds this as an action item on the setter's Coaching tab.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Due date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dueDate, "dd MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={(d) => d && setDueDate(d)}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handlePush} disabled={saving || !description.trim()} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Push to Coaching
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- */
/* Brief view                                                       */
/* ---------------------------------------------------------------- */

function BriefView({
  brief,
  briefId,
  callCount,
  setterProfileId,
  isPushed,
  onPushClick,
}: {
  brief: BriefJson;
  briefId: string;
  callCount: number | null;
  setterProfileId: string;
  isPushed: (behaviour: string) => boolean;
  onPushClick: (item: {
    index: number;
    behaviour: string;
    why?: string;
    example_phrase?: string;
  }) => void;
}) {
  const f = brief.funnel || {};
  const [showIds, setShowIds] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const stat = (label: string, value?: number) =>
    value !== undefined ? (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border/50 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{value}</span>
      </span>
    ) : null;

  return (
    <div className="space-y-5">
      {/* Verdict + funnel */}
      <Card className="relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary via-primary/60 to-primary/10" />
        <CardHeader className="pb-2 pl-5">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Verdict
          </CardTitle>
          {f.raw !== undefined && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {stat("Raw", f.raw)}
              {stat("Too short", f.too_short)}
              {stat("Voicemail/AI", f.non_prospect)}
              {stat("Analysed", f.analysed ?? callCount ?? undefined)}
              {f.already_scored ? stat("Already QA'd", f.already_scored) : null}
            </div>
          )}
        </CardHeader>
          <CardContent className="pl-5">
            <p className="text-sm leading-relaxed whitespace-pre-line">{sanitizeText(brief.verdict) || "No verdict generated."}</p>
          </CardContent>

      </Card>

      {/* Patterns */}
      {brief.patterns && brief.patterns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recurring patterns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {brief.patterns.map((p, i) => (
              <div key={i} className="p-3 rounded-md border border-border/50 bg-muted/20">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">{sanitizeText(p.title)}</p>
                  {p.frequency && <Badge variant="outline" className="text-xs">{p.frequency}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{sanitizeText(p.detail)}</p>

              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recommended listens */}
      {brief.recommended_listens && brief.recommended_listens.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Headphones className="h-4 w-4 text-primary" />
              Listen to these
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {brief.recommended_listens.map((c, idx) => (
              <div
                key={c.call_id}
                className="p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{sanitizeText(c.reason)}</p>
                    {c.what_to_listen_for && (
                      <div className="mt-2 pl-3 border-l-2 border-primary/40 bg-primary/5 py-1.5 pr-2 rounded-r">
                        <p className="text-xs leading-relaxed">
                          <span className="font-medium text-primary">Listen for:</span>{" "}
                          <span className="text-foreground/80">{sanitizeText(c.what_to_listen_for)}</span>
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        asChild
                        size="sm"
                        className="h-7 gap-1.5"
                      >
                        <a href={recordingUrl(c.call_id)} target="_blank" rel="noreferrer">
                          <PlayCircle className="h-3.5 w-3.5" />
                          Recording
                        </a>
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => copyId(c.call_id)}
                      >
                        {copied === c.call_id ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1 text-[11px]">
                          {copied === c.call_id ? "Copied" : "Copy ID"}
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Coaching brief */}
      {brief.coaching_brief && brief.coaching_brief.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-400" />
              Coaching brief
            </CardTitle>
            <span className="text-[10px] text-muted-foreground">
              Push items to the setter's Coaching tab
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            {brief.coaching_brief.map((c, i) => {
              const pushed = isPushed(c.behaviour);
              return (
                <div key={i} className="p-3 rounded-lg border border-border/50 bg-muted/20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{sanitizeText(c.behaviour)}</p>
                      {c.why && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{sanitizeText(c.why)}</p>}
                      {c.example_phrase && (
                        <p className="text-xs mt-2 italic text-primary/90">"{sanitizeText(c.example_phrase)}"</p>

                      )}
                    </div>
                    {pushed ? (
                      <Badge className="bg-green-500/15 text-green-400 border-green-500/30 gap-1 shrink-0">
                        <Check className="h-3 w-3" />
                        Pushed
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 shrink-0"
                        onClick={() =>
                          onPushClick({
                            index: i,
                            behaviour: c.behaviour,
                            why: c.why,
                            example_phrase: c.example_phrase,
                          })
                        }
                      >
                        <Send className="h-3 w-3" />
                        Push
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Excluded */}
      {brief.excluded_calls && brief.excluded_calls.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-muted-foreground">Excluded from analysis</CardTitle>
            <button
              onClick={() => setShowIds((v) => !v)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showIds ? "Hide IDs" : "Show IDs"}
            </button>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-amber-300/80 bg-amber-500/5 border border-amber-500/20 rounded-md px-2.5 py-1.5 mb-3">
              Calls without a transcript land here automatically — spot-check anything over ~2 minutes.
            </p>
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {brief.excluded_calls.map((c) => (
                <div
                  key={c.call_id}
                  className="flex items-center justify-between gap-2 text-xs p-2 rounded-md border border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded text-[10px] capitalize border shrink-0",
                        reasonStyle(c.reason),
                      )}
                    >
                      {c.reason.replace(/_/g, " ")}
                    </span>
                    {c.duration_s !== undefined && (
                      <span className="text-muted-foreground tabular-nums shrink-0 text-[11px]">
                        {Math.floor(c.duration_s / 60)}m {String(c.duration_s % 60).padStart(2, "0")}s
                      </span>
                    )}
                    {showIds && (
                      <span className="font-mono text-[10px] text-muted-foreground/60 truncate">
                        {c.call_id}
                      </span>
                    )}
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-6 px-2 shrink-0">
                    <a href={recordingUrl(c.call_id)} target="_blank" rel="noreferrer">
                      <PlayCircle className="h-3 w-3" />
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
