import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { CheckCircle, PauseCircle, PlayCircle } from "lucide-react";
import { DeferInstallmentModal } from "./DeferInstallmentModal";
import { MarkAsPaidModal } from "./MarkAsPaidModal";
import { useQueryClient } from "@tanstack/react-query";

interface PaymentInstallment {
  id: string;
  accounting_record_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  status: string;
  paid_date: string | null;
  paid_amount: number | null;
  is_deferred: boolean;
  deferral_reason: string | null;
  deferral_end_date: string | null;
  notes: string | null;
}

interface PaymentInstallmentsSectionProps {
  accountingRecordId: string;
  amount: number;
  contractTermMonths: number;
  firstPaymentDate: string | null;
  onInstallmentsChange?: () => void;
}

export const PaymentInstallmentsSection = ({
  accountingRecordId,
  amount,
  contractTermMonths,
  firstPaymentDate,
  onInstallmentsChange,
}: PaymentInstallmentsSectionProps) => {
  const queryClient = useQueryClient();
  const [installments, setInstallments] = useState<PaymentInstallment[]>([]);
  const [loading, setLoading] = useState(false);
  const [deferModalOpen, setDeferModalOpen] = useState(false);
  const [markAsPaidModalOpen, setMarkAsPaidModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<PaymentInstallment | null>(null);

  useEffect(() => {
    if (accountingRecordId) {
      loadInstallments();
    }
  }, [accountingRecordId]);

  const loadInstallments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("payment_installments")
        .select("*")
        .eq("accounting_record_id", accountingRecordId)
        .order("installment_number", { ascending: true });

      if (error) throw error;
      
      // If no installments exist, create them
      if (!data || data.length === 0) {
        await generateInstallments();
      } else {
        setInstallments(data);
      }
    } catch (error: any) {
      toast.error("Failed to load installments: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const generateInstallments = async () => {
    if (!firstPaymentDate || !amount || !contractTermMonths) {
      return;
    }

    try {
      const installmentsToCreate = [];
      const baseDate = new Date(firstPaymentDate);
      const monthlyAmount = amount;

      for (let i = 0; i < contractTermMonths; i++) {
        const dueDate = i === 0 ? baseDate : addDays(baseDate, i * 30);
        installmentsToCreate.push({
          accounting_record_id: accountingRecordId,
          installment_number: i + 1,
          due_date: dueDate.toISOString().split('T')[0],
          amount: monthlyAmount,
          status: 'pending',
        });
      }

      const { data, error } = await supabase
        .from("payment_installments")
        .insert(installmentsToCreate)
        .select();

      if (error) throw error;
      setInstallments(data || []);
      toast.success(`Generated ${contractTermMonths} payment installments`);
    } catch (error: any) {
      toast.error("Failed to generate installments: " + error.message);
    }
  };

  const invalidateQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ['accounting-clients-full'] });
    await queryClient.invalidateQueries({ queryKey: ['revenue-stats'] });
    await queryClient.invalidateQueries({ queryKey: ['accounting-followups-enhanced'] });
  };

  const handleOpenMarkAsPaidModal = (installment: PaymentInstallment) => {
    setSelectedInstallment(installment);
    setMarkAsPaidModalOpen(true);
  };

  const handleMarkAsPaid = async (paidDate: Date) => {
    if (!selectedInstallment) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const formattedDate = paidDate.toISOString().split('T')[0];

      // Update installment - trigger will sync accounting_records automatically
      const { error } = await supabase
        .from("payment_installments")
        .update({
          status: 'paid',
          paid_date: formattedDate,
          paid_amount: selectedInstallment.amount,
        })
        .eq("id", selectedInstallment.id);

      if (error) throw error;

      // Log to payment history
      const { error: historyError } = await supabase.from("payment_history").insert({
        accounting_record_id: accountingRecordId,
        action: "paid",
        amount: selectedInstallment.amount,
        admin_user_id: user?.id,
        notes: `Installment ${selectedInstallment.installment_number} marked as paid on ${format(paidDate, 'MMM dd, yyyy')}`,
      });

      if (historyError) {
        console.error("Failed to log payment history:", historyError);
      }

      toast.success(`Installment ${selectedInstallment.installment_number} marked as paid`);
      setSelectedInstallment(null);
      await loadInstallments();
      await invalidateQueries();
      onInstallmentsChange?.();
    } catch (error: any) {
      toast.error("Failed to mark as paid: " + error.message);
    }
  };

  const handleOpenDeferModal = (installment: PaymentInstallment) => {
    setSelectedInstallment(installment);
    setDeferModalOpen(true);
  };

  const handleResumeInstallment = async (installment: PaymentInstallment) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Resume: keep original due_date, just clear deferral flags
      // The trigger will recalculate next_payment_due using the original due_date
      const { error } = await supabase
        .from("payment_installments")
        .update({
          status: 'pending',
          is_deferred: false,
          deferral_reason: null,
          deferral_end_date: null,
          // Keep due_date unchanged - it stays as the original schedule date
        })
        .eq("id", installment.id);

      if (error) throw error;

      // Log to payment history
      const { error: historyError } = await supabase.from("payment_history").insert({
        accounting_record_id: accountingRecordId,
        action: "resumed",
        admin_user_id: user?.id,
        notes: `Installment ${installment.installment_number} resumed. Original due date: ${format(new Date(installment.due_date), 'MMM dd, yyyy')}`,
      });

      if (historyError) {
        console.error("Failed to log payment history:", historyError);
      }

      toast.success(`Installment resumed. Due: ${format(new Date(installment.due_date), 'MMM dd, yyyy')}`);
      await loadInstallments();
      await invalidateQueries();
      onInstallmentsChange?.();
    } catch (error: any) {
      toast.error("Failed to resume: " + error.message);
    }
  };

  // Get effective due date (deferred date or original)
  const getEffectiveDueDate = (installment: PaymentInstallment): string => {
    return installment.deferral_end_date || installment.due_date;
  };

  const getStatusBadge = (installment: PaymentInstallment) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    const effectiveDue = new Date(getEffectiveDueDate(installment));
    effectiveDue.setHours(0, 0, 0, 0); // Normalize to start of day
    
    // Check overdue first - applies to pending AND deferred installments past their due date
    const isPastDue = effectiveDue < today;
    const isUnpaid = installment.status !== 'paid' && installment.status !== 'written_off' && installment.status !== 'partial';
    const isOverdue = isPastDue && isUnpaid;

    if (installment.status === 'paid') {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Paid</Badge>;
    }
    if (installment.status === 'partial') {
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Partial</Badge>;
    }
    if (installment.status === 'written_off') {
      return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Written Off</Badge>;
    }
    // Overdue takes priority over deferred status
    if (isOverdue) {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    // Only show deferred if not yet past the deferral date
    if ((installment.status === 'deferred' || installment.is_deferred) && !isPastDue) {
      return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Deferred</Badge>;
    }
    return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
  };

  if (loading) {
    return <div className="text-center py-4 text-muted-foreground">Loading installments...</div>;
  }

  if (installments.length === 0 && firstPaymentDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={generateInstallments} variant="outline" className="w-full">
            Generate {contractTermMonths} Monthly Installments
          </Button>
        </CardContent>
      </Card>
    );
  }

  const paidCount = installments.filter(i => i.status === 'paid').length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const overdueCount = installments.filter(i => {
    const effectiveDue = new Date(getEffectiveDueDate(i));
    effectiveDue.setHours(0, 0, 0, 0);
    const isUnpaid = i.status !== 'paid' && i.status !== 'written_off';
    return effectiveDue < today && isUnpaid;
  }).length;
  
  // Only count as deferred if not yet past the deferral date
  const deferredCount = installments.filter(i => {
    if (!i.is_deferred && i.status !== 'deferred') return false;
    const effectiveDue = new Date(getEffectiveDueDate(i));
    effectiveDue.setHours(0, 0, 0, 0);
    return effectiveDue >= today;
  }).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Payment Schedule</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline">{paidCount}/{contractTermMonths} Paid</Badge>
              {deferredCount > 0 && <Badge className="bg-purple-500/20 text-purple-400">{deferredCount} Deferred</Badge>}
              {overdueCount > 0 && <Badge variant="destructive">{overdueCount} Overdue</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {installments.map((installment) => {
                const effectiveDue = getEffectiveDueDate(installment);
                const isDeferred = installment.is_deferred && installment.deferral_end_date;
                
                return (
                  <TableRow key={installment.id} className={installment.status === 'paid' ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{installment.installment_number}</TableCell>
                    <TableCell>
                      <div>
                        {/* Show effective due date as primary */}
                        <span className={isDeferred ? 'text-purple-400' : ''}>
                          {format(new Date(effectiveDue), 'MMM dd, yyyy')}
                        </span>
                        {installment.paid_date && (
                          <p className="text-xs text-muted-foreground">
                            Paid: {format(new Date(installment.paid_date), 'MMM dd, yyyy')}
                          </p>
                        )}
                        {/* Show original date if deferred */}
                        {isDeferred && (
                          <p className="text-xs text-muted-foreground">
                            Original: {format(new Date(installment.due_date), 'MMM dd, yyyy')}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">£{installment.amount.toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(installment)}</TableCell>
                    <TableCell className="text-right">
                      {installment.status === 'paid' ? (
                        <CheckCircle className="w-5 h-5 text-green-500 inline" />
                      ) : installment.is_deferred ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResumeInstallment(installment)}
                          className="text-green-500"
                        >
                          <PlayCircle className="w-4 h-4 mr-1" />
                          Resume
                        </Button>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenMarkAsPaidModal(installment)}
                            className="text-green-500"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDeferModal(installment)}
                            className="text-purple-400"
                          >
                            <PauseCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mark as Paid Modal */}
      {selectedInstallment && (
        <MarkAsPaidModal
          open={markAsPaidModalOpen}
          onOpenChange={(open) => {
            setMarkAsPaidModalOpen(open);
            if (!open) setSelectedInstallment(null);
          }}
          installmentNumber={selectedInstallment.installment_number}
          amount={selectedInstallment.amount}
          onConfirm={handleMarkAsPaid}
        />
      )}

      {/* Defer Modal for Installment */}
      {selectedInstallment && (
        <DeferInstallmentModal
          open={deferModalOpen}
          onOpenChange={setDeferModalOpen}
          installmentId={selectedInstallment.id}
          installmentNumber={selectedInstallment.installment_number}
          accountingRecordId={accountingRecordId}
          baseDueDate={getEffectiveDueDate(selectedInstallment)}
          onSuccess={async () => {
            await loadInstallments();
            setSelectedInstallment(null);
            await invalidateQueries();
            onInstallmentsChange?.();
          }}
        />
      )}
    </div>
  );
};
