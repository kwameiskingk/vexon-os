import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, CheckCircle2, Calendar, Clock, Mail, PauseCircle, ChevronDown } from "lucide-react";
import { format, addDays, isToday, isBefore, isAfter } from "date-fns";
import { usePersistedState } from "@/hooks/usePersistedState";

interface FollowupItem {
  id: string;
  type: 'overdue' | 'due_today' | 'due_this_week' | 'invoice_issue' | 'deferred';
  company_name: string;
  contact_name: string | null;
  amount: number | null;
  next_payment_due: string | null;
  issue?: string;
  deferral_end_date?: string | null;
  deferral_reason?: string | null;
}

export const AccountingFollowups = memo(() => {
  const [isOpen, setIsOpen] = usePersistedState('accounting-followups-collapsed', true);
  const { data: followups = [], isLoading } = useQuery({
    queryKey: ['accounting-followups-enhanced'],
    queryFn: async () => {
      const today = new Date();
      const weekFromNow = addDays(today, 7);
      
      const { data, error } = await supabase
        .from('accounting_records')
        .select(`
          id,
          next_payment_due,
          status,
          amount,
          client_profile_id,
          primary_email,
          accounts_email,
          invoice_external_status,
          is_deferred,
          deferral_reason,
          deferral_end_date,
          client_profiles!inner(company_name, contact_name, email)
        `)
        .not('paid_in_full', 'eq', true)
        .not('is_ceased', 'eq', true)
        .order('next_payment_due', { ascending: true });
      
      if (error) throw error;
      
      const items: FollowupItem[] = [];
      
      (data || []).forEach((record: any) => {
        const dueDate = record.next_payment_due ? new Date(record.next_payment_due) : null;
        
        // Check if deferred - show in separate section
        if (record.is_deferred) {
          items.push({
            id: record.id,
            type: 'deferred',
            company_name: record.client_profiles.company_name,
            contact_name: record.client_profiles.contact_name,
            amount: record.amount,
            next_payment_due: record.next_payment_due,
            deferral_end_date: record.deferral_end_date,
            deferral_reason: record.deferral_reason
          });
          return; // Skip other checks for deferred records
        }
        
        // Check for overdue
        if (dueDate && isBefore(dueDate, today) && record.status !== 'paid') {
          items.push({
            id: record.id,
            type: 'overdue',
            company_name: record.client_profiles.company_name,
            contact_name: record.client_profiles.contact_name,
            amount: record.amount,
            next_payment_due: record.next_payment_due
          });
        }
        // Check for due today
        else if (dueDate && isToday(dueDate) && record.status !== 'paid') {
          items.push({
            id: record.id,
            type: 'due_today',
            company_name: record.client_profiles.company_name,
            contact_name: record.client_profiles.contact_name,
            amount: record.amount,
            next_payment_due: record.next_payment_due
          });
        }
        // Check for due this week
        else if (dueDate && isAfter(dueDate, today) && isBefore(dueDate, weekFromNow) && record.status !== 'paid') {
          items.push({
            id: record.id,
            type: 'due_this_week',
            company_name: record.client_profiles.company_name,
            contact_name: record.client_profiles.contact_name,
            amount: record.amount,
            next_payment_due: record.next_payment_due
          });
        }
        
        // Check for invoice issues (not sent + missing email)
        const hasEmail = record.primary_email || record.accounts_email || record.client_profiles.email;
        const invoiceNotSent = !record.invoice_external_status || record.invoice_external_status === 'pending';
        
        if (invoiceNotSent && !hasEmail) {
          items.push({
            id: `${record.id}-email`,
            type: 'invoice_issue',
            company_name: record.client_profiles.company_name,
            contact_name: record.client_profiles.contact_name,
            amount: record.amount,
            next_payment_due: record.next_payment_due,
            issue: 'Missing email - cannot send invoice'
          });
        } else if (invoiceNotSent && record.next_payment_due && isBefore(new Date(record.next_payment_due), weekFromNow)) {
          items.push({
            id: `${record.id}-invoice`,
            type: 'invoice_issue',
            company_name: record.client_profiles.company_name,
            contact_name: record.client_profiles.contact_name,
            amount: record.amount,
            next_payment_due: record.next_payment_due,
            issue: 'Invoice not sent'
          });
        }
      });
      
      return items;
    },
    refetchInterval: 300000,
    staleTime: 240000,
  });

  const overdueItems = followups.filter(f => f.type === 'overdue');
  const dueTodayItems = followups.filter(f => f.type === 'due_today');
  const dueThisWeekItems = followups.filter(f => f.type === 'due_this_week');
  const invoiceIssues = followups.filter(f => f.type === 'invoice_issue');
  const deferredItems = followups.filter(f => f.type === 'deferred');

  // Active follow-ups don't include deferred
  const activeCount = overdueItems.length + dueTodayItems.length + dueThisWeekItems.length + invoiceIssues.length;
  const totalCount = activeCount + deferredItems.length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Accounting Follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (totalCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Accounting Follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-center">
            <div className="space-y-2">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500/50" />
              <p className="text-lg font-medium text-green-500">All Clear</p>
              <p className="text-sm text-muted-foreground">No accounting follow-ups needed</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderItem = (item: FollowupItem, badgeVariant: 'destructive' | 'default' | 'secondary', icon: React.ReactNode) => (
    <div key={item.id} className="p-3 border rounded-lg bg-card/50 transition-all duration-200 hover:bg-card/80">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {icon}
            <p className="font-medium">{item.company_name}</p>
          </div>
          <p className="text-sm text-muted-foreground ml-6">
            {item.contact_name || 'No contact'}
          </p>
          {item.type === 'deferred' ? (
            <>
              {item.deferral_reason && (
                <p className="text-xs text-purple-400 mt-1 ml-6">{item.deferral_reason}</p>
              )}
              {item.deferral_end_date && (
                <p className="text-xs text-muted-foreground mt-1 ml-6">
                  Resumes: {format(new Date(item.deferral_end_date), 'MMM dd, yyyy')}
                </p>
              )}
            </>
          ) : (
            <>
              {item.next_payment_due && (
                <p className="text-xs text-muted-foreground mt-1 ml-6">
                  Due: {format(new Date(item.next_payment_due), 'MMM dd, yyyy')}
                </p>
              )}
              {item.issue && (
                <p className="text-xs text-yellow-500 mt-1 ml-6">{item.issue}</p>
              )}
            </>
          )}
        </div>
        <div className="text-right">
          {item.amount && (
            <p className="font-medium">£{item.amount.toLocaleString()}</p>
          )}
          <Badge variant={badgeVariant} className="mt-1">
            {item.type === 'overdue' ? 'OVERDUE' : 
             item.type === 'due_today' ? 'DUE TODAY' :
             item.type === 'due_this_week' ? 'DUE SOON' : 
             item.type === 'deferred' ? 'DEFERRED' : 'ISSUE'}
          </Badge>
        </div>
      </div>
    </div>
  );

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
            <CardTitle className="flex items-center gap-2">
              {activeCount > 0 ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              Accounting Follow-ups
              {activeCount > 0 && (
                <Badge variant="destructive">{activeCount}</Badge>
              )}
              <ChevronDown className={`h-4 w-4 ml-auto transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Overdue Payments */}
            {overdueItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> Overdue ({overdueItems.length})
                </p>
                {overdueItems.map(item => 
                  renderItem(item, 'destructive', <AlertCircle className="h-4 w-4 text-destructive" />)
                )}
              </div>
            )}

            {/* Due Today */}
            {dueTodayItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-yellow-500 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Due Today ({dueTodayItems.length})
                </p>
                {dueTodayItems.map(item => 
                  renderItem(item, 'default', <Clock className="h-4 w-4 text-yellow-500" />)
                )}
              </div>
            )}

            {/* Due This Week */}
            {dueThisWeekItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-blue-400 flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Due This Week ({dueThisWeekItems.length})
                </p>
                {dueThisWeekItems.map(item => 
                  renderItem(item, 'secondary', <Calendar className="h-4 w-4 text-blue-400" />)
                )}
              </div>
            )}

            {/* Invoice Issues */}
            {invoiceIssues.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-orange-400 flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Invoice Issues ({invoiceIssues.length})
                </p>
                {invoiceIssues.map(item => 
                  renderItem(item, 'secondary', <Mail className="h-4 w-4 text-orange-400" />)
                )}
              </div>
            )}

            {/* Show "All Clear" if no active issues but deferred exist */}
            {activeCount === 0 && deferredItems.length > 0 && (
              <div className="flex items-center justify-center py-4 text-center border-b">
                <div className="space-y-1">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-green-500/50" />
                  <p className="text-sm font-medium text-green-500">No Active Follow-ups</p>
                </div>
              </div>
            )}

            {/* Deferred Payments */}
            {deferredItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-purple-400 flex items-center gap-2">
                  <PauseCircle className="h-4 w-4" /> Deferred Payments ({deferredItems.length})
                </p>
                {deferredItems.map(item => 
                  renderItem(item, 'secondary', <PauseCircle className="h-4 w-4 text-purple-400" />)
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
});

AccountingFollowups.displayName = 'AccountingFollowups';
