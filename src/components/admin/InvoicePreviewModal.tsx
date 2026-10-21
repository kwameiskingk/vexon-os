import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ExternalLink } from "lucide-react";

interface InvoicePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName: string;
  contactEmail: string;
  companyName: string;
  recordId: string;
  invoiceData?: any;
  onInvoiceSent?: () => void;
}

export function InvoicePreviewModal({
  open,
  onOpenChange,
  contactName,
  contactEmail,
  companyName,
  recordId,
  invoiceData: externalInvoiceData,
  onInvoiceSent
}: InvoicePreviewModalProps) {
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_date: new Date().toISOString().split('T')[0],
    amount: externalInvoiceData?.amount || '',
    payment_method: externalInvoiceData?.payment_method || '',
    service_description: 'Recruitment Services',
    notes: externalInvoiceData?.notes || ''
  });
  const [sending, setSending] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordVerified, setPasswordVerified] = useState(false);
  
  // Reset password verification when modal closes
  useEffect(() => {
    if (!open) {
      setPassword('');
      setPasswordVerified(false);
    }
  }, [open]);
  
  // Check invoice lifecycle status (separate from payment status)
  const invoiceStatus = externalInvoiceData?.invoice_external_status?.toLowerCase();
  const isSent = invoiceStatus === 'sent';
  const isSending = invoiceStatus === 'sending';
  const isFailed = invoiceStatus === 'failed';

  const handleVerifyPassword = async () => {
    if (!password) {
      toast.error("Please enter your password");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Not authenticated");
        return;
      }

      // Verify password by attempting to sign in
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: password
      });

      if (error) {
        toast.error("Invalid password");
        setPassword('');
        return;
      }

      setPasswordVerified(true);
      toast.success("Password verified");
    } catch (error: any) {
      toast.error("Failed to verify password");
      setPassword('');
    }
  };

  const handleSend = async () => {
    if (!passwordVerified) {
      toast.error("Please verify your password first");
      return;
    }

    if (!invoiceForm.amount || !invoiceForm.payment_method) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSending(true);
    
    try {
      // Generate correlation ID
      const correlationId = crypto.randomUUID();

      // Build invoice payload for Zapier
      const invoicePayload = {
        correlation_id: correlationId,
        invoice_id: recordId,
        contact_name: contactName,
        contact_email: contactEmail,
        company_name: companyName,
        invoice_date: invoiceForm.invoice_date,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        amount: parseFloat(invoiceForm.amount),
        invoice_number: externalInvoiceData?.invoice_number || `INV-${Date.now()}`,
        payment_method: invoiceForm.payment_method,
        notes: invoiceForm.notes || '',
        items: [
          {
            description: invoiceForm.service_description,
            quantity: 1,
            unit_price: parseFloat(invoiceForm.amount),
            account_code: '200',
            tax_type: 'NONE'
          }
        ]
      };

      console.log('Sending invoice to Xero:', invoicePayload);

      // Update invoice status to "sending" - ONLY invoice_external_status, NOT payment status
      const { error: updateError } = await supabase
        .from('accounting_records')
        .update({
          send_method: 'xero',
          correlation_id: correlationId,
          invoice_external_status: 'sending',
          external_status: 'SENDING' // Keep for backward compatibility
          // NOTE: We do NOT touch 'status' here - that's the payment lifecycle
        })
        .eq('id', recordId);

      if (updateError) throw updateError;

      // Send to Zapier via edge function (which has access to the secret)
      const { data, error: functionError } = await supabase.functions.invoke('send-xero-invoice', {
        body: invoicePayload
      });

      if (functionError) throw functionError;

      toast.success("Invoice sent to Xero! Waiting for confirmation...");
      
      // Trigger parent refresh immediately so UI shows "Sending" state
      onInvoiceSent?.();
      
      onOpenChange(false);
      
    } catch (error: any) {
      console.error('Failed to send invoice:', error);
      toast.error("Failed to send invoice: " + (error.message || 'Unknown error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Invoice Preview</SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Invoice Form - only show if not sent/sending */}
          {!isSent && !isSending && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceForm.invoice_date}
                  className="[color-scheme:dark]"
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Amount (£)</Label>
                <Input
                  type="number"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select
                  value={invoiceForm.payment_method}
                  onValueChange={(value) => setInvoiceForm({ ...invoiceForm, payment_method: value })}
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
              <div className="col-span-2">
                <Label>Service Description</Label>
                <Input
                  value={invoiceForm.service_description}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, service_description: e.target.value })}
                  placeholder="e.g., Recruitment Services, Consulting Services..."
                />
              </div>
              <div className="col-span-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={invoiceForm.notes}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                  placeholder="Additional notes for invoice..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Invoice Preview */}
          <div className="border border-border rounded-lg p-6 bg-card">
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold">INVOICE</h3>
                  <p className="text-sm text-muted-foreground">Vexon OS</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{invoiceForm.invoice_date}</p>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">Bill To:</p>
                <p className="font-medium">{companyName}</p>
                <p className="text-sm text-muted-foreground">{contactName}</p>
                <p className="text-sm text-muted-foreground">{contactEmail}</p>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service</span>
                  <span>{invoiceForm.service_description}</span>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-muted-foreground">Payment Method</span>
                  <span className="capitalize">{invoiceForm.payment_method.replace('_', ' ')}</span>
                </div>
                {invoiceForm.notes && (
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground">Notes:</p>
                    <p className="text-sm">{invoiceForm.notes}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4 flex justify-between text-lg font-bold">
                <span>Total Amount</span>
                <span className="text-primary">£{invoiceForm.amount || '0.00'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3 border-t pt-6">
          {isSent && (
            <div className="flex flex-col gap-2 flex-1">
              <Badge variant="default" className="w-fit bg-green-600">Invoice Sent via Xero</Badge>
              <p className="text-sm text-muted-foreground">
                This invoice has been sent. Payment status can be updated separately.
              </p>
              {externalInvoiceData?.external_invoice_number && (
                <p className="text-sm text-muted-foreground">
                  Xero Invoice: {externalInvoiceData.external_invoice_number}
                </p>
              )}
              {externalInvoiceData?.external_invoice_url && (
                <a 
                  href={externalInvoiceData.external_invoice_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  View in Xero <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
          
          {isSending && (
            <Badge variant="secondary" className="w-fit">
              <Loader2 className="h-3 w-3 mr-2 animate-spin" />
              Sending to Xero...
            </Badge>
          )}
          
          {!isSent && !isSending && !passwordVerified && (
            <div className="w-full space-y-3">
              <div className="p-4 border border-yellow-500/50 bg-yellow-500/10 rounded-lg">
                <p className="text-sm font-medium text-yellow-600 dark:text-yellow-500 mb-2">
                  🔒 Password Required
                </p>
                <p className="text-sm text-muted-foreground mb-3">
                  To prevent accidental invoicing, please verify your password before sending.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerifyPassword()}
                  />
                  <Button onClick={handleVerifyPassword} variant="default">
                    Verify
                  </Button>
                </div>
              </div>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
                Cancel
              </Button>
            </div>
          )}

          {!isSent && !isSending && passwordVerified && (
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={sending} className="flex-1">
                {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send Invoice
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
