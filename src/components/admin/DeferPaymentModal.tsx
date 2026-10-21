import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { PauseCircle } from "lucide-react";

interface DeferPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  currentNextDue: string | null;
  onSuccess?: () => void;
}

const DEFERRAL_REASONS = [
  { value: "campaign_paused", label: "Campaign Paused" },
  { value: "client_request", label: "Client Request" },
  { value: "payment_plan_adjustment", label: "Payment Plan Adjustment" },
  { value: "other", label: "Other" },
];

export function DeferPaymentModal({
  open,
  onOpenChange,
  recordId,
  currentNextDue,
  onSuccess,
}: DeferPaymentModalProps) {
  const queryClient = useQueryClient();
  const [deferralDays, setDeferralDays] = useState("30");
  const [deferralReason, setDeferralReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [loading, setLoading] = useState(false);

  const calculatedEndDate = deferralDays 
    ? format(addDays(new Date(), parseInt(deferralDays)), 'MMM dd, yyyy')
    : null;

  const handleSubmit = async () => {
    if (!deferralDays || parseInt(deferralDays) <= 0) {
      toast.error("Please enter a valid number of days");
      return;
    }

    if (!deferralReason) {
      toast.error("Please select a reason for deferral");
      return;
    }

    const reasonText = deferralReason === "other" 
      ? customReason 
      : DEFERRAL_REASONS.find(r => r.value === deferralReason)?.label || deferralReason;

    if (deferralReason === "other" && !customReason.trim()) {
      toast.error("Please provide a custom reason");
      return;
    }

    setLoading(true);
    try {
      const deferralEndDate = addDays(new Date(), parseInt(deferralDays));

      const { error } = await supabase
        .from("accounting_records")
        .update({
          is_deferred: true,
          deferral_reason: reasonText,
          deferral_end_date: deferralEndDate.toISOString().split('T')[0],
          original_next_payment_due: currentNextDue,
        })
        .eq("id", recordId);

      if (error) throw error;

      // Log to payment history
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("payment_history").insert({
        accounting_record_id: recordId,
        action: "deferred",
        admin_user_id: user?.id,
        notes: `Payment deferred for ${deferralDays} days. Reason: ${reasonText}`,
      });

      toast.success(`Payment deferred until ${format(deferralEndDate, 'MMM dd, yyyy')}`);
      
      // Invalidate all accounting queries
      queryClient.invalidateQueries({ queryKey: ['accounting-clients-full'] });
      queryClient.invalidateQueries({ queryKey: ['revenue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-followups-enhanced'] });
      
      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      setDeferralDays("30");
      setDeferralReason("");
      setCustomReason("");
    } catch (error: any) {
      toast.error("Failed to defer payment: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-yellow-500" />
            Defer Payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="deferral-days">Defer for (days)</Label>
            <Input
              id="deferral-days"
              type="number"
              min="1"
              max="365"
              value={deferralDays}
              onChange={(e) => setDeferralDays(e.target.value)}
              placeholder="30"
            />
            {calculatedEndDate && (
              <p className="text-sm text-muted-foreground">
                Will resume on: <span className="font-medium">{calculatedEndDate}</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="deferral-reason">Reason</Label>
            <Select value={deferralReason} onValueChange={setDeferralReason}>
              <SelectTrigger id="deferral-reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {DEFERRAL_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {deferralReason === "other" && (
            <div className="space-y-2">
              <Label htmlFor="custom-reason">Custom Reason</Label>
              <Textarea
                id="custom-reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Describe the reason for deferral..."
                rows={2}
              />
            </div>
          )}

          {currentNextDue && (
            <p className="text-sm text-muted-foreground">
              Original due date: <span className="font-medium">{format(new Date(currentNextDue), 'MMM dd, yyyy')}</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Deferring..." : "Defer Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
