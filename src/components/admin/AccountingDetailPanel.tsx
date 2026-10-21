import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Download, FileText, Plus, Trash2, Send, ExternalLink, CheckCircle, Clock, AlertCircle, DollarSign, Ban, RotateCcw, History, XCircle, PauseCircle, UserX } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { InvoicePreviewModal } from "./InvoicePreviewModal";
import { PaymentInstallmentsSection } from "./PaymentInstallmentsSection";
import { DeferPaymentModal } from "./DeferPaymentModal";

interface AccountingDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientProfileId: string;
  recordId: string | null;
}

type PaymentAction = 'paid' | 'partial' | 'written_off' | 'reverted' | 'overdue';
type PaymentStatusUpdate = 'paid' | 'partial' | 'written_off' | 'due' | 'overdue';

interface PaymentHistoryEntry {
  id: string;
  action: string; // Database returns string, we'll handle display mapping
  amount: number | null;
  admin_user_id: string | null;
  notes: string | null;
  created_at: string;
  admin_email?: string;
}

export function AccountingDetailPanel({
  open,
  onOpenChange,
  clientProfileId,
  recordId
}: AccountingDetailPanelProps) {
  const queryClient = useQueryClient();
  const [clientData, setClientData] = useState<any>(null);
  const [recordData, setRecordData] = useState<any>(null);
  const [partialPayments, setPartialPayments] = useState<any[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryEntry[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [deferModalOpen, setDeferModalOpen] = useState(false);
  const [ceaseDialogOpen, setCeaseDialogOpen] = useState(false);
  const [invoicesSentCount, setInvoicesSentCount] = useState(0);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [newPayment, setNewPayment] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: '',
    notes: ''
  });

  useEffect(() => {
    if (open && clientProfileId) {
      loadData();
    }
  }, [open, clientProfileId, recordId]);

  // Subscribe to real-time updates for this specific record
  useEffect(() => {
    if (!open || !recordId) return;

    const channel = supabase
      .channel(`accounting-record-${recordId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'accounting_records',
          filter: `id=eq.${recordId}`
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, recordId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load client profile
      const { data: client, error: clientError } = await supabase
        .from("client_profiles")
        .select("*")
        .eq("id", clientProfileId)
        .single();

      if (clientError) throw clientError;
      setClientData(client);

      // Load accounting record if exists
      if (recordId) {
        const { data: record, error: recordError } = await supabase
          .from("accounting_records")
          .select("*")
          .eq("id", recordId)
          .single();

        if (recordError) throw recordError;
        setRecordData(record);
        setInsights({
          average_payment_delay_days: record.average_payment_delay_days || 0,
          total_lifetime_value: record.total_lifetime_value || 0,
          on_time_payment_rate: record.on_time_payment_rate || 100
        });

        // Load partial payments
        const { data: payments, error: paymentsError } = await supabase
          .from("partial_payments")
          .select("*")
          .eq("accounting_record_id", recordId)
          .order("payment_date", { ascending: false });

        if (paymentsError) throw paymentsError;
        setPartialPayments(payments || []);

        // Load payment history (audit trail)
        const { data: history, error: historyError } = await supabase
          .from("payment_history")
          .select("*")
          .eq("accounting_record_id", recordId)
          .order("created_at", { ascending: false });

        if (!historyError && history) {
          // Get admin emails for each history entry
          const adminIds = history.filter(h => h.admin_user_id).map(h => h.admin_user_id);
          let adminEmails: Record<string, string> = {};
          
          if (adminIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, email")
              .in("id", adminIds);
            
            if (profiles) {
              adminEmails = profiles.reduce((acc, p) => ({ ...acc, [p.id]: p.email }), {});
            }
          }

          setPaymentHistory(history.map(h => ({
            ...h,
            admin_email: h.admin_user_id ? adminEmails[h.admin_user_id] : undefined
          })));
        }

        // Load invoice count from audit log
        const { count, error: countError } = await supabase
          .from("invoice_audit_log")
          .select("*", { count: 'exact', head: true })
          .eq("accounting_record_id", recordId);

        if (!countError) {
          setInvoicesSentCount(count || 0);
        }
      }
    } catch (error: any) {
      toast.error("Failed to load data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentStatusChange = async (newStatus: PaymentStatusUpdate, amount?: number) => {
    if (!recordId) return;
    
    setStatusUpdateLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Map written_off to a valid database enum value if needed, or use as-is
      // The database status field uses payment_status enum: paid, due, overdue, partial
      // We treat 'written_off' as a special case stored in payment_history
      const dbStatus = newStatus === 'written_off' ? 'due' : newStatus;
      
      // Update accounting_records.status
      const { error: updateError } = await supabase
        .from("accounting_records")
        .update({ status: dbStatus })
        .eq("id", recordId);

      if (updateError) throw updateError;
      
      // Write to payment_history with the actual action (including written_off)
      const action = newStatus === 'due' ? 'reverted' : newStatus;
      const { error: historyError } = await supabase
        .from("payment_history")
        .insert({
          accounting_record_id: recordId,
          action: action,
          amount: amount || null,
          admin_user_id: user?.id,
          notes: `Status changed to ${newStatus} by admin`
        });

      if (historyError) {
        console.error("Failed to log payment history:", historyError);
      }
      
      toast.success(`Payment status updated to ${newStatus}`);
      queryClient.invalidateQueries({ queryKey: ["accounting-clients-full"] });
      loadData();
    } catch (error: any) {
      toast.error("Failed to update payment status");
      console.error(error);
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  const handleAddPayment = async () => {
    if (!recordId || !newPayment.amount || !newPayment.payment_method) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("partial_payments")
        .insert([{
          accounting_record_id: recordId,
          amount: parseFloat(newPayment.amount),
          payment_date: newPayment.payment_date,
          payment_method: newPayment.payment_method as any,
          notes: newPayment.notes,
          created_by: user?.id
        }]);

      if (error) throw error;
      
      toast.success("Payment added successfully");
      setAddPaymentOpen(false);
      setNewPayment({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: '', notes: '' });
      loadData();
    } catch (error: any) {
      toast.error("Failed to add payment");
      console.error(error);
    }
  };

  const handleDeleteEntry = async () => {
    if (!recordId) return;

    try {
      const { error } = await supabase
        .from("accounting_records")
        .delete()
        .eq("id", recordId);

      if (error) throw error;

      toast.success("Billing entry deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["accounting-clients-full"] });
      queryClient.invalidateQueries({ queryKey: ["revenue-stats"] });
      onOpenChange(false);
      setDeleteDialogOpen(false);
    } catch (error: any) {
      toast.error("Failed to delete billing entry");
      console.error(error);
    }
  };

  const handleCeaseAccount = async () => {
    if (!recordId) return;
    try {
      const { error } = await supabase
        .from("accounting_records")
        .update({ is_ceased: true, ceased_at: new Date().toISOString() } as any)
        .eq("id", recordId);
      if (error) throw error;
      toast.success("Account ceased — removed from active billing");
      queryClient.invalidateQueries({ queryKey: ["accounting-clients-full"] });
      queryClient.invalidateQueries({ queryKey: ["revenue-stats"] });
      setCeaseDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error("Failed to cease account");
      console.error(error);
    }
  };

  const handleReactivateAccount = async () => {
    if (!recordId) return;
    try {
      const { error } = await supabase
        .from("accounting_records")
        .update({ is_ceased: false, ceased_at: null } as any)
        .eq("id", recordId);
      if (error) throw error;
      toast.success("Account reactivated");
      queryClient.invalidateQueries({ queryKey: ["accounting-clients-full"] });
      queryClient.invalidateQueries({ queryKey: ["revenue-stats"] });
      loadData();
    } catch (error: any) {
      toast.error("Failed to reactivate account");
      console.error(error);
    }
  };
  const handleFileUpload = async (file: File, type: "invoice" | "proof" | "receipt") => {
    if (!recordId) return;

    try {
      if (type === "receipt") {
        // Receipts go to standalone client_receipts table
        const fileExt = file.name.split(".").pop();
        const fileName = `${clientProfileId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { user } } = await supabase.auth.getUser();
        const receiptTitle = recordData?.invoice_number
          ? `Receipt - ${recordData.invoice_number}`
          : `Receipt - ${format(new Date(), "MMM yyyy")}`;

        const insertPayload = {
          client_profile_id: clientProfileId,
          title: receiptTitle,
          description: `Payment receipt for ${recordData?.invoice_number || "service"}`,
          file_path: fileName,
          file_name: file.name,
          uploaded_by: user?.id || null,
        };
        console.log("[Receipt] Inserting into client_receipts:", insertPayload);

        const { data: insertData, error: insertError } = await supabase
          .from("client_receipts")
          .insert(insertPayload)
          .select();

        if (insertError) {
          console.error("[Receipt] Insert error:", insertError);
          throw insertError;
        }
        console.log("[Receipt] Insert success:", insertData);
      } else {
        const bucketMap = { invoice: "invoices", proof: "payment-proofs" };
        const bucket = bucketMap[type];
        const fileExt = file.name.split(".").pop();
        const fileName = `${clientProfileId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const fieldMap = { invoice: "invoice_url", proof: "proof_url" };
        const { error: updateError } = await supabase
          .from("accounting_records")
          .update({
            [fieldMap[type]]: fileName
          } as any)
          .eq("id", recordId);

        if (updateError) throw updateError;
      }

      toast.success("File uploaded successfully");
      loadData();
    } catch (error: any) {
      toast.error("Upload failed");
      console.error(error);
    }
  };

  const getInvoiceStatusBadge = (status: string | null) => {
    const s = status?.toLowerCase();
    switch (s) {
      case 'sent':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Sent</Badge>;
      case 'sending':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Sending</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed</Badge>;
      case 'voided':
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Voided</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground">Pending</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string | null) => {
    const s = status?.toLowerCase();
    switch (s) {
      case 'paid':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Paid</Badge>;
      case 'partial':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Partial</Badge>;
      case 'overdue':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Overdue</Badge>;
      case 'written_off':
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Written Off</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Due</Badge>;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'paid':
        return <Badge className="bg-green-500/20 text-green-400 text-xs">Paid</Badge>;
      case 'partial':
        return <Badge className="bg-blue-500/20 text-blue-400 text-xs">Partial</Badge>;
      case 'overdue':
        return <Badge className="bg-red-500/20 text-red-400 text-xs">Overdue</Badge>;
      case 'written_off':
        return <Badge className="bg-gray-500/20 text-gray-400 text-xs">Written Off</Badge>;
      case 'reverted':
        return <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Reverted</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground text-xs">{action}</Badge>;
    }
  };

  if (loading) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto">
          <div className="flex items-center justify-center h-full">Loading...</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between pr-6">
              <SheetTitle>Client Payment Details</SheetTitle>
              <div className="flex items-center gap-2">
                {recordData && !recordData.is_ceased && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
                    onClick={() => setCeaseDialogOpen(true)}
                  >
                    <UserX className="h-4 w-4 mr-2" />
                    Cease Account
                  </Button>
                )}
                {recordData?.is_ceased && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReactivateAccount}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reactivate
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Entry
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Client Information */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Client Information</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground">Company</Label>
                  <p className="font-medium">{clientData?.company_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Contact</Label>
                  <p className="font-medium">{clientData?.contact_name || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Primary Email</Label>
                  <p className="font-medium">{clientData?.email || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone</Label>
                  <p className="font-medium">{clientData?.phone || "N/A"}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Payment Insights */}
            {insights && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Avg Delay</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{insights.average_payment_delay_days} days</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Lifetime Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">£{insights.total_lifetime_value.toLocaleString()}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">On-Time Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{insights.on_time_payment_rate}%</div>
                    </CardContent>
                  </Card>
                </div>

                <Separator />
              </>
            )}

            {/* SECTION A: Invoice Status (Xero) */}
            {recordData && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Invoice Status (Xero)</h3>
                    <div className="flex items-center gap-2">
                      {getInvoiceStatusBadge(recordData.invoice_external_status)}
                      {invoicesSentCount > 0 && (
                        <Badge variant={invoicesSentCount > 1 ? "destructive" : "secondary"}>
                          {invoicesSentCount} sent
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {recordData.invoice_external_status === 'sent' && (
                    <Card className="border-green-500/30 bg-green-500/5">
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <CheckCircle className="h-8 w-8 text-green-500" />
                            <div>
                              <p className="font-semibold text-green-500">Invoice Sent to Xero</p>
                              {recordData.sent_at && (
                                <span className="text-sm text-muted-foreground">
                                  {format(new Date(recordData.sent_at), "MMM dd, yyyy 'at' HH:mm")}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {recordData.external_invoice_number && (
                            <div>
                              <Label className="text-muted-foreground">Xero Invoice Number</Label>
                              <p className="font-medium">{recordData.external_invoice_number}</p>
                            </div>
                          )}
                          
                          {recordData.external_invoice_url && (
                            <a 
                              href={recordData.external_invoice_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                            >
                              View Invoice in Xero <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {recordData.invoice_external_status === 'sending' && (
                    <Card className="border-yellow-500/30 bg-yellow-500/5">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                          <Clock className="h-8 w-8 text-yellow-500 animate-pulse" />
                          <div>
                            <p className="font-semibold text-yellow-500">Sending to Xero</p>
                            <p className="text-sm text-muted-foreground">
                              Invoice is being processed. This may take a few moments.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {recordData.invoice_external_status === 'failed' && (
                    <Card className="border-red-500/30 bg-red-500/5">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                          <XCircle className="h-8 w-8 text-red-500" />
                          <div>
                            <p className="font-semibold text-red-500">Send Failed</p>
                            <p className="text-sm text-muted-foreground">
                              There was an error sending the invoice. Please try again.
                            </p>
                          </div>
                        </div>
                        <Button onClick={() => setInvoiceModalOpen(true)} className="w-full mt-4" variant="outline">
                          <Send className="h-4 w-4 mr-2" />
                          Retry Send
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                  
                  {(!recordData.invoice_external_status || recordData.invoice_external_status === 'pending') && (
                    <Card className="border-muted">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <Send className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-semibold">Not Sent</p>
                            <p className="text-sm text-muted-foreground">Invoice has not been sent to Xero yet</p>
                          </div>
                        </div>
                        <Button onClick={() => setInvoiceModalOpen(true)} className="w-full">
                          <Send className="h-4 w-4 mr-2" />
                          Send Invoice via Xero
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
                
                <Separator />

                {/* SECTION B: Payment Schedule (Installments) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Payment Schedule</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeferModalOpen(true)}
                      className="text-purple-400"
                    >
                      <PauseCircle className="h-4 w-4 mr-2" />
                      Defer All
                    </Button>
                  </div>
                  
                  <PaymentInstallmentsSection
                    accountingRecordId={recordId!}
                    amount={recordData.amount || 0}
                    contractTermMonths={recordData.contract_term_months || 1}
                    firstPaymentDate={recordData.first_payment_date}
                    onInstallmentsChange={loadData}
                  />
                </div>

                <Separator />

                {/* SECTION C: Payment Status (Client Money) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Overall Payment Status</h3>
                    {getPaymentStatusBadge(recordData.status)}
                  </div>
                  
                  <Card>
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Amount Per Month</p>
                            <p className="text-2xl font-bold">£{recordData.amount?.toLocaleString() || '0'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Next Due</p>
                            <p className="font-medium">
                              {recordData.next_payment_due 
                                ? format(new Date(recordData.next_payment_due), "MMM dd, yyyy")
                                : 'Paid in Full'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Contract Progress</p>
                            <p className="font-medium">{recordData.payments_completed || 0}/{recordData.contract_term_months || 1} payments</p>
                          </div>
                          {recordData.paid_in_full && (
                            <Badge className="bg-green-500/20 text-green-400">Paid in Full</Badge>
                          )}
                        </div>
                        
                        <Separator />
                        
                        <div className="grid grid-cols-2 gap-2">
                          <Button 
                            onClick={() => handlePaymentStatusChange('paid', recordData.amount)}
                            disabled={statusUpdateLoading || recordData.status === 'paid'}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Mark as Paid
                          </Button>
                          <Button 
                            onClick={() => handlePaymentStatusChange('partial')}
                            disabled={statusUpdateLoading || recordData.status === 'partial'}
                            variant="outline"
                            className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                          >
                            <DollarSign className="h-4 w-4 mr-2" />
                            Mark as Partial
                          </Button>
                          <Button 
                            onClick={() => handlePaymentStatusChange('written_off')}
                            disabled={statusUpdateLoading || recordData.status === 'written_off'}
                            variant="outline"
                            className="border-gray-500/50 text-gray-400 hover:bg-gray-500/10"
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            Write Off
                          </Button>
                          <Button 
                            onClick={() => handlePaymentStatusChange('due')}
                            disabled={statusUpdateLoading || recordData.status === 'due'}
                            variant="outline"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Revert to Due
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <Separator />
              </>
            )}

            {/* Partial Payments History */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Partial Payments</h3>
                <Button size="sm" onClick={() => setAddPaymentOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Payment
                </Button>
              </div>

              {partialPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No partial payments recorded</p>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partialPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{format(new Date(payment.payment_date), "MMM dd, yyyy")}</TableCell>
                          <TableCell className="font-medium">£{payment.amount.toLocaleString()}</TableCell>
                          <TableCell className="capitalize">{payment.payment_method?.replace('_', ' ')}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{payment.notes || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <Separator />

            {/* SECTION C: Payment History (Audit Trail) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Payment History (Audit Log)</h3>
              </div>

              {paymentHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No payment status changes recorded</p>
              ) : (
                <div className="space-y-2">
                  {paymentHistory.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {getActionBadge(entry.action)}
                          {entry.amount && (
                            <span className="text-sm font-medium">£{entry.amount.toLocaleString()}</span>
                          )}
                        </div>
                        {entry.notes && (
                          <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(entry.created_at), "MMM dd, yyyy 'at' HH:mm")}
                          {entry.admin_email && ` • ${entry.admin_email}`}
                          {!entry.admin_user_id && ' • System'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Documents Upload */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Documents</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Upload Invoice</Label>
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, "invoice");
                    }}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Upload Proof of Payment</Label>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, "proof");
                    }}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Upload Receipt</Label>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, "receipt");
                    }}
                    className="mt-2"
                  />
                </div>
              </div>

              {recordData?.invoice_url && (
                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <FileText className="w-5 h-5" />
                  <span className="flex-1 text-sm">Invoice on file</span>
                  <Button size="sm" variant="ghost">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {recordData?.proof_url && (
                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <FileText className="w-5 h-5" />
                  <span className="flex-1 text-sm">Proof of payment on file</span>
                  <Button size="sm" variant="ghost">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {recordData?.receipt_url && (
                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <FileText className="w-5 h-5" />
                  <span className="flex-1 text-sm">Receipt on file</span>
                  <Button size="sm" variant="ghost">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Payment Dialog */}
      <Dialog open={addPaymentOpen} onOpenChange={setAddPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount (£)</Label>
              <Input
                type="number"
                value={newPayment.amount}
                onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={newPayment.payment_date}
                className="[color-scheme:dark]"
                onChange={(e) => setNewPayment({ ...newPayment, payment_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select
                value={newPayment.payment_method}
                onValueChange={(value) => setNewPayment({ ...newPayment, payment_method: value })}
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
            <div>
              <Label>Notes (Optional)</Label>
              <Input
                value={newPayment.notes}
                onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                placeholder="Payment notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPaymentOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddPayment}>
              Add Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this billing entry and all associated payment history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEntry}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invoice Preview Modal */}
      {clientData && recordData && (
        <InvoicePreviewModal
          open={invoiceModalOpen}
          onOpenChange={setInvoiceModalOpen}
          contactName={clientData.contact_name || 'N/A'}
          contactEmail={clientData.email || recordData.primary_email || ''}
          companyName={clientData.company_name}
          recordId={recordData.id}
          invoiceData={recordData}
          onInvoiceSent={loadData}
        />
      )}

      {/* Defer Payment Modal */}
      {recordData && (
        <DeferPaymentModal
          open={deferModalOpen}
          onOpenChange={setDeferModalOpen}
          recordId={recordData.id}
          currentNextDue={recordData.next_payment_due}
          onSuccess={loadData}
        />
      )}

      {/* Cease Account Confirmation */}
      <AlertDialog open={ceaseDialogOpen} onOpenChange={setCeaseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cease Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the client as ceased. Their billing entry will move to the bottom of the tracker and be excluded from outstanding payments, MRR, and projections. You can reactivate them later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCeaseAccount}
              className="bg-orange-600 text-white hover:bg-orange-700"
            >
              Cease Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
