// New invoice form + live sheet preview (9 Oct 2026). Marcus fills in who,
// the amount and (optionally) the dates; VAT, total and the amount in words
// calculate themselves. "Create & send" allocates the number, stores the PDF
// and emails it in one go; "Save as draft" does everything but the email.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, Loader2, Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InvoicePaper } from "./InvoicePaper";
import {
  computeInvoiceTotals, DEFAULT_LINE_DESCRIPTION, DEFAULT_VAT_RATE, fmtGBP, invoiceNumberBase,
} from "@/lib/invoices/invoiceMaths";
import {
  openPdfBase64, previewInvoicePdf, useInvoiceAction, useInvoiceClientOptions, type InvoiceFormPayload,
} from "@/hooks/useClientInvoices";

const NEW_CLIENT = "__new__";
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a client (from ?client= or the onboarding tab). */
  initialClientId?: string | null;
  onCreated?: (result: { invoice_id: string; invoice_number: string; sent_at: string | null; send_error: string | null }) => void;
}

export function InvoiceComposer({ open, onOpenChange, initialClientId, onCreated }: Props) {
  const clients = useInvoiceClientOptions(open);
  const act = useInvoiceAction();
  const [clientId, setClientId] = useState<string>("");
  const [billToName, setBillToName] = useState("");
  const [billToAddress, setBillToAddress] = useState("");
  const [email, setEmail] = useState("");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(todayIso());
  const [dueTouched, setDueTouched] = useState(false);
  const [amount, setAmount] = useState("");
  const [vatRate, setVatRate] = useState(String(DEFAULT_VAT_RATE));
  const [description, setDescription] = useState(DEFAULT_LINE_DESCRIPTION);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);

  // Reset when opened; honour a pre-selected client once the list is in.
  useEffect(() => {
    if (!open) return;
    setClientId(initialClientId || "");
    setBillToName(""); setBillToAddress(""); setEmail("");
    setIssueDate(todayIso()); setDueDate(todayIso()); setDueTouched(false);
    setAmount(""); setVatRate(String(DEFAULT_VAT_RATE)); setDescription(DEFAULT_LINE_DESCRIPTION);
  }, [open, initialClientId]);

  // Picking a client pre-fills Bill to, address and email from the profile,
  // ONCE per pick: a background refetch of the client list must not wipe
  // what has been typed since.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => { if (open) prefilledFor.current = null; }, [open]);
  useEffect(() => {
    if (!clientId || clientId === NEW_CLIENT || prefilledFor.current === clientId) return;
    const c = clients.data?.find((x) => x.id === clientId);
    if (!c) return;
    prefilledFor.current = clientId;
    setBillToName(c.company_name || "");
    setBillToAddress(c.billing_address || "");
    setEmail(c.email || "");
  }, [clientId, clients.data]);

  // Due date follows the issue date until Marcus changes it himself.
  useEffect(() => { if (!dueTouched) setDueDate(issueDate); }, [issueDate, dueTouched]);

  const amountNum = Number(amount);
  const totals = useMemo(() => computeInvoiceTotals(amountNum, Number(vatRate)), [amountNum, vatRate]);
  const validAmount = Number.isFinite(amountNum) && amountNum > 0;
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSubmit = billToName.trim().length > 0 && validAmount && (clientId !== "" || billToName.trim().length > 0);

  const payload = (): InvoiceFormPayload => ({
    client_profile_id: clientId && clientId !== NEW_CLIENT ? clientId : null,
    create_client: clientId === NEW_CLIENT,
    bill_to_name: billToName.trim(),
    bill_to_address: billToAddress.trim(),
    recipient_email: email.trim(),
    issue_date: issueDate,
    due_date: dueDate,
    amount: amountNum,
    vat_rate: Number(vatRate),
    line_description: description.trim() || DEFAULT_LINE_DESCRIPTION,
  });

  const preview = async () => {
    if (!canSubmit) { toast.error("Fill in who it's for and the amount first"); return; }
    setPreviewing(true);
    // Open the tab inside the click (popup blockers), fill it when the PDF lands.
    const tab = window.open("about:blank", "_blank");
    try {
      const r = await previewInvoicePdf(payload());
      openPdfBase64(r.pdf_base64, tab);
    } catch (e) {
      tab?.close();
      toast.error(e instanceof Error ? e.message : "Could not draw the preview");
    } finally {
      setPreviewing(false);
    }
  };

  const submit = async (send: boolean) => {
    if (!canSubmit) { toast.error("Fill in who it's for and the amount first"); return; }
    if (send && !emailOk) { toast.error("Enter the client's email address to send it"); return; }
    setBusy(send ? "send" : "draft");
    try {
      const r = await act.mutateAsync({ action: "create", ...payload(), send });
      if (send && r.send_error) {
        toast.warning(`Invoice ${r.invoice_number} saved, but the email failed: ${r.send_error}`);
      } else if (send) {
        toast.success(`Invoice ${r.invoice_number} sent to ${email.trim()}`);
      } else {
        toast.success(`Invoice ${r.invoice_number} saved as a draft`);
      }
      onCreated?.(r);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the invoice");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[1180px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New invoice</SheetTitle>
          <SheetDescription>
            Marcus's template, filled in. Type the amount before VAT: VAT, the total and the amount in words work themselves out.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 grid gap-6 lg:grid-cols-[400px_1fr]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder={clients.isLoading ? "Loading clients…" : "Pick a client"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_CLIENT}>Someone not on the dashboard yet</SelectItem>
                  {(clients.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company_name}{c.status === "pending" ? " · in onboarding" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clientId === NEW_CLIENT && (
                <p className="text-xs text-muted-foreground">A client record is created in onboarding status with the name and email below, so their signed agreement lands on the same record.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-bill-to">Bill to (name on the invoice)</Label>
              <Input id="inv-bill-to" value={billToName} onChange={(e) => setBillToName(e.target.value)} placeholder="Atlas Talent Limited" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-address">Billing address</Label>
              <Textarea id="inv-address" rows={4} value={billToAddress} onChange={(e) => setBillToAddress(e.target.value)} placeholder={"Contact name\nStreet\nTown\nPostcode"} />
              <p className="text-xs text-muted-foreground">One line per address line. Remembered on the client for next time.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Send to</Label>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@company.com" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-issue">Date of issue</Label>
                <Input id="inv-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-due">Date due</Label>
                <Input id="inv-due" type="date" value={dueDate} min={issueDate} onChange={(e) => { setDueTouched(true); setDueDate(e.target.value); }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-amount">Amount (ex VAT)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input id="inv-amount" type="number" min="0" step="0.01" inputMode="decimal" className="pl-7" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="3000" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>VAT</Label>
                <Select value={vatRate} onValueChange={setVatRate}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20%</SelectItem>
                    <SelectItem value="0">No VAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-desc">Item description</Label>
              <Input id="inv-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Net</span><span>{fmtGBP(totals.net)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">VAT ({totals.rate}%)</span><span>{fmtGBP(totals.vat)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total due</span><span>{fmtGBP(totals.total)}</span></div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" onClick={preview} disabled={previewing || busy !== null}>
                {previewing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Eye className="h-4 w-4 mr-1.5" />} Preview PDF
              </Button>
              <Button type="button" variant="outline" onClick={() => submit(false)} disabled={busy !== null || !canSubmit}>
                {busy === "draft" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save as draft
              </Button>
              <Button type="button" onClick={() => submit(true)} disabled={busy !== null || !canSubmit || !emailOk}
                className="bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white border-0">
                {busy === "send" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />} Create & send
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Number: {invoiceNumberBase(issueDate)} (adds -2, -3… if another invoice is raised the same day). Sent from Marcus, replies go to marcus@meridiansales.example.
            </p>
          </div>

          <div className="overflow-auto rounded-xl bg-neutral-200/60 dark:bg-neutral-900/60 p-4">
            <div className="origin-top-left" style={{ transform: "scale(0.85)", width: 612 / 0.85 }}>
              <InvoicePaper
                invoiceNumber={invoiceNumberBase(issueDate)}
                issueDate={issueDate}
                dueDate={dueDate}
                billToName={billToName}
                billToAddress={billToAddress}
                lineDescription={description || DEFAULT_LINE_DESCRIPTION}
                amountExVat={validAmount ? amountNum : 0}
                vatRate={Number(vatRate)}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
