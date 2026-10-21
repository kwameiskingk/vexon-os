import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save } from "lucide-react";
import { useReviewAEs, type ReviewAE } from "@/hooks/useAEReview";
import {
  resolveTargetsForRole,
  type GenericResolvedTarget,
  type TargetPeriod,
} from "@/lib/targets/resolveTargets";
import { upsertIndividualTargets } from "@/lib/targets/individualTargets";

/**
 * AE target editor (Phase 2, 2026-07-31). Writes the four OPERATIONAL AE
 * metrics to individual_targets (role 'account_executive', subject keyed on
 * profiles.id) — the same rows the AE review engine resolves. Cash is
 * deliberately absent: performance_goals (Marcus's CEO Goals editor) is the
 * single entry point for AE cash targets, synced to individual_targets by
 * the 20260731090000 trigger; it is shown here read-only for context only.
 *
 * Resolver semantics surfaced, not invented: saves are effective today; an
 * explicit 0 is a deliberate "no target" (the resolver will not fall through
 * to a lower layer); rows exist only when a human set them.
 */

const OPERATIONAL_METRICS: {
  metric: string;
  label: string;
  period: TargetPeriod;
  note?: string;
}[] = [
  { metric: "deals_closed", label: "Deals closed", period: "month" },
  {
    metric: "cold_calls",
    label: "Cold calls",
    period: "day",
    note: "Capture not yet defined — the review shows this as “not yet tracked” until a counting ruling lands.",
  },
  {
    metric: "talk_minutes",
    label: "Talk minutes",
    period: "day",
    note: "Scored once the AE's Close ID is linked.",
  },
  { metric: "reengaged_meetings", label: "Re-engaged meetings", period: "month" },
];

const ALL_METRICS = [...OPERATIONAL_METRICS.map((m) => m.metric), "cash_collected"];

const todayKey = () => new Date().toISOString().slice(0, 10);

function sourceBadge(resolved: GenericResolvedTarget | undefined) {
  if (!resolved) return <Badge variant="outline">unset</Badge>;
  if (resolved.kind === "no_target") {
    return <Badge variant="outline">{resolved.reason === "explicit_zero" ? "no target (explicit 0)" : "unset"}</Badge>;
  }
  return (
    <Badge variant="secondary">
      {resolved.value} / {resolved.period} · {resolved.source}
    </Badge>
  );
}

function AECard({
  ae,
  resolved,
  onSaved,
}: {
  ae: ReviewAE;
  resolved: Record<string, GenericResolvedTarget>;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const dirty = OPERATIONAL_METRICS.filter(
    (m) => (drafts[m.metric] ?? "").trim() !== "",
  );

  const save = async () => {
    if (!user?.id || dirty.length === 0) return;
    const changes = dirty.map((m) => {
      const value = Number(drafts[m.metric]);
      if (Number.isNaN(value) || value < 0) {
        throw new Error(`${m.label} must be a number ≥ 0`);
      }
      return { metric: m.metric, period: m.period, value };
    });
    setSaving(true);
    try {
      await upsertIndividualTargets<string>(ae.user_id, changes, user.id, "account_executive");
      toast({ title: "Targets saved", description: `${ae.full_name}: effective today.` });
      setDrafts({});
      onSaved();
    } catch (e) {
      toast({
        title: "Could not save targets",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const cash = resolved["cash_collected"];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{ae.full_name ?? ae.email}</span>
          <Button size="sm" onClick={save} disabled={saving || dirty.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-1.5">Save{dirty.length > 0 ? ` (${dirty.length})` : ""}</span>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {OPERATIONAL_METRICS.map((m) => (
          <div key={m.metric} className="grid grid-cols-[1fr_auto_8rem] items-center gap-3">
            <div>
              <p className="text-sm font-medium">
                {m.label} <span className="text-muted-foreground font-normal">/ {m.period}</span>
              </p>
              {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
            </div>
            {sourceBadge(resolved[m.metric])}
            <Input
              type="number"
              min={0}
              placeholder="new value"
              value={drafts[m.metric] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [m.metric]: e.target.value }))}
            />
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t pt-3">
          <div>
            <p className="text-sm font-medium">
              Cash collected <span className="text-muted-foreground font-normal">/ month</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Set in the CEO Goals editor — synced automatically, not editable here.
            </p>
          </div>
          {cash && cash.kind === "target" ? (
            <Badge variant="secondary">£{cash.value.toLocaleString()} / {cash.period}</Badge>
          ) : (
            <Badge variant="outline">no CEO goal set</Badge>
          )}
        </div>
        {Object.values(drafts).some((v) => v.trim() !== "" && Number(v) === 0) && (
          <p className="text-xs text-muted-foreground">
            Saving 0 records a deliberate “no target” for that metric — it will not fall back to a
            role default.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function AETargetsView() {
  const qc = useQueryClient();
  const { data: aes = [], isLoading: aesLoading } = useReviewAEs();

  const { data: resolvedByAE, isLoading: targetsLoading } = useQuery({
    queryKey: ["ae-targets-resolved", aes.map((a) => a.user_id)],
    enabled: aes.length > 0,
    queryFn: () =>
      resolveTargetsForRole(
        aes.map((a) => a.user_id),
        "account_executive",
        "sales",
        todayKey(),
        ALL_METRICS,
      ),
  });

  const cards = useMemo(
    () =>
      aes.map((ae) => ({
        ae,
        resolved: resolvedByAE?.get(ae.user_id) ?? {},
      })),
    [aes, resolvedByAE],
  );

  if (aesLoading || targetsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (aes.length === 0) {
    return <p className="text-sm text-muted-foreground">No Account Executives found.</p>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {cards.map(({ ae, resolved }) => (
        <AECard
          key={ae.user_id}
          ae={ae}
          resolved={resolved}
          onSaved={() => qc.invalidateQueries({ queryKey: ["ae-targets-resolved"] })}
        />
      ))}
      <p className="text-xs text-muted-foreground">
        Saves take effect today and are what the AE review engine grades against. New values do not
        rewrite history: a review for an earlier window keeps resolving the values that were
        effective then.
      </p>
    </div>
  );
}
