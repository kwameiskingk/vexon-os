import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addDays } from "date-fns";

interface AccountingClientDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientProfileId: string;
  clientName: string;
  clientEmail: string;
}

export function AccountingClientDrawer({
  open,
  onOpenChange,
  clientProfileId,
  clientName,
  clientEmail,
}: AccountingClientDrawerProps) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"direct_transfer" | "iwoca" | "other" | "stripe" | "whop">("other");
  const [firstPaymentDate, setFirstPaymentDate] = useState("");
  const [contractTermMonths, setContractTermMonths] = useState("1");
  const [primaryEmail, setPrimaryEmail] = useState(clientEmail);
  const [accountsEmail, setAccountsEmail] = useState("");
  const [notes, setNotes] = useState("");

  const queryClient = useQueryClient();

  // Sync primaryEmail when drawer opens or clientEmail changes
  useEffect(() => {
    if (open) {
      setPrimaryEmail(clientEmail);
    }
  }, [open, clientEmail]);

  const createRecordMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Calculate next payment due (30 days from first payment date)
      let nextPaymentDue: string | null = null;
      if (firstPaymentDate) {
        const firstDate = new Date(firstPaymentDate);
        nextPaymentDue = addDays(firstDate, 30).toISOString().split('T')[0];
      }

      // Generate invoice number using database function
      const { data: invoiceData } = await supabase.rpc('generate_invoice_number');
      const invoiceNumber = invoiceData || `MSP-INV-${Date.now()}`;
      
      const { data, error } = await supabase
        .from('accounting_records')
        .insert([{
          client_profile_id: clientProfileId,
          amount: parseFloat(amount),
          payment_method: paymentMethod,
          first_payment_date: firstPaymentDate || null,
          next_payment_due: nextPaymentDue,
          status: 'due',
          primary_email: primaryEmail,
          accounts_email: accountsEmail || null,
          notes: notes || null,
          created_by: user?.id,
          invoice_number: invoiceNumber,
          contract_term_months: parseInt(contractTermMonths),
          payments_completed: 0,
          paid_in_full: false,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success("Billing entry created");
      // Invalidate and refetch ALL accounting-related queries
      await queryClient.invalidateQueries({ queryKey: ['accounting-clients-full'] });
      await queryClient.invalidateQueries({ queryKey: ['revenue-stats'] });
      await queryClient.invalidateQueries({ queryKey: ['accounting-followups-enhanced'] });
      // Force refetch to ensure data is updated
      await queryClient.refetchQueries({ queryKey: ['accounting-clients-full'] });
      onOpenChange(false);
      // Reset form
      setAmount("");
      setPaymentMethod("other");
      setFirstPaymentDate("");
      setContractTermMonths("1");
      setPrimaryEmail(clientEmail);
      setAccountsEmail("");
      setNotes("");
    },
    onError: (error: any) => {
      toast.error("Failed to create billing entry: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!firstPaymentDate) {
      toast.error("Please enter a first payment date");
      return;
    }
    createRecordMutation.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Create Billing Entry</SheetTitle>
          <p className="text-sm text-muted-foreground">{clientName}</p>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <div className="space-y-2">
            <Label htmlFor="amount">Monthly Payment Amount (£) *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="e.g. 3000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contract-term">Contract Term *</Label>
            <Select value={contractTermMonths} onValueChange={setContractTermMonths}>
              <SelectTrigger id="contract-term">
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Month</SelectItem>
                <SelectItem value="3">3 Months</SelectItem>
                <SelectItem value="6">6 Months</SelectItem>
                <SelectItem value="12">12 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-method">Payment Method *</Label>
            <Select value={paymentMethod} onValueChange={(val) => setPaymentMethod(val as "direct_transfer" | "iwoca" | "other" | "stripe" | "whop")}>
              <SelectTrigger id="payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="iwoca">Iwoca</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="direct_transfer">Direct Transfer</SelectItem>
                <SelectItem value="whop">Whop</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="first-payment">First Payment Date *</Label>
            <Input
              id="first-payment"
              type="date"
              value={firstPaymentDate}
              className="[color-scheme:dark]"
              onChange={(e) => setFirstPaymentDate(e.target.value)}
              required
            />
            {firstPaymentDate && (
              <p className="text-xs text-muted-foreground">
                Next payment due: {addDays(new Date(firstPaymentDate), 30).toLocaleDateString()}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="primary-email">Primary Email *</Label>
            <Input
              id="primary-email"
              type="email"
              placeholder="client@company.com"
              value={primaryEmail}
              onChange={(e) => setPrimaryEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accounts-email">Accounts Email</Label>
            <Input
              id="accounts-email"
              type="email"
              placeholder="accounts@company.com"
              value={accountsEmail}
              onChange={(e) => setAccountsEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Internal notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={createRecordMutation.isPending}
              className="flex-1"
            >
              {createRecordMutation.isPending ? "Creating..." : "Create Billing Entry"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
