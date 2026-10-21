import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  formatNumber,
  formatCurrency,
  type ClientHealthSnapshotRow,
  type OverridableMetric,
} from "@/lib/clientHealthSnapshot";

/**
 * Right-hand overrides panel for the client health tile row. Deliberately NOT
 * a modal: no overlay, the tiles stay visible (and update on save) while
 * editing. An override is a row that exists or doesn't — typing a value
 * creates one, clearing the input deletes it. No mode toggle.
 */

interface FieldDef {
  metric: OverridableMetric;
  label: string;
  computed: (row: ClientHealthSnapshotRow) => number | null;
  format: (v: number | null) => string;
}

const FIELDS: FieldDef[] = [
  { metric: "meetings_booked", label: "Meetings Booked", computed: (r) => r.computed?.meetingsBooked ?? null, format: formatNumber },
  { metric: "meetings_sat", label: "Meetings Sat", computed: (r) => r.computed?.meetingsSat ?? null, format: formatNumber },
  { metric: "revenue", label: "Revenue", computed: (r) => r.computed?.revenueGenerated ?? null, format: formatCurrency },
  { metric: "opportunities", label: "Opportunities", computed: (r) => r.computed?.opportunities ?? null, format: formatNumber },
  { metric: "vacancies", label: "Vacancies", computed: (r) => r.computed?.vacancies ?? null, format: formatNumber },
  { metric: "days_remaining", label: "Days Remaining", computed: (r) => r.computed?.daysRemaining ?? null, format: formatNumber },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  row: ClientHealthSnapshotRow | null;
}

export const ClientHealthOverridesSheet = ({ open, onOpenChange, clientId, clientName, row }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [saving, setSaving] = useState(false);

  // Re-seed inputs from the current overrides each time the panel opens.
  useEffect(() => {
    if (!open) return;
    const seeded: Record<string, string> = {};
    FIELDS.forEach((f) => {
      const ov = row?.overrides?.[f.metric];
      seeded[f.metric] = ov ? String(ov.value) : "";
    });
    setInputs(seeded);
    setStep("edit");
  }, [open, row]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const pending = useMemo(() => {
    const upserts: { metric: OverridableMetric; value: number }[] = [];
    const removals: OverridableMetric[] = [];
    const invalid: string[] = [];
    FIELDS.forEach((f) => {
      const raw = (inputs[f.metric] ?? "").trim();
      const existing = row?.overrides?.[f.metric];
      if (raw === "") {
        if (existing) removals.push(f.metric);
        return;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        invalid.push(f.label);
        return;
      }
      if (!existing || existing.value !== value) upserts.push({ metric: f.metric, value });
    });
    return { upserts, removals, invalid };
  }, [inputs, row]);

  const doSave = async (affectsHealth: boolean | null) => {
    setSaving(true);
    try {
      if (pending.upserts.length > 0) {
        const now = new Date().toISOString();
        const payload = pending.upserts.map((u) => ({
          client_profile_id: clientId,
          metric: u.metric,
          value: u.value,
          affects_health: affectsHealth === true,
          set_by: user?.id,
          set_at: now,
        }));
        const { error } = await supabase
          .from("client_health_metric_overrides" as never)
          .upsert(payload as never, { onConflict: "client_profile_id,metric" });
        if (error) throw error;
      }
      if (pending.removals.length > 0) {
        const { error } = await supabase
          .from("client_health_metric_overrides" as never)
          .delete()
          .eq("client_profile_id", clientId)
          .in("metric", pending.removals);
        if (error) throw error;
      }
      toast.success(
        pending.upserts.length > 0
          ? affectsHealth
            ? "Overrides saved — affects health scoring"
            : "Overrides saved — display only"
          : "Overrides cleared — tiles back to automatic",
      );
      await queryClient.invalidateQueries({ queryKey: ["native-client-health"] });
      onOpenChange(false);
    } catch (e) {
      console.error("Failed to save metric overrides:", e);
      toast.error(e instanceof Error ? e.message : "Failed to save overrides");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (pending.invalid.length > 0) {
      toast.error(`Not a number: ${pending.invalid.join(", ")}`);
      return;
    }
    if (pending.upserts.length === 0 && pending.removals.length === 0) {
      onOpenChange(false);
      return;
    }
    // The health question only applies when a value was added or changed;
    // pure clears just revert tiles to automatic.
    if (pending.upserts.length > 0) setStep("confirm");
    else doSave(null);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md border-l border-border bg-background shadow-xl flex flex-col animate-in slide-in-from-right duration-200"
      role="dialog"
      aria-label="Edit metric overrides"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <Settings2 className="h-4 w-4 text-primary/80 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">Edit metrics — {clientName}</h2>
            <p className="text-[11px] text-muted-foreground">
              Type a value to override a tile; clear it to go back to automatic.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {step === "edit" ? (
        <>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {FIELDS.map((f) => {
              const computed = row ? f.computed(row) : null;
              const existing = row?.overrides?.[f.metric];
              const raw = (inputs[f.metric] ?? "").trim();
              // 0 is a REAL override value — only an empty input means
              // "automatic". The explicit revert control below clears it so
              // nobody has to know that distinction.
              const status =
                raw !== ""
                  ? existing
                    ? `${existing.affectsHealth ? "Affects health scoring" : "Display only"}${
                        existing.setAt
                          ? ` · set ${new Date(existing.setAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                          : ""
                      }`
                    : "New override on save"
                  : existing
                    ? "Reverts to automatic on save"
                    : "Automatic";
              return (
                <div key={f.metric} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`ov-${f.metric}`} className="text-xs">
                      {f.label}
                    </Label>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      Computed: {f.format(computed)}
                    </span>
                  </div>
                  <Input
                    id={`ov-${f.metric}`}
                    inputMode="decimal"
                    value={inputs[f.metric] ?? ""}
                    onChange={(e) => setInputs((s) => ({ ...s, [f.metric]: e.target.value }))}
                    placeholder={computed != null ? String(computed) : "—"}
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
                        Revert to automatic
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground pt-1">
              Typing 0 is a real override of zero — use "Revert to automatic" to hand a
              tile back to the computed value. Show-up Rate is never edited directly — it
              recomputes as sat ÷ booked using the values above. Overrides never change
              the underlying meetings or payment data.
            </p>
          </div>
          <div className="px-5 py-4 border-t border-border/60 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              Save
            </Button>
          </div>
        </>
      ) : (
        <div className="flex-1 px-5 py-6 flex flex-col">
          <h3 className="text-sm font-semibold">Does this affect client health scoring?</h3>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            <span className="font-medium text-foreground/90">Yes</span> — the health band and
            rationale recompute using your values. The client can flip between Needs
            Attention / Watch / Healthy, including on the CEO board.
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            <span className="font-medium text-foreground/90">No</span> — the tiles show your
            values, but the health band and rationale keep computing from source data only.
          </p>
          <div className="mt-6 space-y-2">
            <Button className="w-full" size="sm" onClick={() => doSave(true)} disabled={saving}>
              Yes — affects health scoring
            </Button>
            <Button className="w-full" size="sm" variant="outline" onClick={() => doSave(false)} disabled={saving}>
              No — display only
            </Button>
            <Button
              className="w-full"
              size="sm"
              variant="ghost"
              onClick={() => setStep("edit")}
              disabled={saving}
            >
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
