import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Plus, RefreshCcw } from "lucide-react";

interface RenewalRow {
  id: string;
  kind: string;
  amount: number | null;
  new_contract_term: string | null;
  effective_date: string;
  notes: string | null;
}

/**
 * Renewal / upsell capture on the client profile (Financial Details).
 * Writes client_renewals (feeds the CEO "Upsold clients" tile) and, for
 * renewals, keeps client_profiles.renewal_date in step.
 */
export function ClientRenewalsSection({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<RenewalRow[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [kind, setKind] = useState<"renewal" | "upsell">("renewal");
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("client_renewals")
      .select("id, kind, amount, new_contract_term, effective_date, notes")
      .eq("client_profile_id", clientId)
      .order("effective_date", { ascending: false });
    if (error) {
      // Table not migrated yet — show an inert state rather than erroring.
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    setRows((data as unknown as RenewalRow[]) || []);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setKind("renewal");
    setAmount("");
    setTerm("");
    setEffectiveDate(format(new Date(), "yyyy-MM-dd"));
    setNotes("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("client_renewals").insert({
        client_profile_id: clientId,
        kind,
        amount: amount === "" ? null : Number(amount),
        new_contract_term: term.trim() || null,
        effective_date: effectiveDate,
        notes: notes.trim() || null,
        recorded_by: user?.id ?? null,
      });
      if (error) throw error;

      if (kind === "renewal") {
        // Keep the profile's renewal_date in step; failure here shouldn't
        // undo the logged renewal.
        const { error: profileError } = await supabase
          .from("client_profiles")
          .update({ renewal_date: effectiveDate })
          .eq("id", clientId);
        if (profileError) {
          toast.warning("Renewal logged, but the profile's renewal date could not be updated");
        }
      }

      toast.success(kind === "renewal" ? "Renewal logged" : "Upsell logged");
      setOpen(false);
      reset();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to log renewal/upsell");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border shadow-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RefreshCcw className="h-4 w-4 text-muted-foreground" />
          Renewals &amp; upsells
        </CardTitle>
        <Button size="sm" onClick={() => setOpen(true)} disabled={unavailable}>
          <Plus className="h-4 w-4 mr-1.5" />
          Log renewal / upsell
        </Button>
      </CardHeader>
      <CardContent>
        {unavailable ? (
          <p className="text-sm text-muted-foreground">
            Renewal tracking isn't available yet (database migration pending).
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No renewals or upsells logged for this client yet.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        r.kind === "upsell"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : "bg-primary/10 text-primary border-primary/30"
                      }
                    >
                      {r.kind === "upsell" ? "Upsell" : "Renewal"}
                    </Badge>
                    <span className="text-sm font-medium tabular-nums">
                      {format(new Date(r.effective_date), "d MMM yyyy")}
                    </span>
                    {r.amount != null && (
                      <span className="text-sm tabular-nums text-muted-foreground">
                        £{Number(r.amount).toLocaleString()}
                      </span>
                    )}
                    {r.new_contract_term && (
                      <span className="text-xs text-muted-foreground">
                        {r.new_contract_term}
                      </span>
                    )}
                  </div>
                  {r.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log renewal / upsell</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "renewal" | "upsell")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="renewal">Renewal — contract renewed</SelectItem>
                  <SelectItem value="upsell">Upsell — expanded scope / value</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (£)</Label>
                <Input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 5000"
                />
              </div>
              <div className="space-y-2">
                <Label>Effective date</Label>
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>New contract term</Label>
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="e.g. 6 months"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
