import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, Trash2, Calendar, RefreshCw, CheckCircle, PauseCircle, PlayCircle, ChevronDown, ChevronUp } from "lucide-react";
import { format, addDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { DeferPaymentModal } from "./DeferPaymentModal";
import { PaymentInstallmentsSection } from "./PaymentInstallmentsSection";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
interface ClientPaymentsProps {
  clientId: string;
}

interface AccountingRecord {
  id: string;
  invoice_url: string | null;
  proof_url: string | null;
  first_payment_date: string | null;
  next_payment_due: string | null;
  amount: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  payment_method: string;
  contract_term_months: number;
  payments_completed: number;
  paid_in_full: boolean;
  is_deferred: boolean;
  deferral_reason: string | null;
  deferral_end_date: string | null;
  original_next_payment_due: string | null;
}

export const ClientPayments = ({ clientId }: ClientPaymentsProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [records, setRecords] = useState<AccountingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [deferModalOpen, setDeferModalOpen] = useState(false);
  const [selectedRecordForDefer, setSelectedRecordForDefer] = useState<AccountingRecord | null>(null);
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());
  
  const [formData, setFormData] = useState({
    amount: "",
    first_payment_date: "",
    contract_term_months: "1",
    payment_method: "other",
    notes: ""
  });

  useEffect(() => {
    loadRecords();
  }, [clientId]);

  const invalidateAllAccountingQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['accounting-clients-full'] });
    queryClient.invalidateQueries({ queryKey: ['revenue-stats'] });
    queryClient.invalidateQueries({ queryKey: ['accounting-followups-enhanced'] });
  };

  const loadRecords = async () => {
    try {
      const { data, error } = await supabase
        .from("accounting_records")
        .select("*")
        .eq("client_profile_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRecords(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading payment records",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCreateRecord = async () => {
    if (!formData.amount || !formData.first_payment_date) {
      toast({
        title: "Missing fields",
        description: "Please provide amount and first payment date",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Calculate next payment due (30 days from first payment)
      const firstPaymentDate = new Date(formData.first_payment_date);
      const nextPaymentDue = addDays(firstPaymentDate, 30);
      
      // Generate invoice number using database function
      const { data: invoiceData } = await supabase.rpc('generate_invoice_number');
      const invoiceNumber = invoiceData || `MSP-INV-${Date.now()}`;
      
      const { data: newRecord, error } = await supabase
        .from("accounting_records")
        .insert({
          client_profile_id: clientId,
          amount: parseFloat(formData.amount),
          first_payment_date: formData.first_payment_date,
          next_payment_due: nextPaymentDue.toISOString().split('T')[0],
          contract_term_months: parseInt(formData.contract_term_months),
          payment_method: formData.payment_method as any,
          notes: formData.notes,
          status: 'due' as const,
          payments_completed: 0,
          paid_in_full: false,
          created_by: user?.id,
          invoice_number: invoiceNumber
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-generate installments for the new record
      if (newRecord) {
        const installmentsToCreate = [];
        const baseDate = new Date(formData.first_payment_date);
        const monthlyAmount = parseFloat(formData.amount);
        const termMonths = parseInt(formData.contract_term_months);

        for (let i = 0; i < termMonths; i++) {
          const dueDate = i === 0 ? baseDate : addDays(baseDate, i * 30);
          installmentsToCreate.push({
            accounting_record_id: newRecord.id,
            installment_number: i + 1,
            due_date: dueDate.toISOString().split('T')[0],
            amount: monthlyAmount,
            status: 'pending',
          });
        }

        await supabase.from("payment_installments").insert(installmentsToCreate);
      }

      toast({
        title: "Payment record created",
        description: `Contract set up for ${formData.contract_term_months} month(s) with ${formData.contract_term_months} installments.`,
      });

      setFormData({ amount: "", first_payment_date: "", contract_term_months: "1", payment_method: "other", notes: "" });
      loadRecords();
      invalidateAllAccountingQueries();
    } catch (error: any) {
      toast({
        title: "Error creating payment record",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleRecordExpanded = (recordId: string) => {
    setExpandedRecords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recordId)) {
        newSet.delete(recordId);
      } else {
        newSet.add(recordId);
      }
      return newSet;
    });
  };

  const handleOpenDeferModal = (record: AccountingRecord) => {
    setSelectedRecordForDefer(record);
    setDeferModalOpen(true);
  };

  const handleResumePayment = async (record: AccountingRecord) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Calculate new next payment due from today
      const newNextDue = addDays(new Date(), 30).toISOString().split('T')[0];

      const { error } = await supabase
        .from("accounting_records")
        .update({
          is_deferred: false,
          deferral_reason: null,
          deferral_end_date: null,
          original_next_payment_due: null,
          next_payment_due: newNextDue,
          status: 'due',
        })
        .eq("id", record.id);

      if (error) throw error;

      // Log to payment history
      await supabase.from("payment_history").insert({
        accounting_record_id: record.id,
        action: "resumed",
        admin_user_id: user?.id,
        notes: `Payment tracking resumed. Next due: ${newNextDue}`,
      });

      toast({
        title: "Payment resumed",
        description: `Next payment due: ${format(new Date(newNextDue), 'MMM dd, yyyy')}`,
      });

      loadRecords();
      invalidateAllAccountingQueries();
    } catch (error: any) {
      toast({
        title: "Error resuming payment",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleMarkAsPaid = async (record: AccountingRecord) => {
    try {
      const newPaymentsCompleted = (record.payments_completed || 0) + 1;
      const isPaidInFull = newPaymentsCompleted >= (record.contract_term_months || 1);
      
      // Calculate next due date (30 days from current next_payment_due)
      let newNextDue: string | null = null;
      if (!isPaidInFull && record.next_payment_due) {
        newNextDue = addDays(new Date(record.next_payment_due), 30).toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from("accounting_records")
        .update({
          payments_completed: newPaymentsCompleted,
          paid_in_full: isPaidInFull,
          status: isPaidInFull ? 'paid' : 'due',
          next_payment_due: isPaidInFull ? null : newNextDue
        })
        .eq("id", record.id);

      if (error) throw error;

      toast({
        title: isPaidInFull ? "Contract Completed" : "Payment Recorded",
        description: isPaidInFull 
          ? "All payments complete. Client is paid in full." 
          : `Payment ${newPaymentsCompleted}/${record.contract_term_months} recorded. Next due: ${newNextDue}`,
      });

      loadRecords();
    } catch (error: any) {
      toast({
        title: "Error updating payment",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRenewal = async (record: AccountingRecord) => {
    try {
      const today = new Date();
      const nextPaymentDue = addDays(today, 30);

      const { error } = await supabase
        .from("accounting_records")
        .update({
          first_payment_date: today.toISOString().split('T')[0],
          next_payment_due: nextPaymentDue.toISOString().split('T')[0],
          payments_completed: 0,
          paid_in_full: false,
          status: 'due'
        })
        .eq("id", record.id);

      if (error) throw error;

      toast({
        title: "Contract Renewed",
        description: `New contract started. First payment due: ${format(nextPaymentDue, 'MMM dd, yyyy')}`,
      });

      loadRecords();
    } catch (error: any) {
      toast({
        title: "Error renewing contract",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (
    file: File,
    recordId: string,
    type: "invoice" | "proof"
  ) => {
    const bucket = type === "invoice" ? "invoices" : "payment-proofs";
    const setUploading = type === "invoice" ? setUploadingInvoice : setUploadingProof;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${clientId}/${recordId}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const updateField = type === "invoice" ? "invoice_url" : "proof_url";
      const { error: updateError } = await supabase
        .from("accounting_records")
        .update({ [updateField]: fileName })
        .eq("id", recordId);

      if (updateError) throw updateError;

      toast({
        title: "File uploaded",
        description: `${type === "invoice" ? "Invoice" : "Proof of payment"} uploaded successfully`,
      });

      loadRecords();
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadFile = async (filePath: string, bucket: string) => {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop() || 'download';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteRecord = async (recordId: string) => {
    if (!confirm("Are you sure you want to delete this payment record?")) return;

    try {
      const { error } = await supabase
        .from("accounting_records")
        .delete()
        .eq("id", recordId);

      if (error) throw error;

      toast({
        title: "Record deleted",
        description: "Payment record has been removed",
      });

      loadRecords();
    } catch (error: any) {
      toast({
        title: "Error deleting record",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (record: AccountingRecord) => {
    if (record.is_deferred) {
      return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Deferred</Badge>;
    }
    if (record.paid_in_full) {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Paid in Full</Badge>;
    }
    if (record.status === 'overdue') {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    if (record.status === 'paid') {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Paid</Badge>;
    }
    return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Due</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New Payment Record</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="amount">Amount (£)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="first_payment_date">First Payment Date</Label>
              <Input
                id="first_payment_date"
                type="date"
                value={formData.first_payment_date}
                className="[color-scheme:dark]"
                onChange={(e) => setFormData({ ...formData, first_payment_date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contract_term">Contract Term (Months)</Label>
              <Select
                value={formData.contract_term_months}
                onValueChange={(value) => setFormData({ ...formData, contract_term_months: value })}
              >
                <SelectTrigger>
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
            <div>
              <Label htmlFor="payment_method">Payment Method</Label>
              <Select
                value={formData.payment_method}
                onValueChange={(value) => setFormData({ ...formData, payment_method: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
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
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
            />
          </div>
          <Button onClick={handleCreateRecord} disabled={loading}>
            Create Payment Record
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {records.map((record) => (
          <Card key={record.id}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start mb-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Amount:</span>
                    <span className="text-2xl">£{record.amount?.toFixed(2)}</span>
                    {getStatusBadge(record)}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4" />
                    <span>First Payment: {record.first_payment_date ? format(new Date(record.first_payment_date), 'MMM dd, yyyy') : 'Not set'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Calendar className="w-4 h-4" />
                    <span>Next Due: {record.next_payment_due ? format(new Date(record.next_payment_due), 'MMM dd, yyyy') : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      Payments: {record.payments_completed || 0}/{record.contract_term_months || 1} completed
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground capitalize">
                    Method: {record.payment_method?.replace('_', ' ') || 'N/A'}
                  </div>
                  {record.is_deferred && (
                    <div className="mt-2 p-2 bg-purple-500/10 border border-purple-500/30 rounded-md">
                      <p className="text-sm text-purple-400 flex items-center gap-2">
                        <PauseCircle className="w-4 h-4" />
                        Deferred: {record.deferral_reason}
                      </p>
                      {record.deferral_end_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Resumes: {format(new Date(record.deferral_end_date), 'MMM dd, yyyy')}
                        </p>
                      )}
                    </div>
                  )}
                  {record.notes && (
                    <p className="text-sm text-muted-foreground">{record.notes}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {record.paid_in_full ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRenewal(record)}
                      className="text-primary"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Renew
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteRecord(record.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Collapsible Installments Section */}
              <Collapsible 
                open={expandedRecords.has(record.id)} 
                onOpenChange={() => toggleRecordExpanded(record.id)}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full mb-4">
                    {expandedRecords.has(record.id) ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Hide Payment Schedule
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        View Payment Schedule ({record.payments_completed || 0}/{record.contract_term_months || 1} paid)
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <PaymentInstallmentsSection
                    accountingRecordId={record.id}
                    amount={record.amount || 0}
                    contractTermMonths={record.contract_term_months || 1}
                    firstPaymentDate={record.first_payment_date}
                    onInstallmentsChange={loadRecords}
                  />
                </CollapsibleContent>
              </Collapsible>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Invoice</Label>
                  <div className="flex gap-2 mt-2">
                    {record.invoice_url ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadFile(record.invoice_url!, "invoices")}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    ) : (
                      <div>
                        <Input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file, record.id, "invoice");
                          }}
                          disabled={uploadingInvoice}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label>Proof of Payment</Label>
                  <div className="flex gap-2 mt-2">
                    {record.proof_url ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadFile(record.proof_url!, "payment-proofs")}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    ) : (
                      <div>
                        <Input
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.png"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file, record.id, "proof");
                          }}
                          disabled={uploadingProof}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {records.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No payment records yet. Create one to get started.
        </div>
      )}

      {/* Defer Payment Modal */}
      {selectedRecordForDefer && (
        <DeferPaymentModal
          open={deferModalOpen}
          onOpenChange={setDeferModalOpen}
          recordId={selectedRecordForDefer.id}
          currentNextDue={selectedRecordForDefer.next_payment_due}
          onSuccess={() => {
            loadRecords();
            setSelectedRecordForDefer(null);
          }}
        />
      )}
    </div>
  );
};
