// Ops Command › Trialist leads (16 Oct 2026, the owner). Every meeting-ready lead
// a trialist logs on their trial day lands here for Elena: the real client,
// the prospect, the answers and the times they picked. She listens to the
// call in Close, then books it on the client's calendar (BookTrialLeadDialog)
// or marks it not a fit. Daniel sees the same leads on his Appointments page.

import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Chip, Panel } from "@/components/ui-v2";
import { TrialLeadCard } from "@/components/csm/TrialLeadCard";
import { BookTrialLeadDialog } from "@/components/csm/BookTrialLeadDialog";
import { useAllTrialLeads, type TrialLead } from "@/hooks/useTrialDay";

type Filter = "open" | "booked" | "all";

export default function OpsCommandTrialLeads() {
  const { data: leads = [], isLoading, refetch } = useAllTrialLeads();
  const [filter, setFilter] = useState<Filter>("open");
  const [bookLead, setBookLead] = useState<TrialLead | null>(null);

  const open = useMemo(() => leads.filter((l) => l.status === "submitted" || l.status === "pushed"), [leads]);
  const booked = useMemo(() => leads.filter((l) => l.status === "converted"), [leads]);
  const visible = filter === "open" ? open : filter === "booked" ? booked : leads;

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Ops Command · Trialist leads"
          subtitle="Every meeting-ready lead a trialist logs. Listen to the call in Close, then book it on the client's calendar or mark it not a fit."
        />
        <Panel
          title="Trialist leads"
          meta="Nothing is on a client's calendar until you book it here."
          aside={
            <div className="flex gap-[6px]">
              <Chip selected={filter === "open"} onClick={() => setFilter("open")}>To review · {open.length}</Chip>
              <Chip selected={filter === "booked"} onClick={() => setFilter("booked")}>Booked · {booked.length}</Chip>
              <Chip selected={filter === "all"} onClick={() => setFilter("all")}>All · {leads.length}</Chip>
            </div>
          }
        >
          {isLoading ? (
            <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">
              {filter === "open" ? "No trialist leads waiting on you." : "Nothing here yet."}
            </p>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {visible.map((l) => <TrialLeadCard key={l.id} lead={l} onBook={setBookLead} />)}
            </div>
          )}
        </Panel>
        <BookTrialLeadDialog
          lead={bookLead}
          open={!!bookLead}
          onOpenChange={(o) => { if (!o) { setBookLead(null); refetch(); } }}
        />
      </PageContainer>
    </DashboardLayout>
  );
}
