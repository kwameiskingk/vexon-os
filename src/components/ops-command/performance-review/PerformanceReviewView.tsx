import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCapability } from "@/hooks/useCapability";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { firstOfMonth, toISODate } from "@/lib/workWeek";
import {
  WINDOW_KIND_LABELS,
  generateSetterReview,
  resolveReviewWindow,
  useReviewBrief,
  useReviewSetters,
  useSetterReviews,
  type ReviewSetter,
  type ReviewWindowKind,
  WINDOW_ANCHOR_LABELS,
  completedWorkWeeks,
  workWeekKey,
  workWeekLabel,
} from "@/hooks/useSetterReview";
import { SetterReviewContent } from "./SetterReviewContent";
import { ReviewOverridesSheet } from "./ReviewOverridesSheet";
import { useSetterReviewOverride, type OverridableReviewMetric } from "@/hooks/useSetterReviewOverrides";
import { AnimatedReviewShell } from "./AnimatedReviewShell";
import { resolveReviewTheme } from "@/lib/reviewThemes";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { TeamMetricsTable } from "@/components/sdr-manager/TeamMetricsTable";
import { useTeamMonthReview } from "@/hooks/useTeamMonthReview";

/** Last 12 completed calendar months, newest first (a monthly review looks back). */
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

export function PerformanceReviewView({ fulfilmentScope = false }: { fulfilmentScope?: boolean } = {}) {
  const { userRoles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Person-level surface: the review roster and the team month table union
  // over every department the manager holds (one row per setter, nothing
  // summed) — single-department managers see exactly what they saw before.
  const { departments: managerDepartments, isMultiDepartment } = useSdrManagerScope();

  const months = useMemo(completedMonths, []);
  const [monthISO, setMonthISO] = useState<string>(() => monthKey(months[0]));
  const [windowKind, setWindowKind] = useState<ReviewWindowKind>("month");
  const weeks = useMemo(() => completedWorkWeeks(), []);
  const [weekISO, setWeekISO] = useState<string>(() => workWeekKey(weeks[0]));
  const [setterProfileId, setSetterProfileId] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  // Individual = the existing one-setter narrative review. Team = the
  // spreadsheet-shaped whole-team table (Nadia's Excel replacement) — now
  // week- OR month-windowed (Marcus's 2 Sep reporting ask: call reviews +
  // meetings booked per setter, weekly and monthly, for him and Elena).
  const [scope, setScope] = useState<"individual" | "team">("individual");
  const [teamGrain, setTeamGrain] = useState<"month" | "week">("month");

  // Former (offboarded) setters are excluded by default; the toggle admits
  // them into the picker and the team month table so leavers' contributions
  // stay reviewable.
  const [includeFormer, setIncludeFormer] = useState(false);
  const settersQuery = useReviewSetters(includeFormer);
  // A viewer whose ONLY qualifying role is sdr_manager is always scoped to
  // their OWN department (fulfilment for Nadia, acquisition for Felix),
  // whatever surface they found the component on. UI scoping only — the
  // real enforcement is the sdr_manager RLS (migration 20260727150000).
  // 7 Oct: Ops Command holders review the whole team like ops (Daniel
  // covering Elena); the review RLS and performance-review-compile agree.
  const { has: hasOpsCommand } = useCapability("can_view_ops_command");
  const isUnscopedStaff = hasOpsCommand || (userRoles || []).some((r) => r === "admin" || r === "dev" || r === "ops");
  const scopedToManagerDept = fulfilmentScope || (!isUnscopedStaff && (userRoles || []).includes("sdr_manager"));

  const setters = useMemo(() => {
    const all = settersQuery.data ?? [];
    if (!scopedToManagerDept) return all;
    // Active setters of the manager's departments only — no other department,
    // no test accounts (Taylor is Ops/dev-demo only), no inactive.
    return all.filter(
      (s) =>
        s.department != null &&
        managerDepartments.includes(s.department as "fulfilment" | "acquisition") &&
        (includeFormer || s.active === true) &&
        s.is_test_account !== true,
    );
  }, [settersQuery.data, scopedToManagerDept, managerDepartments, includeFormer]);
  const setter: ReviewSetter | undefined = setters.find((s) => s.id === setterProfileId);

  const reviewWindow = useMemo(
    () =>
      resolveReviewWindow(
        windowKind,
        new Date(`${windowKind === "week" ? weekISO : monthISO}T00:00:00`),
      ),
    [windowKind, monthISO, weekISO],
  );

  const reviewsQuery = useSetterReviews(setter?.user_id, reviewWindow.startISO, reviewWindow.endISO);
  const activeReview = reviewsQuery.data?.[0];
  const briefQuery = useReviewBrief(activeReview?.id);

  // Manual adjustments (meetings booked / sat / warm leads) — month windows
  // only; the panel needs an existing review for its "Computed:" hints and
  // the save regenerates so tiles + narrative agree.
  const [overridesOpen, setOverridesOpen] = useState(false);
  const overrideMonthKey = windowKind === "month" ? reviewWindow.startISO : undefined;
  const overrideQuery = useSetterReviewOverride(setter?.id, overrideMonthKey);
  const overrideComputed = useMemo((): Record<OverridableReviewMetric, number | null> => {
    const compiled = activeReview?.compiled_metrics;
    if (!compiled) return { meetings_booked: null, meetings_sat: null, warm_leads: null };
    const fromAdjusted = compiled.window.adjusted?.computed;
    return {
      meetings_booked: fromAdjusted?.meetings_booked ?? compiled.totals.meetings_booked?.value ?? null,
      meetings_sat: fromAdjusted?.meetings_sat ?? compiled.totals.meetings_sat?.value ?? null,
      warm_leads: fromAdjusted?.warm_leads ?? compiled.totals.warm_leads?.value ?? null,
    };
  }, [activeReview]);

  // Team table numbers — batched over the whole department roster, windowed
  // by the team tab's own Month/Week grain (the hook is window-generic).
  const teamWindow = useMemo(
    () =>
      resolveReviewWindow(
        teamGrain,
        new Date(`${teamGrain === "week" ? weekISO : monthISO}T00:00:00`),
      ),
    [teamGrain, monthISO, weekISO],
  );
  const teamQuery = useTeamMonthReview(
    managerDepartments,
    teamWindow.startISO,
    teamWindow.endISO,
    scope === "team",
    includeFormer,
  );
  // Notes stay month-grain — a week's note writes into its containing month.
  const teamNotesMonthKey = useMemo(
    () => toISODate(firstOfMonth(new Date(`${teamWindow.startISO}T00:00:00`))),
    [teamWindow.startISO],
  );

  // Generate rights: admin/dev/ops, plus sdr_manager for their fulfilment
  // scope (RLS restricts the reviewee server-side).
  const canGenerate =
    isUnscopedStaff || (userRoles || []).includes("sdr_manager");

  // Realtime: watch the brief flip from generating → complete/failed.
  useEffect(() => {
    if (!activeReview?.id) return;
    const channel = supabase
      .channel(`performance-review-brief-${activeReview.id}`)
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
            queryKey: ["performance-reviews", setter?.user_id, reviewWindow.startISO, reviewWindow.endISO],
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeReview?.id, setter?.user_id, reviewWindow.startISO, reviewWindow.endISO, queryClient]);

  const grouped = useMemo(() => {
    const acq = setters.filter((s) => s.department === "acquisition");
    const ful = setters.filter((s) => s.department === "fulfilment");
    const other = setters.filter((s) => s.department !== "acquisition" && s.department !== "fulfilment");
    return { acq, ful, other };
  }, [setters]);

  const handleGenerate = async () => {
    if (!setter) return;
    setGenerating(true);
    try {
      await generateSetterReview(setter, reviewWindow);
      toast({
        title: "Review generating",
        description: "Numbers compiled — the written review is on its way.",
      });
      await queryClient.invalidateQueries({
        queryKey: ["performance-reviews", setter.user_id, reviewWindow.startISO, reviewWindow.endISO],
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

  const setterOption = (s: ReviewSetter) => (
    <SelectItem key={s.id} value={s.id}>
      <span className="flex items-center gap-2">
        {(s.full_name || s.email || "Unknown").trim()}
        {/* Department chip only for dual-department managers — invisible to
            every single-department manager. */}
        {isMultiDepartment && s.department ? (
          <Badge variant="outline" className="text-[10px] capitalize text-muted-foreground">
            {s.department}
          </Badge>
        ) : null}
        {s.is_test_account ? <Badge variant="outline" className="text-[10px]">TEST</Badge> : null}
        {s.active === false ? (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>
        ) : null}
      </span>
    </SelectItem>
  );

  return (
    <div className="space-y-6">
      <Tabs value={scope} onValueChange={(v) => setScope(v as "individual" | "team")}>
        <TabsList>
          <TabsTrigger value="individual">Individual review</TabsTrigger>
          <TabsTrigger value="team">Team table</TabsTrigger>
        </TabsList>
      </Tabs>

      {scope === "team" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Window</div>
              <Select value={teamGrain} onValueChange={(v) => setTeamGrain(v as "month" | "week")}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {teamGrain === "week" ? "Week" : "Month"}
              </div>
              <Select
                value={teamGrain === "week" ? weekISO : monthISO}
                onValueChange={(v) => (teamGrain === "week" ? setWeekISO(v) : setMonthISO(v))}
              >
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teamGrain === "week"
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
            <p className="pb-2 text-xs text-muted-foreground capitalize">
              {managerDepartments.join(" + ")} team · one row per setter · reviews = completed call reviews · notes carry forward monthly
            </p>
          </div>
          {teamQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (teamQuery.data ?? []).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No active setters in this department.
              </CardContent>
            </Card>
          ) : (
            <TeamMetricsTable rows={teamQuery.data ?? []} monthKey={teamNotesMonthKey} />
          )}
        </div>
      ) : (
      <>
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Setter</div>
          <Select value={setterProfileId} onValueChange={setSetterProfileId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder={settersQuery.isLoading ? "Loading setters…" : "Choose a setter"} />
            </SelectTrigger>
            <SelectContent>
              {grouped.acq.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Acquisition</SelectLabel>
                  {grouped.acq.map(setterOption)}
                </SelectGroup>
              )}
              {grouped.ful.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Fulfilment</SelectLabel>
                  {grouped.ful.map(setterOption)}
                </SelectGroup>
              )}
              {grouped.other.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Other</SelectLabel>
                  {grouped.other.map(setterOption)}
                </SelectGroup>
              )}
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

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Former staff</div>
          <label className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={includeFormer} onCheckedChange={setIncludeFormer} />
            Include former
          </label>
        </div>

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
          disabled={!setter || generating || !canGenerate}
          className="gap-2"
          title={canGenerate ? undefined : "Only Ops Command, admin/dev/ops or the SDR manager can generate reviews"}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {activeReview ? "Regenerate review" : "Generate review"}
        </Button>
      </div>

      {/* Body */}
      {!setter ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            Choose a setter and a period, then generate their review.
          </CardContent>
        </Card>
      ) : reviewsQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      ) : !activeReview ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No review exists yet for {(setter.full_name || "").trim() || "this setter"} in this month.
            {canGenerate ? " Generate one above." : " An admin can generate one."}
          </CardContent>
        </Card>
      ) : (
        <AnimatedReviewShell theme={resolveReviewTheme("setter")} replayKey={activeReview.id}>
          <SetterReviewContent
            review={activeReview}
            brief={briefQuery.data}
            onEditMetrics={
              overrideMonthKey && canGenerate && !generating ? () => setOverridesOpen(true) : undefined
            }
          />
        </AnimatedReviewShell>
      )}
      </>
      )}
      {setter && overrideMonthKey && (
        <ReviewOverridesSheet
          open={overridesOpen}
          onOpenChange={setOverridesOpen}
          setterName={(setter.full_name || setter.email || "this setter").trim()}
          monthLabel={reviewWindow.label}
          profileId={setter.id}
          monthKey={overrideMonthKey}
          computed={overrideComputed}
          existing={overrideQuery.data ?? null}
          onSaved={handleGenerate}
        />
      )}
    </div>
  );
}
