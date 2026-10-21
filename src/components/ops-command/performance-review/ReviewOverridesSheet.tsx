import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import {
  OVERRIDABLE_REVIEW_METRICS,
  saveReviewOverride,
  type OverridableReviewMetric,
  type ReviewMetricOverrideRow,
} from "@/hooks/useSetterReviewOverrides";

/**
 * Right-hand override panel for the Performance Review tiles — the
 * ClientHealthOverridesSheet idiom: no overlay, the tiles stay visible; a
 * typed value creates the override, a cleared input hands the tile back to
 * the computed figure; 0 is a real override. Saving hands control back to
 * the caller, which regenerates the review so the written narrative quotes
 * the same figures as the tiles.
 */

const FIELDS: Array<{ metric: OverridableReviewMetric; label: string }> = [
  { metric: "meetings_booked", label: "Meetings booked" },
  { metric: "meetings_sat", label: "Meetings sat" },
  { metric: "warm_leads", label: "Warm leads" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setterName: string;
  monthLabel: string;
  profileId: string;
  /** First day of the month, ISO date. */
  monthKey: string;
  /** The un-overridden figures, for the "Computed:" hint beside each box. */
  computed: Record<OverridableReviewMetric, number | null>;
  existing: ReviewMetricOverrideRow | null;
  /** Called after a successful save (the view regenerates the review). */
  onSaved: () => Promise<void> | void;
}

const fmt = (v: number | null) => (v == null ? "—" : v.toLocaleString());

export function ReviewOverridesSheet({
  open,
  onOpenChange,
  setterName,
  monthLabel,
  profileId,
  monthKey,
  computed,
  existing,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inputs, setInputs] = useState<Record<OverridableReviewMetric, string>>({
    meetings_booked: "",
    meetings_sat: "",
    warm_leads: "",
  });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-seed from the current row each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setInputs({
      meetings_booked: existing?.meetings_booked != null ? String(existing.meetings_booked) : "",
      meetings_sat: existing?.meetings_sat != null ? String(existing.meetings_sat) : "",
      warm_leads: existing?.warm_leads != null ? String(existing.warm_leads) : "",
    });
    setReason(existing?.reason ?? "");
  }, [open, existing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const parsed = useMemo(() => {
    const values = {} as Record<OverridableReviewMetric, number | null>;
    const invalid: string[] = [];
    let changed = (reason.trim() || null) !== (existing?.reason ?? null);
    for (const f of FIELDS) {
      const raw = inputs[f.metric].trim();
      if (raw === "") {
        values[f.metric] = null;
      } else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) {
          invalid.push(f.label);
          values[f.metric] = null;
          continue;
        }
        values[f.metric] = n;
      }
      if ((existing?.[f.metric] ?? null) !== values[f.metric]) changed = true;
    }
    const anyValue = OVERRIDABLE_REVIEW_METRICS.some((m) => values[m] != null);
    return { values, invalid, changed, anyValue };
  }, [inputs, reason, existing]);

  const handleSave = async () => {
    if (parsed.invalid.length > 0) {
      toast.error(`Whole numbers only: ${parsed.invalid.join(", ")}`);
      return;
    }
    if (!parsed.changed) {
      onOpenChange(false);
      return;
    }
    if (!user?.id) {
      toast.error("You need to be signed in to adjust a review");
      return;
    }
    setSaving(true);
    try {
      await saveReviewOverride({
        profileId,
        monthKey,
        values: parsed.values,
        reason: parsed.anyValue ? reason.trim() || null : null,
        userId: user.id,
      });
      await queryClient.invalidateQueries({ queryKey: ["review-metric-override"] });
      await queryClient.invalidateQueries({ queryKey: ["team-month-review"] });
      toast.success(
        parsed.anyValue
          ? "Figures adjusted — regenerating the review"
          : "Adjustments cleared — back to the computed figures",
      );
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      console.error("Failed to save review overrides:", e);
      toast.error(e instanceof Error ? e.message : "Could not save the adjustment");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md border-l border-border bg-background shadow-xl flex flex-col animate-in slide-in-from-right duration-200"
      role="dialog"
      aria-label="Adjust review figures"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <Settings2 className="h-4 w-4 text-primary/80 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">
              Adjust figures — {setterName}, {monthLabel}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Type a value to override a tile; clear it to go back to the computed figure.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {FIELDS.map((f) => {
          const raw = inputs[f.metric].trim();
          const existingValue = existing?.[f.metric] ?? null;
          const status =
            raw !== ""
              ? existingValue != null
                ? `Adjusted${existing?.set_at ? ` · set ${new Date(existing.set_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}`
                : "New adjustment on save"
              : existingValue != null
                ? "Reverts to computed on save"
                : "Computed";
          return (
            <div key={f.metric} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor={`rv-${f.metric}`} className="text-xs">
                  {f.label}
                </Label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  Computed: {fmt(computed[f.metric])}
                </span>
              </div>
              <Input
                id={`rv-${f.metric}`}
                inputMode="numeric"
                value={inputs[f.metric]}
                onChange={(e) => setInputs((s) => ({ ...s, [f.metric]: e.target.value }))}
                placeholder={computed[f.metric] != null ? String(computed[f.metric]) : "—"}
                className="h-9 tabular-nums"
              />
              <div className="flex items-center justify-between">
                <p className="text-[10.5px] text-muted-foreground">{status}</p>
                {raw !== "" && (
                  <button
                    type="button"
                    className="text-[10.5px] text-primary hover:underline"
                    onClick={() => setInputs((s) => ({ ...s, [f.metric]: "" }))}
                  >
                    Revert to computed
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div className="space-y-1">
          <Label htmlFor="rv-reason" className="text-xs">
            Reason <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="rv-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Outcomes confirmed with the CSM"
            className="h-9"
            maxLength={200}
          />
        </div>

        <p className="text-[11px] text-muted-foreground pt-1 leading-relaxed">
          Typing 0 is a real adjustment of zero — use "Revert to computed" to hand a tile back.
          Show rate is never edited directly: it recalculates as sat ÷ booked from the values
          above. Adjustments apply to this Performance Review only; leaderboards, the RAG board,
          the Morning Meeting and the CEO tiles keep the computed figures and the underlying
          meetings are never changed. Saving regenerates the written review so it quotes the
          same numbers.
        </p>
      </div>

      <div className="px-5 py-4 border-t border-border/60 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save and regenerate
        </Button>
      </div>
    </div>
  );
}
