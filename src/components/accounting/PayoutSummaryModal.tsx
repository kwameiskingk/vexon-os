import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Copy } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/payroll";
import { toast } from "sonner";

interface Props {
  submission: any | null;
  onClose: () => void;
}

export function PayoutSummaryModal({ submission, onClose }: Props) {
  if (!submission) return null;
  const sp = submission.setters_profiles || {};
  const currency = submission.currency || sp.currency || "USD";

  const fields: Array<[string, string | null | undefined]> = [
    ["Bank name", sp.bank_name],
    ["Account holder", sp.account_holder_name],
    ["Account number", sp.account_number],
    ["Sort code", sp.sort_code],
    ["IBAN", sp.iban],
    ["SWIFT / BIC", sp.swift_bic],
    ["Bank country", sp.bank_country],
    ["Bank address", sp.bank_address],
    ["Home address", sp.home_address],
  ].filter(([, v]) => !!v) as any;

  const summaryText = [
    `Setter: ${sp.full_name}`,
    `Period: ${format(new Date(submission.period_start), "MMM d")} – ${format(new Date(submission.period_end), "MMM d, yyyy")}`,
    `Amount: ${formatMoney(Number(submission.grand_total), currency)} ${currency}`,
    "",
    ...fields.map(([k, v]) => `${k}: ${v}`),
  ].join("\n");

  return (
    <Dialog open={!!submission} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Payout Summary
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Card className="p-4 bg-primary/5 border-primary/20">
            <p className="text-xs text-muted-foreground">Approved payout for {sp.full_name}</p>
            <p className="text-3xl font-bold text-primary mt-1">{formatMoney(Number(submission.grand_total), currency)}</p>
            <Badge variant="outline" className="mt-2">{currency}</Badge>
          </Card>

          <div>
            <p className="text-sm font-semibold mb-2">Banking &amp; Address</p>
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No banking details on file. Update them in HR → Payroll.</p>
            ) : (
              <dl className="text-sm space-y-1.5">
                {fields.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-3 gap-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="col-span-2 font-medium break-all">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(summaryText); toast.success("Copied"); }}>
            <Copy className="h-4 w-4 mr-2" />Copy
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
