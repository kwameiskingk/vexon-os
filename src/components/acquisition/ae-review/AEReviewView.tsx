import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { firstOfMonth, toISODate } from "@/lib/workWeek";
import {
  WINDOW_KIND_LABELS,
  resolveReviewWindow,
  useReviewBrief,
  useSetterReviews,
  type ReviewWindowKind,
  WINDOW_ANCHOR_LABELS,
  completedWorkWeeks,
  workWeekKey,
  workWeekLabel,
} from "@/hooks/useSetterReview";
import { generateAEReview, useReviewAEs, type ReviewAE } from "@/hooks/useAEReview";
import { AEReviewContent } from "./AEReviewContent";
import { AnimatedReviewShell } from "@/components/ops-command/performance-review/AnimatedReviewShell";
import { Switch } from "@/components/ui/switch";
import { resolveReviewTheme } from "@/lib/reviewThemes";

/**
 * AE monthly review surface (Batch B, 2026-07-28). Same skeleton as
 * PerformanceReviewView; admin/dev/ops only per ruling — no AE self-view,
 * no manager view (route-gated AND generate-gated here; RLS enforces reads).
 * The reviews/brief queries are the role-agnostic ones from useSetterReview
 * (they key on reviewee + window, not role).
 */

function completedMonths(): Date[] {
  const now = new Date();
  const months: Date[] = [];
  for (let i = 1; i <= 12; i++) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return months;
}

const monthKey = (d: Date) => toISODate(firstOfMonth(d));
const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export function AEReviewView({ managerScope = false }: { managerScope?: boolean } = {}) {
  const { userRoles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const months = useMemo(completedMonths, []);
  const [monthISO, setMonthISO] = useState<string>(() => monthKey(months[0]));
  const [windowKind, setWindowKind] = useState<ReviewWindowKind>("month");
  const weeks = useMemo(() => completedWorkWeeks(), []);
  const [weekISO, setWeekISO] = useState<string>(() => workWeekKey(weeks[0]));
  const [aeUserId, setAeUserId] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  // managerScope: the sdr_manager mount (Nadia's portal) — the picker is
  // filtered to genuine AEs (with an include-former toggle) and generation
  // opens to sdr_manager; RLS + the edge function enforce the acquisition
  // scope server-side. The admin mount keeps the unfiltered list.
  const [includeFormer, setIncludeFormer] = useState(false);
  const aesQuery = useReviewAEs();
  const aes = useMemo(() => {
    const all = aesQuery.data ?? [];
    if (!managerScope) return all;
    return all.filter(
      (a) => a.is_test_account !== true && (includeFormer || a.active !== false),
    );
  }, [aesQuery.data, managerScope, includeFormer]);
  const ae: ReviewAE | undefined = aes.find((a) => a.user_id === aeUserId);

  const canGenerate = (userRoles || []).some(
    (r) => r === "admin" || r === "dev" || r === "ops" || (managerScope && r === "sdr_manager"),
  );

  const reviewWindow = useMemo(
    () =>
      resolveReviewWindow(
        windowKind,
        new Date(`${windowKind === "week" ? weekISO : monthISO}T00:00:00`),
      ),
    [windowKind, monthISO, weekISO],
  );

  const reviewsQuery = useSetterReviews(ae?.user_id, reviewWindow.startISO, reviewWindow.endISO);
  const activeReview = reviewsQuery.data?.[0];
  const briefQuery = useReviewBrief(activeReview?.id);

  // Realtime: watch the brief flip from generating → complete/failed.
  useEffect(() => {
    if (!activeReview?.id) return;
    const channel = supabase
      .channel(`ae-review-brief-${activeReview.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "performance_review_briefs",
          filter: `review_id=eq.${activeReview.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["performance-review-brief", activeReview.id] });
          queryClient.invalidateQueries({
            queryKey: ["performance-reviews", ae?.user_id, reviewWindow.startISO, reviewWindow.endISO],
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeReview?.id, ae?.user_id, reviewWindow.startISO, reviewWindow.endISO, queryClient]);

  const handleGenerate = async () => {
    if (!ae) return;
    setGenerating(true);
    try {
      await generateAEReview(ae, reviewWindow);
      toast({
        title: "Review generating",
        description: "Numbers compiled — the written review is on its way.",
      });
      await queryClient.invalidateQueries({
        queryKey: ["performance-reviews", ae.user_id, reviewWindow.startISO, reviewWindow.endISO],
      });
    } catch (e) {
      toast({
        title: "Could not generate review",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Account Executive
          </div>
          <Select value={aeUserId} onValueChange={setAeUserId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder={aesQuery.isLoading ? "Loading AEs…" : "Choose an AE"} />
            </SelectTrigger>
            <SelectContent>
              {aes.map((a) => (
                <SelectItem key={a.user_id} value={a.user_id}>
                  {(a.full_name || a.email || "Unknown").trim()}
                  {a.active === false ? " · former" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Window</div>
          <Select value={windowKind} onValueChange={(v) => setWindowKind(v as ReviewWindowKind)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(WINDOW_KIND_LABELS) as ReviewWindowKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {WINDOW_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {managerScope && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Former staff</div>
            <label className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={includeFormer} onCheckedChange={setIncludeFormer} />
              Include former
            </label>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {WINDOW_ANCHOR_LABELS[windowKind]}
          </div>
          <Select
            value={windowKind === "week" ? weekISO : monthISO}
            onValueChange={(v) => (windowKind === "week" ? setWeekISO(v) : setMonthISO(v))}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {windowKind === "week"
                ? weeks.map((w) => (
                    <SelectItem key={workWeekKey(w)} value={workWeekKey(w)}>
                      {workWeekLabel(w)}
                    </SelectItem>
                  ))
                : months.map((m) => (
                    <SelectItem key={monthKey(m)} value={monthKey(m)}>
                      {monthLabel(m)}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={!ae || generating || !canGenerate}
          className="gap-2"
          title={canGenerate ? undefined : managerScope ? "Only managers running acquisition can generate AE reviews" : "Only admin/dev/ops can generate AE reviews"}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {activeReview ? "Regenerate review" : "Generate review"}
        </Button>
      </div>

      {!ae ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            Choose an Account Executive and a period, then generate their review.
          </CardContent>
        </Card>
      ) : reviewsQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      ) : !activeReview ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No review exists yet for {(ae.full_name || "this AE").trim()} in this period. Generate one
            above.
          </CardContent>
        </Card>
      ) : (
        <AnimatedReviewShell theme={resolveReviewTheme("account_executive")} replayKey={activeReview.id}>
          <AEReviewContent review={activeReview} brief={briefQuery.data} />
        </AnimatedReviewShell>
      )}
    </div>
  );
}
