import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, CheckCircle, Save, Loader2, BadgePoundSterling } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { computePayroll, formatMoney, type CustomBonus, type Deduction } from "@/lib/payroll";

interface Props {
  submission: any | null;
  onClose: () => void;
  onApproved: (updated: any) => void;
  onUpdated?: () => void;
  onRequestMarkPaid?: (submission: any) => void;
}

export function InvoiceDetailDrawer({ submission, onClose, onApproved, onUpdated, onRequestMarkPaid }: Props) {
  const [bonuses, setBonuses] = useState<CustomBonus[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (submission) {
      setBonuses(Array.isArray(submission.custom_bonuses) ? submission.custom_bonuses : []);
      setDeductions(Array.isArray(submission.deductions) ? submission.deductions : []);
      setNotes(submission.notes || "");
    }
  }, [submission?.id]);

  if (!submission) return null;

  const sp = submission.setters_profiles || {};
  const lineType: string = submission.line_type || "setter";
  const currency = submission.currency || sp.currency || "USD";
  const sats = submission.sat_meetings_count ?? submission.meetings_count ?? 0;
  const perMtg = Number(submission.per_meeting_bonus || 0);
  const baseSalary = Number(submission.base_salary ?? sp.base_salary ?? 0);
  const cashCollected = Number(submission.cash_collected || 0);
  const commissionPct = Number(submission.commission_percentage || 0);
  const displayName = sp.full_name || submission.display_name || "Unknown";

  // Setter lines recompute from sats; AE lines carry a fixed cash-based
  // commission; staff lines are base only. Bonuses/deductions apply to all.
  const calc = (() => {
    if (lineType === "setter") {
      return computePayroll({
        sat_meetings_count: sats,
        per_meeting_bonus: perMtg,
        base_salary: baseSalary,
        custom_bonuses: bonuses,
        deductions,
      });
    }
    const commission = lineType === "ae" ? (cashCollected * commissionPct) / 100 : 0;
    const custom_bonuses_total = bonuses.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const deductions_total = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return {
      commission,
      tiered_bonus_amount: 0,
      tiered_bonus_tier: null as number | null,
      custom_bonuses_total,
      deductions_total,
      grand_total: baseSalary + commission + custom_bonuses_total - deductions_total,
    };
  })();

  const readOnly = ["approved", "paid"].includes(submission.status);

  const persist = async (extra: any = {}) => {
    const payload: any = {
      custom_bonuses: bonuses,
      deductions,
      deductions_total: calc.deductions_total,
      grand_total: calc.grand_total,
      tiered_bonus_amount: calc.tiered_bonus_amount,
      tiered_bonus_tier: calc.tiered_bonus_tier,
      total_commission: calc.commission + calc.tiered_bonus_amount + calc.custom_bonuses_total,
      notes,
      ...extra,
    };
    const { error } = await (supabase as any)
      .from("invoice_submissions")
      .update(payload)
      .eq("id", submission.id);
    if (error) throw error;
    return payload;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await persist();
      toast.success("Draft saved");
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      await persist({ status: "approved", reviewed_by: u.user?.id, reviewed_at: new Date().toISOString() });
      const updated = { ...submission, ...{ custom_bonuses: bonuses, deductions, deductions_total: calc.deductions_total, grand_total: calc.grand_total, tiered_bonus_amount: calc.tiered_bonus_amount, status: "approved", notes }, currency };
      toast.success("Invoice approved");
      onApproved(updated);
    } catch (err: any) {
      toast.error(err.message || "Failed to approve");
    } finally {
      setApproving(false);
    }
  };

  const updateBonus = (i: number, patch: Partial<CustomBonus>) => setBonuses((b) => b.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const updateDeduction = (i: number, patch: Partial<Deduction>) => setDeductions((d) => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  return (
    <Sheet open={!!submission} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center justify-between">
            <span>
              Invoice — {displayName}
              {lineType !== "setter" && (
                <Badge variant="secondary" className="ml-2 align-middle text-xs">{lineType === "ae" ? "AE" : "Staff"}</Badge>
              )}
            </span>
            <Badge variant="outline" className="capitalize">{submission.status}</Badge>
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {format(new Date(submission.period_start), "MMM d")} – {format(new Date(submission.period_end), "MMM d, yyyy")} · paid in <strong>{currency}</strong>
          </p>
        </SheetHeader>

        <div className="space-y-6">
          {/* Read-only KPI strip (varies by line type) */}
          {lineType === "setter" ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Sats (QA Sheet)</p>
                <p className="text-xl font-bold">{sats}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Base salary</p>
                <p className="text-xl font-bold">{formatMoney(baseSalary, currency)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Commission ({sats}×{formatMoney(perMtg, currency)})</p>
                <p className="text-xl font-bold">{formatMoney(calc.commission, currency)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Tier bonus {calc.tiered_bonus_tier ? `(${calc.tiered_bonus_tier}+ sats)` : ""}</p>
                <p className="text-xl font-bold">{formatMoney(calc.tiered_bonus_amount, currency)}</p>
              </Card>
            </div>
          ) : lineType === "ae" ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Base salary</p>
                <p className="text-xl font-bold">{formatMoney(baseSalary, currency)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Cash collected (cycle)</p>
                <p className="text-xl font-bold">{formatMoney(cashCollected, currency)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Commission ({commissionPct}%)</p>
                <p className="text-xl font-bold">{formatMoney(calc.commission, currency)}</p>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Base salary (Employee Hub)</p>
                <p className="text-xl font-bold">{formatMoney(baseSalary, currency)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Line type</p>
                <p className="text-xl font-bold">Salaried staff</p>
              </Card>
            </div>
          )}

          {/* Custom bonuses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Custom bonuses</Label>
              {!readOnly && (
                <Button size="sm" variant="outline" onClick={() => setBonuses([...bonuses, { label: "", amount: 0, note: "" }])}>
                  <Plus className="h-3 w-3 mr-1" />Add
                </Button>
              )}
            </div>
            {bonuses.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No custom bonuses.</p>
            ) : (
              <div className="space-y-2">
                {bonuses.map((b, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start">
                    <Input className="col-span-4" placeholder="Label (e.g. Double bonus day)" value={b.label} onChange={(e) => updateBonus(i, { label: e.target.value })} disabled={readOnly} />
                    <Input className="col-span-3" type="number" placeholder="Amount" value={b.amount || ""} onChange={(e) => updateBonus(i, { amount: parseFloat(e.target.value) || 0 })} disabled={readOnly} />
                    <Input className="col-span-4" placeholder="Note (optional)" value={b.note || ""} onChange={(e) => updateBonus(i, { note: e.target.value })} disabled={readOnly} />
                    {!readOnly && (
                      <Button size="sm" variant="ghost" className="col-span-1 text-destructive" onClick={() => setBonuses(bonuses.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Deductions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Deductions (absences, etc.)</Label>
              {!readOnly && (
                <Button size="sm" variant="outline" onClick={() => setDeductions([...deductions, { label: "", amount: 0, reason: "" }])}>
                  <Plus className="h-3 w-3 mr-1" />Add
                </Button>
              )}
            </div>
            {deductions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No deductions.</p>
            ) : (
              <div className="space-y-2">
                {deductions.map((d, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start">
                    <Input className="col-span-4" placeholder="Label (e.g. 2 unapproved absences)" value={d.label} onChange={(e) => updateDeduction(i, { label: e.target.value })} disabled={readOnly} />
                    <Input className="col-span-3" type="number" placeholder="Amount" value={d.amount || ""} onChange={(e) => updateDeduction(i, { amount: parseFloat(e.target.value) || 0 })} disabled={readOnly} />
                    <Input className="col-span-4" placeholder="Reason (optional)" value={d.reason || ""} onChange={(e) => updateDeduction(i, { reason: e.target.value })} disabled={readOnly} />
                    {!readOnly && (
                      <Button size="sm" variant="ghost" className="col-span-1 text-destructive" onClick={() => setDeductions(deductions.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label className="text-sm font-semibold">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} rows={2} className="mt-1" />
          </div>

          {/* Grand total */}
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Grand Total</p>
                <p className="text-3xl font-bold text-primary mt-1">{formatMoney(calc.grand_total, currency)}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>+ bonuses: {formatMoney(calc.custom_bonuses_total, currency)}</p>
                <p>− deductions: {formatMoney(calc.deductions_total, currency)}</p>
              </div>
            </div>
          </Card>

          {/* Actions */}
          {!readOnly && (
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleSave} disabled={saving || approving} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Draft
              </Button>
              <Button onClick={handleApprove} disabled={saving || approving} className="flex-1">
                {approving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Approve
              </Button>
            </div>
          )}

          {/* Record-keeping only: confirms payment was made outside Vexon OS */}
          {submission.status === "approved" && onRequestMarkPaid && (
            <Button variant="outline" className="w-full" onClick={() => onRequestMarkPaid(submission)}>
              <BadgePoundSterling className="h-4 w-4 mr-2" />
              Mark as Paid
            </Button>
          )}

          {submission.status === "paid" && submission.paid_at && (
            <p className="text-xs text-muted-foreground text-center">
              Marked paid on {format(new Date(submission.paid_at), "MMM d, yyyy 'at' HH:mm")}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
