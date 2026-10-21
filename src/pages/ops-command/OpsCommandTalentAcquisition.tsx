import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CandidateScreenings } from "@/components/ops-command/candidates/CandidateScreenings";
import { PipelineTrackingView } from "@/components/hiring/pipeline/PipelineTrackingView";

/**
 * Ops Command · Talent Acquisition (3 Sep).
 *
 * Elena's ask at the 2 Sep core-team call: everything the retired TA portal
 * had, as tabs, in place of the old "Candidates" entry. The TA portal was
 * exactly two pages — "Call List" (the AI-screened CV list with CSV import)
 * and "Candidate Tracking" (day-of nudges, pipeline board, still-to-call,
 * onboarding progress) — so those are the two tabs. Tracking moved here from
 * under Hiring → Pipeline so it is one click away again; Hiring keeps only
 * its Workspace. Bell notifications deep-link with ?tab=tracking.
 */
const TABS = ["call-list", "tracking"] as const;
type Tab = (typeof TABS)[number];

export default function OpsCommandTalentAcquisition() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "call-list";

  const setTab = (next: string) => {
    const copy = new URLSearchParams(params);
    if (next === "call-list") copy.delete("tab");
    else copy.set("tab", next);
    setParams(copy, { replace: true });
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Ops Command · Talent Acquisition"
          subtitle="Call list from every channel, then the pipeline from first call to day one."
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="call-list">Call List</TabsTrigger>
            <TabsTrigger value="tracking">Candidate Tracking</TabsTrigger>
          </TabsList>

          <TabsContent value="call-list" className="m-0">
            <CandidateScreenings />
          </TabsContent>

          <TabsContent value="tracking" className="m-0">
            <PipelineTrackingView />
          </TabsContent>
        </Tabs>
      </PageContainer>
    </DashboardLayout>
  );
}
