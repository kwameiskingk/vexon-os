// Mark an invoice paid (9 Oct 2026). When the client's onboarding is still
// waiting for payment, the same dialog presses Confirm paid on it — Marcus's
// "once I see it as paid, I mark it as paid and they get the welcome".

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInvoiceAction, type InvoiceRow } from "@/hooks/useClientInvoices";
import { fmtGBP } from "@/lib/invoices/invoiceMaths";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Props {
  invoice: InvoiceRow | null;
  /** True when this client's onboarding journey is awaiting payment. */
  onboardingAwaiting: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MarkPaidDialog({ invoice, onboardingAwaiting, onOpenChange }: Props) {
  const act = useInvoiceAction();
  const [paidAt, setPaidAt] = useState(todayIso());
  const [confirmOnboarding, setConfirmOnboarding] = useState(true);
  useEffect(() => { if (invoice) { setPaidAt(todayIso()); setConfirmOnboarding(true); } }, [invoice]);

  const run = async () => {
    if (!invoice) return;
    try {
      const r = await act.mutateAsync({
        action: "mark_paid", invoice_id: invoice.id, paid_at: paidAt,
        confirm_onboarding: onboardingAwaiting && confirmOnboarding,
      });
      const ob = r?.onboarding as { confirmed: boolean; invite_sent?: boolean; sms_sent?: boolean; error?: string } | null;
      if (ob?.confirmed) {
        toast.success(`Invoice ${invoice.invoice_number} marked paid · onboarding opened${ob.invite_sent ? ", welcome email sent" : ", but the welcome email failed (use Resend welcome)"}${ob.sms_sent ? " + SMS" : ""}`);
      } else if (ob && !ob.confirmed) {
        toast.warning(`Invoice ${invoice.invoice_number} marked paid, but onboarding was not confirmed: ${ob.error}`);
      } else {
        toast.success(`Invoice ${invoice.invoice_number} marked paid`);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark it paid");
    }
  };

  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark invoice {invoice?.invoice_number} paid</DialogTitle>
          <DialogDescription>
            {invoice?.bill_to_name} · {invoice ? fmtGBP(Number(invoice.total_amount ?? invoice.amount)) : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="paid-at">Date paid</Label>
            <Input id="paid-at" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          {onboardingAwaiting && (
            <label className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950/20 p-3 text-sm cursor-pointer">
              <Checkbox checked={confirmOnboarding} onCheckedChange={(v) => setConfirmOnboarding(v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium">Also confirm payment on their onboarding</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Creates their login and sends the welcome email (and SMS if they have a mobile) with the link to the onboarding platform.
                </span>
              </span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={act.isPending}>Cancel</Button>
          <Button onClick={run} disabled={act.isPending} className="bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white border-0">
            {act.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Mark paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
