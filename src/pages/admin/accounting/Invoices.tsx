import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Upload, FileText, Eye, Trash2 } from "lucide-react";
import { format } from "date-fns";

export default function AccountingInvoices() {
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    client_id: '',
    invoice_number: '',
    amount: '',
    due_date: '',
    description: ''
  });

  // Fetch clients for dropdown. Pending (still-in-onboarding) clients are
  // included on purpose — invoicing typically happens the same week as close,
  // before onboarding is completed. Inactive clients stay excluded.
  const { data: clients = [] } = useQuery({
    queryKey: ['clients-dropdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_profiles')
        .select('id, company_name, status')
        .in('status', ['active', 'pending'])
        .order('company_name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch invoices
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          client_profiles (
            company_name
          )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Create invoice mutation
  const createInvoice = useMutation({
    mutationFn: async (data: any) => {
      let filePath = null;
      
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}_${data.invoice_number}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(fileName, selectedFile);
        
        if (uploadError) throw uploadError;
        filePath = uploadData.path;
      }

      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('invoices').insert({
        client_id: data.client_id,
        invoice_number: data.invoice_number,
        amount: parseFloat(data.amount),
        due_date: data.due_date || null,
        description: data.description || null,
        file_path: filePath,
        status: 'draft',
        created_by: user.user?.id
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice created successfully');
      setCreateModalOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create invoice');
    }
  });

  // Update status mutation
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updateData: any = { status };
      if (status === 'sent') {
        updateData.sent_at = new Date().toISOString();
      } else if (status === 'paid') {
        updateData.paid_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Status updated');
    }
  });

  // Delete invoice mutation
  const deleteInvoice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice deleted');
    }
  });

  const resetForm = () => {
    setFormData({
      client_id: '',
      invoice_number: '',
      amount: '',
      due_date: '',
      description: ''
    });
    setSelectedFile(null);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-500/15 text-gray-500 border-gray-500/30',
      sent: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
      paid: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
      overdue: 'bg-red-500/15 text-red-500 border-red-500/30',
      cancelled: 'bg-gray-500/15 text-gray-500 border-gray-500/30'
    };
    return <Badge className={styles[status] || styles.draft}>{status}</Badge>;
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="Invoices"
          subtitle="Upload and track invoice documents"
          actions={
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Invoice
            </Button>
          }
        />
        
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading invoices...</div>
            ) : invoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No invoices yet. Create your first invoice.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice: any) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell>{invoice.client_profiles?.company_name || '—'}</TableCell>
                      <TableCell>£{invoice.amount?.toLocaleString()}</TableCell>
                      <TableCell>
                        {invoice.due_date ? format(new Date(invoice.due_date), 'dd MMM yyyy') : '—'}
                      </TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell>{format(new Date(invoice.created_at), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {invoice.file_path && (
                            <Button size="sm" variant="ghost">
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Select
                            value={invoice.status}
                            onValueChange={(value) => updateStatus.mutate({ id: invoice.id, status: value })}
                          >
                            <SelectTrigger className="w-24 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="sent">Sent</SelectItem>
                              <SelectItem value="paid">Paid</SelectItem>
                              <SelectItem value="overdue">Overdue</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-destructive"
                            onClick={() => deleteInvoice.mutate(invoice.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Invoice Modal */}
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Invoice</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label>Client *</Label>
                <Select
                  value={formData.client_id}
                  onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client: any) => (
                      <SelectItem key={client.id} value={client.id}>
                        <span className="flex items-center gap-2">
                          {client.company_name}
                          {client.status === 'pending' && (
                            <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px] font-medium px-1.5 py-0">
                              Onboarding
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Invoice Number *</Label>
                <Input
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                  placeholder="INV-001"
                />
              </div>

              <div>
                <Label>Amount (£) *</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="[color-scheme:dark]"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Invoice description..."
                />
              </div>

              <div>
                <Label>Invoice PDF</Label>
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createInvoice.mutate(formData)}
                disabled={!formData.client_id || !formData.invoice_number || !formData.amount}
              >
                <Upload className="w-4 h-4 mr-2" />
                Create Invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  );
}
