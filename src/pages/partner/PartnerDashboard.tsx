import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Panel, Row, RowList, RowName, StatStrip } from "@/components/ui-v2";
import { Skeleton } from "@/components/ui/skeleton";
import { usePartnerProfile } from "@/hooks/usePartnerProfile";
import { useGreeting } from "@/hooks/useGreeting";
import { formatPayout } from "@/lib/referrals";
import { usePartnerReferences } from "./PartnerReferences";
import { Handshake, Send, TrendingUp, Trophy } from "lucide-react";

const PartnerDashboard = () => {
  const navigate = useNavigate();
  const { greeting } = useGreeting();
  const { partner, isLoading: partnerLoading } = usePartnerProfile();

  // 18 Sep: partners are references, not referrers — the numbers come from
  // partner_references (pushed by Marcus's discovery outcomes).
  const { data: refs = [], isLoading: refsLoading } = usePartnerReferences(partner?.id);

  const loading = partnerLoading || refsLoading;
  const rows = refs;
  const countBy = (status: string) => rows.filter((r) => r.status === status).length;
  const totalPaidOut = rows.filter((r) => r.status === "closed_won" && r.fee_status === "paid").reduce((s, r) => s + Number(r.fee_amount || 0), 0);
  const pendingPayout = rows.filter((r) => r.status === "closed_won" && r.fee_status !== "paid").reduce((s, r) => s + Number(r.fee_amount || 0), 0);
  const bankMissing = !!partner && !partner.bank_account_number;

  const firstName = partner?.full_name?.split(" ")[0] || null;

  const statCards = [
    { title: "References", value: rows.length, icon: Handshake, note: "Prospects sent your way" },
    { title: "Waiting for their call", value: countBy("requested"), icon: Send, note: "They'll reach out to you" },
    { title: "Spoken to", value: countBy("spoken"), icon: TrendingUp, note: "Call done, decision pending" },
    { title: "Signed", value: countBy("closed_won"), icon: Trophy, note: "Became a Meridian client" },
  ];

  return (
    <DashboardLayout role="partner">
      <PageContainer>
        <PageHeader eyebrow="Partnerships portal" title={`${greeting}, ${firstName || "there"}`} subtitle="Your references at a glance" />

        {bankMissing && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[var(--warn-bg)] px-4 py-3 [box-shadow:inset_3px_0_0_var(--warn)]">
            <div><p className="text-[13px] font-semibold">One thing to do: add your bank details</p><p className="text-[12px] text-[var(--dim)]">We pay finder's fees straight to your account. Name, sort code and account number.</p></div>
            <ButtonV2 size="sm" variant="primary" onClick={() => navigate("/partnerships/details")}>Add details</ButtonV2>
          </div>
        )}

        <div className="space-y-6">
          {loading ? (
            <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
          ) : (
            <>
              <StatStrip stats={statCards.map(({ title, value, note }) => ({ label: title, value, caption: note }))} />
              <StatStrip stats={[
                { label: "Total paid out", value: formatPayout(totalPaidOut), caption: "Finder's fees received" },
                { label: "Pending payout", value: formatPayout(pendingPayout), caption: "Signed, awaiting payment" },
              ]} />
            </>
          )}

          <Panel title="Go to">
            <RowList columns="1fr auto">
              <Row onClick={() => navigate("/partnerships/references")}>
                <RowName primary="Your references" secondary="Who's been pointed to you, and where it stands" />
                <span className="text-[11.5px] text-[var(--dim)]">Open →</span>
              </Row>
              <Row onClick={() => navigate("/partnerships/documents")}>
                <RowName primary="Documents" secondary="Contracts and proof of payments" />
                <span className="text-[11.5px] text-[var(--dim)]">Open →</span>
              </Row>
            </RowList>
          </Panel>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

export default PartnerDashboard;
