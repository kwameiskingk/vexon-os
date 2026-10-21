import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo, useEffect } from "react";
import { RevenueWidget } from "@/components/admin/RevenueWidget";
import { AccountingDetailPanel } from "@/components/admin/AccountingDetailPanel";
import { AccountingClientDrawer } from "@/components/admin/AccountingClientDrawer";
import { Eye, Search, Download, Plus, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function OperationsAccounting() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Subscribe to real-time updates on accounting_records - invalidate ALL accounting queries
  useEffect(() => {
    const channel = supabase
      .channel('accounting-records-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accounting_records'
        },
        () => {
          // Refetch ALL accounting-related data when any change occurs
          queryClient.invalidateQueries({ queryKey: ['accounting-clients-full'] });
          queryClient.invalidateQueries({ queryKey: ['revenue-stats'] });
          queryClient.invalidateQueries({ queryKey: ['accounting-followups-enhanced'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Fetch active + pending clients with their accounting records and
  // installments. Pending (still-in-onboarding) clients are included on
  // purpose — payment plans are set up in the close week, before onboarding
  // completes. They surface in the "no record" group until a record exists.
  // Inactive clients stay excluded.
  const { data: clientsData, isLoading } = useQuery({
    queryKey: ['accounting-clients-full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_profiles')
        .select(`
          id,
          company_name,
          contact_name,
          email,
          phone,
          status,
          accounting_records (
            id,
            amount,
            payment_method,
            first_payment_date,
            next_payment_due,
            status,
            primary_email,
            accounts_email,
            invoice_number,
            created_at,
            external_status,
            external_invoice_number,
            sent_at,
            contract_term_months,
            payments_completed,
            paid_in_full,
            is_deferred,
            deferral_reason,
            deferral_end_date,
            original_next_payment_due,
            is_ceased,
            ceased_at,
            is_deferred,
            deferral_reason,
            deferral_end_date,
            original_next_payment_due,
            payment_installments (
              id,
              is_deferred
            )
          )
        `)
        .in('status', ['active', 'pending'])
        .order('company_name', { ascending: true });
      
      if (error) throw error;
      return data;
    }
  });

  // Transform data to match previous structure and sort by created_at (newest first)
  const accountingRecords = useMemo(() => {
    if (!clientsData) return [];
    const records = clientsData.map(client => {
      const record = client.accounting_records?.[0];
      return {
        id: record?.id || null,
        client_profile_id: client.id,
        amount: record?.amount || 0,
        payment_method: record?.payment_method || 'other',
        first_payment_date: record?.first_payment_date || null,
        next_payment_due: record?.next_payment_due || null,
        status: record?.status || 'due',
        primary_email: record?.primary_email || client.email,
        accounts_email: record?.accounts_email || null,
        invoice_number: record?.invoice_number || null,
        created_at: record?.created_at || null,
        external_status: record?.external_status || null,
        external_invoice_number: record?.external_invoice_number || null,
        sent_at: record?.sent_at || null,
        contract_term_months: record?.contract_term_months || 1,
        payments_completed: record?.payments_completed || 0,
        paid_in_full: record?.paid_in_full || false,
        is_ceased: (record as any)?.is_ceased || false,
        ceased_at: (record as any)?.ceased_at || null,
        client_profiles: {
          id: client.id,
          company_name: client.company_name,
          contact_name: client.contact_name,
          email: client.email,
          phone: client.phone,
          status: (client as any).status ?? null,
        },
        has_record: !!record,
        has_deferred_installment: record?.payment_installments?.some((pi: any) => pi.is_deferred) || false,
      };
    });
    
    // Sort: active records first (by created_at desc), then ceased records, then records without entries
    return records.sort((a, b) => {
      const aGroup = !a.has_record ? 2 : a.is_ceased ? 1 : 0;
      const bGroup = !b.has_record ? 2 : b.is_ceased ? 1 : 0;
      
      if (aGroup !== bGroup) return aGroup - bGroup;
      
      // Within same group: records with dates sort by created_at desc, otherwise alphabetical
      if (a.has_record && b.has_record && a.created_at && b.created_at) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      
      return (a.client_profiles?.company_name || '').localeCompare(b.client_profiles?.company_name || '');
    });
  }, [clientsData]);

  const getStatusBadge = (record: any) => {
    if (record.is_ceased) {
      return <Badge className="bg-orange-500/15 text-orange-500 border-orange-500/30 text-xs font-medium px-2 py-0.5">Ceased</Badge>;
    }
    if (record.is_deferred) {
      return <Badge className="bg-purple-500/15 text-purple-500 border-purple-500/30 text-xs font-medium px-2 py-0.5">Deferred</Badge>;
    }
    if (!record.next_payment_due) return <Badge variant="secondary" className="text-xs font-medium px-2 py-0.5">No Date</Badge>;
    
    const today = new Date();
    const dueDate = new Date(record.next_payment_due);
    const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (record.status === 'overdue' || daysDiff < 0) {
      return <Badge className="bg-red-500/15 text-red-500 border-red-500/30 text-xs font-medium px-2 py-0.5">Overdue</Badge>;
    } else if (daysDiff <= 7) {
      return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-xs font-medium px-2 py-0.5">Due Soon</Badge>;
    } else {
      return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-xs font-medium px-2 py-0.5">Up to Date</Badge>;
    }
  };

  const handleOpenDetailPanel = (record: any) => {
    setSelectedClient(record.client_profiles);
    setSelectedRecordId(record.id);
    setDetailPanelOpen(true);
  };

  const handleOpenCreateDrawer = (record: any) => {
    setSelectedClient(record.client_profiles);
    setCreateDrawerOpen(true);
  };

  // Filtering logic
  const filteredRecords = useMemo(() => {
    let filtered = accountingRecords || [];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(record => 
        record.client_profiles?.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.client_profiles?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      const today = new Date();
      filtered = filtered.filter(record => {
        if (!record.next_payment_due) return filterStatus === 'no_date';
        
        const dueDate = new Date(record.next_payment_due);
        const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        switch (filterStatus) {
          case 'overdue':
            return daysDiff < 0 || record.status === 'overdue';
          case 'due_week':
            return daysDiff >= 0 && daysDiff <= 7;
          case 'paid_month':
            return record.status === 'paid';
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [accountingRecords, searchTerm, filterStatus]);

  const handleExportCSV = () => {
    if (!filteredRecords || filteredRecords.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ['Client', 'Email', 'Invoice #', 'Amount', 'Payment Method', 'First Payment', 'Next Due', 'Status'];
    const rows = filteredRecords.map(record => [
      record.client_profiles?.company_name || '',
      record.client_profiles?.email || '',
      record.invoice_number || '',
      record.amount || 0,
      record.payment_method || '',
      record.first_payment_date || '',
      record.next_payment_due || '',
      record.status || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounting-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export complete");
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="Accounting"
          subtitle="Manage client billing and payments"
          actions={
            <Button onClick={handleExportCSV} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          }
        />
        <div className="space-y-6">

        <RevenueWidget />

        {/* Filters */}
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by client, email, or invoice #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filterStatus === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('all')}
            >
              All
            </Button>
            <Button
              variant={filterStatus === 'overdue' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('overdue')}
            >
              Overdue Only
            </Button>
            <Button
              variant={filterStatus === 'due_week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('due_week')}
            >
              Due This Week
            </Button>
            <Button
              variant={filterStatus === 'paid_month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('paid_month')}
            >
              Paid This Month
            </Button>
          </div>
        </div>

        {/* Main Table */}
        {isLoading ? (
          <div className="text-center py-8">Loading accounting data...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No records found</div>
        ) : (
          <div className="border rounded-lg bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[200px]">Client</TableHead>
                  <TableHead className="w-[100px]">Monthly</TableHead>
                  <TableHead className="w-[120px]">Method</TableHead>
                  <TableHead className="w-[110px]">First Payment</TableHead>
                  <TableHead className="w-[110px]">Next Due</TableHead>
                  <TableHead className="w-[90px]">Progress</TableHead>
                  <TableHead className="w-[90px]">Status</TableHead>
                  <TableHead className="w-[70px] text-center">Deferred</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record) => (
                  <TableRow key={record.client_profile_id} className={`group ${record.is_ceased ? 'opacity-50' : ''}`}>
                    <TableCell>
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <div className="cursor-pointer">
                            <p className="font-medium text-sm leading-tight flex items-center gap-1.5">
                              {record.client_profiles?.company_name}
                              {(record.client_profiles as any)?.status === 'pending' && (
                                <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px] font-medium px-1.5 py-0">
                                  Onboarding
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{record.client_profiles?.contact_name || '—'}</p>
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-72" align="start">
                          <div className="space-y-2">
                            <h4 className="font-semibold text-sm">{record.client_profiles?.company_name}</h4>
                            <div className="text-xs space-y-1.5 text-muted-foreground">
                              <p><span className="font-medium text-foreground">Contact:</span> {record.client_profiles?.contact_name || '—'}</p>
                              <p><span className="font-medium text-foreground">Email:</span> {record.client_profiles?.email || '—'}</p>
                              <p><span className="font-medium text-foreground">Phone:</span> {record.client_profiles?.phone || '—'}</p>
                              <p><span className="font-medium text-foreground">Invoice:</span> {record.invoice_number || '—'}</p>
                            </div>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-sm tabular-nums">£{record.amount?.toLocaleString() || 0}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground capitalize">{record.payment_method?.replace('_', ' ') || '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm tabular-nums">{record.first_payment_date ? format(new Date(record.first_payment_date), 'dd MMM yy') : '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm tabular-nums">{record.next_payment_due ? format(new Date(record.next_payment_due), 'dd MMM yy') : '—'}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium tabular-nums">
                          {record.payments_completed || 0}/{record.contract_term_months || 1}
                        </span>
                        {record.paid_in_full && (
                          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] font-medium px-1.5 py-0">Done</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(record)}
                    </TableCell>
                    <TableCell className="text-center">
                      {record.has_deferred_installment && (
                        <Check className="w-4 h-4 text-primary mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {record.has_record ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-3 text-xs opacity-70 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleOpenDetailPanel(record)}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1.5" />
                          Details
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 px-3 text-xs"
                          onClick={() => handleOpenCreateDrawer(record)}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Add Billing
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        </div>

        {/* Modals */}
        {selectedClient && (
          <>
            <AccountingDetailPanel
              open={detailPanelOpen}
              onOpenChange={setDetailPanelOpen}
              clientProfileId={selectedClient.id}
              recordId={selectedRecordId}
            />
            <AccountingClientDrawer
              open={createDrawerOpen}
              onOpenChange={setCreateDrawerOpen}
              clientProfileId={selectedClient.id}
              clientName={selectedClient.company_name}
              clientEmail={selectedClient.email || ''}
            />
          </>
        )}
      </PageContainer>
    </DashboardLayout>
  );
}
