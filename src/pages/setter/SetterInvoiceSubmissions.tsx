import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CheckCircle, Clock, DollarSign, Eye, FileText, Info, Wallet, Calendar, Banknote } from "lucide-react";
import { formatMoney, getInvoiceCycleStart, computePayroll } from "@/lib/payroll";

function statusPill(status: string | null | undefined) {
  switch (status) {
    case "compiled":
      return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30"><FileText className="h-3 w-3 mr-1" />Compiled — awaiting approval</Badge>;
    case "submitted":
      return <Badge variant="outline" className="border-amber-500/50 text-amber-600"><Clock className="h-3 w-3 mr-1" />Pending review</Badge>;
    case "approved":
      return <Badge className="bg-green-500/20 text-green-600 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
    case "paid":
      return <Badge className="bg-primary/20 text-primary border-primary/30"><DollarSign className="h-3 w-3 mr-1" />Paid</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground"><Clock className="h-3 w-3 mr-1" />Not yet compiled</Badge>;
  }
}

function maskAccount(value?: string | null) {
  if (!value) return "—";
  const v = String(value).replace(/\s+/g, "");
  if (v.length <= 4) return `•••• ${v}`;
  return `•••• ${v.slice(-4)}`;
}

export interface SetterInvoiceSubmissionsViewProps {
  /** The setter's profile row (bonus, base salary, banking summary). */
  me: any | null | undefined;
  invoices: any[];
  isLoading: boolean;
  /** Sat, non-rebook meetings in the current cycle (the live projection input). */
  liveScores: any[];
  cycleStart: Date;
}

/**
 * Pure rendering (3 Sep): shared by the live page and the setter demo
 * surface (acting-as SDR on fixtures).
 */
export function SetterInvoiceSubmissionsView({ me, invoices, isLoading, liveScores, cycleStart }: SetterInvoiceSubmissionsViewProps) {
  const [detail, setDetail] = useState<any | null>(null);

  const currency = me?.currency || "USD";

  // Identify "current cycle" invoice (period_start === month start)
  const currentCycle = useMemo(() => {
    const isoStart = format(cycleStart, "yyyy-MM-dd");
    return invoices.find((i: any) => i.period_start === isoStart) || null;
  }, [invoices, cycleStart]);

  const history = useMemo(() => invoices.filter((i: any) => i.id !== currentCycle?.id), [invoices, currentCycle]);

  // For the current-cycle hero, compute a projected grand total from snapshot fields when present
  const projection = useMemo(() => {
    if (!currentCycle) return null;
    return computePayroll({
      sat_meetings_count: currentCycle.sat_meetings_count ?? currentCycle.meetings_count ?? 0,
      per_meeting_bonus: Number(currentCycle.per_meeting_bonus ?? me?.per_meeting_bonus ?? 0),
      base_salary: Number(currentCycle.base_salary ?? me?.base_salary ?? 0),
      custom_bonuses: Array.isArray(currentCycle.custom_bonuses) ? currentCycle.custom_bonuses : [],
      deductions: Array.isArray(currentCycle.deductions) ? currentCycle.deductions : [],
    });
  }, [currentCycle, me]);

  return (
    <DashboardLayout role="setter">
      <PageContainer>
        <PageHeader title="My Invoices" subtitle="Live view of what Accounting has compiled and approved for you" />

        {/* Info banner */}
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="py-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Invoices are now compiled automatically by Accounting at the end of each billing cycle.</p>
              <p className="text-muted-foreground mt-1">
                All sat meetings appear here. Bonuses, deductions and final approval are handled by Accounting — there&apos;s nothing for you to submit.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Current cycle hero */}
        <Card className="mb-6 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />Current Billing Cycle</span>
              {currentCycle && statusPill(currentCycle.status)}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Paid in <strong>{currency}</strong>
            </p>
          </CardHeader>
          <CardContent>
            {(() => {
              // If compiled invoice exists, show authoritative numbers. Otherwise project from live call_scores.
              const liveSats = liveScores.length;
              const liveProj = !currentCycle
                ? computePayroll({
                    sat_meetings_count: liveSats,
                    per_meeting_bonus: Number(me?.per_meeting_bonus ?? 0),
                    base_salary: Number(me?.base_salary ?? 0),
                    custom_bonuses: [],
                    deductions: [],
                  })
                : null;
              const sats = currentCycle
                ? (currentCycle.sat_meetings_count ?? currentCycle.meetings_count ?? 0)
                : liveSats;
              const base = Number(currentCycle?.base_salary ?? me?.base_salary ?? 0);
              const bonuses = currentCycle
                ? ((projection?.commission || 0) + (projection?.tiered_bonus_amount || 0) + (projection?.custom_bonuses_total || 0))
                : ((liveProj?.commission || 0) + (liveProj?.tiered_bonus_amount || 0));
              const grand = currentCycle
                ? (projection?.grand_total || Number(currentCycle.grand_total || 0))
                : (liveProj?.grand_total || 0);
              return (
                <>
                  {!currentCycle && liveSats === 0 && (
                    <div className="mb-4 rounded-lg border border-dashed border-border bg-muted/30 p-4 flex items-start gap-3">
                      <Wallet className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium">No sat meetings yet for this cycle</p>
                        <p className="text-muted-foreground text-xs mt-1">
                          As soon as a sat meeting is confirmed, it will appear here. Accounting will close and compile the cycle at the end of the billing period.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiTile label="Sat Meetings" value={String(sats)} />
                    <KpiTile label="Base Salary" value={formatMoney(base, currency)} />
                    <KpiTile label="Commission + Bonuses" value={formatMoney(bonuses, currency)} />
                    <KpiTile label="Grand Total" value={formatMoney(grand, currency)} highlight />
                    {currentCycle && (
                      <div className="col-span-2 md:col-span-4 flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setDetail(currentCycle)}>
                          <Eye className="h-4 w-4 mr-2" />View full breakdown
                        </Button>
                      </div>
                    )}
                  </div>
                  {!currentCycle && liveSats > 0 && (
                    <div className="mt-4 text-xs text-muted-foreground">
                      Projected from {liveSats} scored sat meeting{liveSats === 1 ? "" : "s"} so far this cycle. Final totals are locked in when Accounting compiles.
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>

        {/* Banking summary */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" />
              Payout Details on File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Field label="Currency" value={currency} />
              <Field label="Bank" value={me?.bank_name || "—"} />
              <Field label="Account" value={maskAccount(me?.account_number || me?.iban)} />
              <Field label="Country" value={me?.bank_country || "—"} />
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Need to update your banking details? Reach out to HR — they manage this on your profile.
            </p>
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
            ) : history.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">No previous invoices yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-center">Sats</TableHead>
                    <TableHead className="text-right">Grand Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((inv: any) => (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(inv)}>
                      <TableCell className="text-sm">
                        {format(new Date(inv.period_start), "MMM d")} – {format(new Date(inv.period_end), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-center">{inv.sat_meetings_count ?? inv.meetings_count ?? 0}</TableCell>
                      <TableCell className="text-right font-semibold">{formatMoney(Number(inv.grand_total || 0), inv.currency || currency)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>{statusPill(inv.status)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDetail(inv)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Read-only detail drawer */}
        <ReadOnlyInvoiceDrawer invoice={detail} currency={currency} onClose={() => setDetail(null)} />
      </PageContainer>
    </DashboardLayout>
  );
}

export default function SetterInvoiceSubmissions() {
  const cycleStart = useMemo(() => getInvoiceCycleStart(), []);
  const queryClient = useQueryClient();

  // Current setter + profile
  const { data: me } = useQuery({
    queryKey: ["setter-me-invoice"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await (supabase as any)
        .from("setters_profiles")
        .select("id, full_name, email, department, per_meeting_bonus, base_salary, currency, home_address, bank_name, account_holder_name, account_number, sort_code, iban, swift_bic, bank_country, bank_address")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // All invoices for this setter
  const { data: invoices = [], isLoading, refetch: refetchInvoices } = useQuery({
    queryKey: ["setter-invoices", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoice_submissions")
        .select("*")
        .eq("setter_profile_id", me!.id)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Live SAT meetings for current cycle — pulled from the meetings table
  // (the SSOT updated whenever a setter, CSM, or admin marks attendance as "sat").
  // We count meetings where attendance_status = 'sat' and exclude rebooks.
  const cycleStartIso = useMemo(() => format(cycleStart, "yyyy-MM-dd"), [cycleStart]);
  const todayIso = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const { data: liveScores = [] } = useQuery({
    queryKey: ["setter-live-sats", me?.id, cycleStartIso, todayIso],
    enabled: !!me?.id,
    refetchInterval: 4 * 60 * 60 * 1000,
    refetchIntervalInBackground: true,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("meetings")
        .select("id, meeting_date, company_name, prospect_name, attendance_status, is_rebook")
        .eq("setter_profile_id", me!.id)
        .eq("attendance_status", "sat")
        .gte("meeting_date", cycleStartIso)
        .lte("meeting_date", todayIso)
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return (data || []).filter((m: any) => !m.is_rebook);
    },
  });

  // Refresh invoice list on the same 4h cadence so a compile flips the UI without reload
  useEffect(() => {
    if (!me?.id) return;
    const t = setInterval(() => refetchInvoices(), 4 * 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [me?.id, refetchInvoices]);

  // Realtime: refetch SAT meetings instantly when an admin/CSM/setter updates a meeting
  useEffect(() => {
    if (!me?.id) return;
    const channel = supabase
      .channel(`setter-invoice-meetings-${me.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meetings", filter: `setter_profile_id=eq.${me.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["setter-live-sats", me.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [me?.id, queryClient]);

  return (
    <SetterInvoiceSubmissionsView
      me={me}
      invoices={invoices}
      isLoading={isLoading}
      liveScores={liveScores}
      cycleStart={cycleStart}
    />
  );
}

function KpiTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-primary/30 bg-primary/5" : "bg-muted/30"}`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-medium mt-0.5">{value}</p>
    </div>
  );
}

function ReadOnlyInvoiceDrawer({ invoice, currency, onClose }: { invoice: any | null; currency: string; onClose: () => void }) {
  if (!invoice) return null;
  const cur = invoice.currency || currency;
  const sats = invoice.sat_meetings_count ?? invoice.meetings_count ?? 0;
  const bonuses = Array.isArray(invoice.custom_bonuses) ? invoice.custom_bonuses : [];
  const deductions = Array.isArray(invoice.deductions) ? invoice.deductions : [];

  return (
    <Sheet open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center justify-between">
            <span>Invoice Breakdown</span>
            {statusPill(invoice.status)}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {format(new Date(invoice.period_start), "MMM d")} – {format(new Date(invoice.period_end), "MMM d, yyyy")} · {cur}
          </p>
        </SheetHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <KpiTile label="Sat Meetings" value={String(sats)} />
            <KpiTile label="Per Meeting" value={formatMoney(Number(invoice.per_meeting_bonus || 0), cur)} />
            <KpiTile label="Base Salary" value={formatMoney(Number(invoice.base_salary || 0), cur)} />
            <KpiTile label="Tier Bonus" value={formatMoney(Number(invoice.tiered_bonus_amount || 0), cur)} />
          </div>

          <Section title="Custom Bonuses">
            {bonuses.length === 0 ? (
              <Empty text="None added by Accounting." />
            ) : (
              <ul className="divide-y">
                {bonuses.map((b: any, i: number) => (
                  <li key={i} className="py-2 flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">{b.label || "Bonus"}</p>
                      {b.note && <p className="text-xs text-muted-foreground">{b.note}</p>}
                    </div>
                    <p className="font-semibold text-green-600">+{formatMoney(Number(b.amount || 0), cur)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Deductions">
            {deductions.length === 0 ? (
              <Empty text="No deductions." />
            ) : (
              <ul className="divide-y">
                {deductions.map((d: any, i: number) => (
                  <li key={i} className="py-2 flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">{d.label || "Deduction"}</p>
                      {d.reason && <p className="text-xs text-muted-foreground">{d.reason}</p>}
                    </div>
                    <p className="font-semibold text-destructive">−{formatMoney(Number(d.amount || 0), cur)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {invoice.notes && (
            <Section title="Notes from Accounting">
              <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </Section>
          )}

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Grand Total</p>
              <p className="text-3xl font-bold text-primary mt-1">{formatMoney(Number(invoice.grand_total || 0), cur)}</p>
            </div>
            <Badge variant="outline">{cur}</Badge>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold mb-2">{title}</p>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground italic">{text}</p>;
}
