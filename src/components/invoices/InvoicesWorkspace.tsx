// Invoice generator workspace (15 Oct 2026): the same screen the CEO page
// renders, mounted inside the Dev Centre too (Tools I maintain). The page
// owns the gates and the layout; this owns the data and the actions.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Panel, Pill, Row, RowList, RowName, StatStrip } from "@/components/ui-v2";
import { useJourneysOverview } from "@/hooks/useClientOnboardingAdmin";
import { useClientInvoices, type InvoiceRow } from "@/hooks/useClientInvoices";
import { InvoiceComposer } from "@/components/invoices/InvoiceComposer";
import { InvoicesTable } from "@/components/invoices/InvoicesTable";
import { MarkPaidDialog } from "@/components/invoices/MarkPaidDialog";
import { fmtGBP, INVOICE_STATUS_LABEL } from "@/lib/invoices/invoiceMaths";

export function InvoicesWorkspace({ canIssue, showHeader = true }: { canIssue: boolean; showHeader?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerClient, setComposerClient] = useState<string | null>(null);
  const [markPaid, setMarkPaid] = useState<InvoiceRow | null>(null);

  const invoices = useClientInvoices();
  const journeys = useJourneysOverview();

  // ?client=<id> (from the onboarding tab) opens the composer on that client.
  useEffect(() => {
    const c = params.get("client");
    if (c) {
      setComposerClient(c);
      setComposerOpen(true);
      const next = new URLSearchParams(params);
      next.delete("client");
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const awaiting = useMemo(() => (journeys.data?.journeys ?? []).filter((j) => j.status === "awaiting_payment" && !j.is_test), [journeys.data]);
  const awaitingIds = useMemo(() => new Set(awaiting.map((j) => j.client_profile_id)), [awaiting]);
  const latestByClient = useMemo(() => {
    const out: Record<string, InvoiceRow> = {};
    for (const r of invoices.data ?? []) if (r.client_id && r.status !== "cancelled" && !out[r.client_id]) out[r.client_id] = r;
    return out;
  }, [invoices.data]);

  const rows = useMemo(() => invoices.data ?? [], [invoices.data]);
  const totals = useMemo(() => {
    const open = rows.filter((r) => r.status === "sent" || r.status === "overdue");
    const paid = rows.filter((r) => r.status === "paid");
    const sum = (xs: InvoiceRow[]) => xs.reduce((s, r) => s + Number(r.total_amount ?? r.amount), 0);
    return { openCount: open.length, openSum: sum(open), paidCount: paid.length, paidSum: sum(paid) };
  }, [rows]);

  return (
    <>
        {showHeader && <PageHeader
          title="Invoice generator"
          subtitle="Raise the Meridian invoice when a client is closed, send it, and mark it paid when the money lands. Marking a signed client paid also opens their onboarding."
          actions={canIssue ? (
            <ButtonV2 variant="primary" onClick={() => { setComposerClient(null); setComposerOpen(true); }}>New invoice</ButtonV2>
          ) : undefined}
        />}

        <div className="space-y-5">
          <StatStrip
            stats={[
              { label: "Awaiting payment", value: fmtGBP(totals.openSum), caption: `${totals.openCount} invoice${totals.openCount === 1 ? "" : "s"} sent, not yet paid` },
              { label: "Paid", value: fmtGBP(totals.paidSum), caption: `${totals.paidCount} invoice${totals.paidCount === 1 ? "" : "s"} · also on the Finance tab` },
              { label: "Signed, no invoice yet", value: awaiting.filter((j) => !latestByClient[j.client_profile_id]).length, caption: "Agreements completed in PandaDoc, waiting to be billed" },
            ]}
          />

          {awaiting.length > 0 && (
            <Panel title="Signed, awaiting payment" meta="Marking paid here can also confirm payment on their onboarding, which sends the welcome email. Daniel sees the same queue on his Onboarding tab." aside={<Pill variant="warn">{awaiting.length}</Pill>}>
              <RowList columns="1fr auto">
                {awaiting.map((j) => {
                  const inv = latestByClient[j.client_profile_id];
                  return (
                    <Row key={j.client_profile_id} health="warn">
                      <RowName primary={j.company_name} secondary={`${j.contact_name || "—"} · ${j.email || "no email on profile"}`} />
                      <div className="flex items-center gap-[6px]">
                        {inv ? (
                          <>
                            <Pill variant={inv.status === "paid" ? "ok" : "info"}>{inv.invoice_number} · {INVOICE_STATUS_LABEL[inv.status]} · {fmtGBP(Number(inv.total_amount ?? inv.amount))}</Pill>
                            {inv.status !== "paid" && <ButtonV2 size="sm" onClick={() => setMarkPaid(inv)}>Mark paid</ButtonV2>}
                          </>
                        ) : canIssue ? (
                          <ButtonV2 size="sm" variant="primary" onClick={() => { setComposerClient(j.client_profile_id); setComposerOpen(true); }}>Raise invoice</ButtonV2>
                        ) : (
                          <Pill>No invoice yet</Pill>
                        )}
                      </div>
                    </Row>
                  );
                })}
              </RowList>
            </Panel>
          )}

          <Panel title="All invoices" aside={<Pill>{rows.length}</Pill>}>
            <InvoicesTable rows={rows} loading={invoices.isLoading} canIssue={canIssue} onMarkPaid={setMarkPaid} />
          </Panel>
        </div>

        <InvoiceComposer open={composerOpen} onOpenChange={setComposerOpen} initialClientId={composerClient} />
        <MarkPaidDialog
          invoice={markPaid}
          onboardingAwaiting={!!markPaid?.client_id && awaitingIds.has(markPaid.client_id)}
          onOpenChange={(o) => !o && setMarkPaid(null)}
        />
    </>
  );
}
