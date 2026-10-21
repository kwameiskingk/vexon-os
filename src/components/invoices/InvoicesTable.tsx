// The invoice register (9 Oct 2026): every invoice raised from the dashboard,
// newest first, with download / send / mark paid / cancel.

import { useState } from "react";
import { toast } from "sonner";
import { Ban, CheckCircle2, Download, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useInvoiceAction, type InvoiceRow } from "@/hooks/useClientInvoices";
import { fmtGBP, INVOICE_STATUS_LABEL, ukDate } from "@/lib/invoices/invoiceMaths";
import { cn } from "@/lib/utils";

const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

function StatusPill({ row }: { row: InvoiceRow }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = row.status === "sent" && !!row.due_date && row.due_date < today;
  const tone: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: overdue ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-700",
    paid: "bg-emerald-100 text-emerald-700",
    overdue: "bg-amber-100 text-amber-800",
    cancelled: "bg-rose-100 text-rose-700",
  };
  return (
    <Badge className={cn("border-0", tone[row.status] ?? tone.draft)}>
      {INVOICE_STATUS_LABEL[row.status] ?? row.status}{overdue ? " · past due" : ""}
    </Badge>
  );
}

interface Props {
  rows: InvoiceRow[];
  loading: boolean;
  canIssue: boolean;
  onMarkPaid: (row: InvoiceRow) => void;
}

export function InvoicesTable({ rows, loading, canIssue, onMarkPaid }: Props) {
  const act = useInvoiceAction();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<InvoiceRow | null>(null);

  const download = async (row: InvoiceRow) => {
    setBusyId(row.id);
    // Open the tab inside the click (popup blockers), point it at the file when ready.
    const tab = window.open("about:blank", "_blank");
    try {
      const r = await act.mutateAsync({ action: "download", invoice_id: row.id });
      if (tab) tab.location.href = r.url; else window.open(r.url, "_blank", "noopener");
    } catch (e) {
      tab?.close();
      toast.error(e instanceof Error ? e.message : "Could not fetch the PDF");
    } finally {
      setBusyId(null);
    }
  };
  const send = async (row: InvoiceRow) => {
    const to = row.recipient_email || row.client_profiles?.email || "";
    const typed = window.prompt(`Send invoice ${row.invoice_number} to:`, to);
    if (typed === null) return;
    setBusyId(row.id);
    try {
      const r = await act.mutateAsync({ action: "send", invoice_id: row.id, recipient_email: typed.trim() });
      toast.success(`Invoice ${row.invoice_number} sent to ${r.sent_to}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send it");
    } finally {
      setBusyId(null);
    }
  };
  const cancel = async () => {
    if (!cancelling) return;
    const row = cancelling;
    setCancelling(null);
    setBusyId(row.id);
    try {
      await act.mutateAsync({ action: "cancel", invoice_id: row.id });
      toast.success(`Invoice ${row.invoice_number} cancelled`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel it");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading invoices…</p>;
  if (rows.length === 0) return <p className="p-6 text-sm text-muted-foreground">No invoices yet. Raise the first one with “New invoice”.</p>;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Number</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Issued</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const busy = busyId === row.id;
            const open = row.status === "draft" || row.status === "sent" || row.status === "overdue";
            return (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.invoice_number}</TableCell>
                <TableCell>
                  <p className="text-sm font-medium">{row.bill_to_name || row.client_profiles?.company_name || "—"}</p>
                  {row.client_profiles?.company_name && row.client_profiles.company_name !== row.bill_to_name && (
                    <p className="text-xs text-muted-foreground">{row.client_profiles.company_name}</p>
                  )}
                </TableCell>
                <TableCell className="text-sm">{ukDate(row.issue_date)}</TableCell>
                <TableCell className="text-sm">{ukDate(row.due_date)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {fmtGBP(Number(row.total_amount ?? row.amount))}
                  <span className="block text-[11px] text-muted-foreground">{fmtGBP(Number(row.amount))} + VAT</span>
                </TableCell>
                <TableCell><StatusPill row={row} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.sent_at ? <>{fmtWhen(row.sent_at)}<span className="block">{row.sent_to}{row.send_count > 1 ? ` ×${row.send_count}` : ""}</span></> : "—"}
                  {row.paid_at && <span className="block text-emerald-700">Paid {fmtWhen(row.paid_at)}</span>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" title="Download PDF" disabled={busy} onClick={() => download(row)}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </Button>
                    {canIssue && row.status !== "cancelled" && (
                      <Button size="sm" variant="ghost" title={row.sent_at ? "Send again" : "Send"} disabled={busy} onClick={() => send(row)}>
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                    {open && (
                      <Button size="sm" variant="ghost" title="Mark paid" disabled={busy} onClick={() => onMarkPaid(row)} className="text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    {canIssue && open && (
                      <Button size="sm" variant="ghost" title="Cancel invoice" disabled={busy} onClick={() => setCancelling(row)} className="text-rose-600">
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invoice {cancelling?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stays in the list as cancelled and its number is not reused. The client is not emailed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={cancel} className="bg-rose-600 hover:bg-rose-700">Cancel invoice</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
