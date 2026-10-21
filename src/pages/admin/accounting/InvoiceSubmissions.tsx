import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, subDays } from "date-fns";
import { CheckCircle, Clock, DollarSign, Eye, Search, AlertTriangle, PlayCircle, FileText, Loader2, BadgePoundSterling } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/payroll";
import { getCommissionCycleDates } from "@/utils/commissionCycle";
import { InvoiceDetailDrawer } from "@/components/accounting/InvoiceDetailDrawer";
import { PayoutSummaryModal } from "@/components/accounting/PayoutSummaryModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export default function InvoiceSubmissions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [detailSubmission, setDetailSubmission] = useState<any>(null);
  const [payoutSummary, setPayoutSummary] = useState<any>(null);
  const [compileOpen, setCompileOpen] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [markPaidTarget, setMarkPaidTarget] = useState<any>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  // Default to the 26th→25th payroll cycle containing yesterday (so compiling
  // on the 26th still targets the just-ended cycle); end clamped to today.
  const defaultCycle = getCommissionCycleDates(subDays(new Date(), 1));
  const [cycleEndDate, setCycleEndDate] = useState(
    format(defaultCycle.end > new Date() ? new Date() : defaultCycle.end, "yyyy-MM-dd")
  );
  const [cycleStartDate, setCycleStartDate] = useState(format(defaultCycle.start, "yyyy-MM-dd"));
  const cycleStart = cycleStartDate;

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["all-invoice-submissions-v2", statusFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("invoice_submissions")
        .select(`*, setters_profiles (full_name, email, per_meeting_bonus, department, title, base_salary, currency, home_address, bank_name, account_holder_name, account_number, sort_code, iban, swift_bic, bank_country, bank_address)`)
        .order("submitted_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data || []) as any[];
      // AE/staff lines have no setter join — resolve their names from profiles
      const orphanIds = Array.from(new Set(rows.filter((r) => !r.setters_profiles && r.user_id).map((r) => r.user_id)));
      if (orphanIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", orphanIds);
        const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
        for (const r of rows) {
          if (!r.setters_profiles && r.user_id) {
            const p = profMap.get(r.user_id);
            r.display_name = p?.full_name || p?.email || "Unknown";
            r.display_email = p?.email || "";
          }
        }
      }
      return rows;
    },
  });

  const filteredSubmissions = submissions.filter((sub: any) => {
    if (!searchTerm) return true;
    const name = sub.setters_profiles?.full_name || sub.setters_profiles?.email || sub.display_name || "";
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleMarkPaid = async () => {
    if (!markPaidTarget) return;
    setMarkingPaid(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("invoice_submissions")
        .update({ status: "paid", paid_at: new Date().toISOString(), paid_by: u.user?.id })
        .eq("id", markPaidTarget.id)
        .eq("status", "approved");
      if (error) throw error;
      toast({ title: "Marked as paid", description: "Recorded as paid — no money was moved by Vexon OS." });
      setMarkPaidTarget(null);
      queryClient.invalidateQueries({ queryKey: ["all-invoice-submissions-v2"] });
    } catch (err: any) {
      toast({ title: "Failed to mark as paid", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setMarkingPaid(false);
    }
  };

  // Grand total per currency across the visible (filtered) list
  const grandTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of filteredSubmissions) {
      const cur = s.currency || s.setters_profiles?.currency || "USD";
      const amt = Number(s.grand_total ?? s.total_commission ?? 0);
      map[cur] = (map[cur] || 0) + amt;
    }
    return map;
  }, [filteredSubmissions]);

  const pendingCount = submissions.filter((s: any) => ["submitted", "compiled"].includes(s.status)).length;

  const handleCompile = async () => {
    setCompiling(true);
    try {
      const { data, error } = await supabase.functions.invoke("compile-payroll-cycle", {
        body: { period_start: cycleStart, period_end: cycleEndDate, departments: ["acquisition", "fulfilment"] },
      });
      if (error) throw error;
      toast({
        title: "Billing cycle compiled",
        description: `${data?.compiled_count ?? 0} invoice line${(data?.compiled_count ?? 0) === 1 ? "" : "s"} compiled for ${format(new Date(cycleStart), "MMM d")} – ${format(new Date(cycleEndDate), "MMM d, yyyy")}${data?.frozen_count ? ` · ${data.frozen_count} approved/paid line${data.frozen_count === 1 ? "" : "s"} left frozen` : ""}.`,
      });
      setCompileOpen(false);
      queryClient.invalidateQueries({ queryKey: ["all-invoice-submissions-v2"] });
    } catch (err: any) {
      toast({ title: "Compile failed", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setCompiling(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "submitted": return <Badge variant="outline" className="border-amber-500/50 text-amber-600"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "compiled": return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30"><FileText className="h-3 w-3 mr-1" />Compiled</Badge>;
      case "approved": return <Badge className="bg-green-500/20 text-green-600 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "paid": return <Badge className="bg-primary/20 text-primary border-primary/30"><DollarSign className="h-3 w-3 mr-1" />Paid</Badge>;
      case "rejected": return <Badge variant="destructive">Rejected</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <PageHeader title="Invoice Submissions" subtitle="Compile, review and approve setter payouts" />
          <div className="flex gap-2">
            <Button onClick={() => setCompileOpen(true)} className="gap-2">
              <PlayCircle className="h-4 w-4" />
              End Billing Cycle &amp; Compile
            </Button>
          </div>
        </div>

        {/* Grand-total ticker (per currency) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="glass-card p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending / Compiled</p>
            <p className="text-xl font-bold mt-1">{pendingCount}</p>
          </Card>
          <Card className="glass-card p-5 md:col-span-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Total payout (visible)</p>
            <div className="flex flex-wrap gap-4">
              {Object.keys(grandTotals).length === 0 ? (
                <p className="text-xl font-bold text-muted-foreground">—</p>
              ) : (
                Object.entries(grandTotals).map(([cur, amt]) => (
                  <p key={cur} className="text-xl font-bold">
                    {formatMoney(amt, cur)}
                    <span className="text-xs text-muted-foreground ml-1 font-normal">{cur}</span>
                  </p>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search by setter name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="compiled">Compiled</SelectItem>
                  <SelectItem value="submitted">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Submissions Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No invoice submissions found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-center">Sats</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Tier Bonus</TableHead>
                    <TableHead className="text-right">Grand Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions.map((sub: any) => {
                    const lineType = sub.line_type || "setter";
                    const currency = sub.currency || sub.setters_profiles?.currency || "USD";
                    const sats = sub.sat_meetings_count ?? sub.meetings_count ?? 0;
                    const commission = lineType === "setter"
                      ? sats * Number(sub.per_meeting_bonus || 0)
                      : Number(sub.total_commission || 0);
                    const grand = Number(sub.grand_total ?? 0);
                    return (
                      <TableRow key={sub.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailSubmission(sub)}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{sub.setters_profiles?.full_name || sub.display_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">{sub.setters_profiles?.email || sub.display_email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {lineType === "setter"
                              ? (sub.department || sub.setters_profiles?.department || "setter")
                              : lineType === "ae" ? "AE" : "Staff"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(sub.period_start), "MMM d")} – {format(new Date(sub.period_end), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-center font-medium">{lineType === "setter" ? sats : "—"}</TableCell>
                        <TableCell className="text-right">{formatMoney(Number(sub.base_salary || 0), currency)}</TableCell>
                        <TableCell className="text-right">{formatMoney(commission, currency)}</TableCell>
                        <TableCell className="text-right">
                          {sub.tiered_bonus_amount > 0 ? (
                            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">{formatMoney(Number(sub.tiered_bonus_amount), currency)}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatMoney(grand, currency)}</TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>{statusBadge(sub.status)}</TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {sub.status === "approved" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMarkPaidTarget(sub)}>
                                <BadgePoundSterling className="h-3.5 w-3.5 mr-1" />
                                Mark paid
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDetailSubmission(sub)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Compile Confirm Modal */}
        <Dialog open={compileOpen} onOpenChange={setCompileOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-primary" />
                End Billing Cycle &amp; Compile
              </DialogTitle>
              <DialogDescription>
                Compiles one pay line for every paid person: <strong>setters</strong> (base + per-meeting + tier bonus on sat meetings),
                <strong> AEs</strong> (base + commission on cash collected), and <strong>salaried staff</strong> (base salary from the Employee Hub).
                Re-running refreshes unreviewed lines only — <strong>approved and paid lines are never touched</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Period start</p>
                  <Input type="date" value={cycleStartDate} onChange={(e) => setCycleStartDate(e.target.value)} max={cycleEndDate} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Period end</p>
                  <Input type="date" value={cycleEndDate} onChange={(e) => setCycleEndDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} />
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>
                  Period defaults to the <strong>26th–25th</strong> payroll cycle. Only active, non-test people are included;
                  rebooked meetings are excluded. One line per person — setters stay on the setter calculation.
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCompileOpen(false)} disabled={compiling}>Cancel</Button>
              <Button onClick={handleCompile} disabled={compiling}>
                {compiling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                Compile Now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mark as Paid confirmation — a record-keeping stamp only */}
        <AlertDialog open={!!markPaidTarget} onOpenChange={(open) => !open && setMarkPaidTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark this invoice as paid?</AlertDialogTitle>
              <AlertDialogDescription>
                This records that {markPaidTarget?.setters_profiles?.full_name || markPaidTarget?.display_name || "this person"}'s{" "}
                {markPaidTarget ? formatMoney(Number(markPaidTarget.grand_total || 0), markPaidTarget.currency || "GBP") : ""} invoice
                was paid outside Vexon OS (e.g. by bank transfer). It is a record only — Vexon OS does not move any money.
                A paid invoice can no longer be edited.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={markingPaid}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); handleMarkPaid(); }} disabled={markingPaid}>
                {markingPaid ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BadgePoundSterling className="h-4 w-4 mr-2" />}
                Mark as Paid
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Detail Drawer */}
        <InvoiceDetailDrawer
          submission={detailSubmission}
          onClose={() => setDetailSubmission(null)}
          onApproved={(updated) => {
            queryClient.invalidateQueries({ queryKey: ["all-invoice-submissions-v2"] });
            setDetailSubmission(null);
            setPayoutSummary(updated);
          }}
          onUpdated={() => queryClient.invalidateQueries({ queryKey: ["all-invoice-submissions-v2"] })}
          onRequestMarkPaid={(sub) => {
            setDetailSubmission(null);
            setMarkPaidTarget(sub);
          }}
        />

        {/* Payout Summary (post-approve) */}
        <PayoutSummaryModal submission={payoutSummary} onClose={() => setPayoutSummary(null)} />
      </PageContainer>
    </DashboardLayout>
  );
}
