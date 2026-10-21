// HR · Hiring Management (14 Oct 2026, the owner). The candidate pipeline that
// used to lead CEO › HR & Hiring now lives here: Trial Day through to Hired,
// with Hired and Closed drawers underneath. Same component Elena's Talent
// Acquisition tab renders, so the three views never drift. The old board
// (operations/Hiring.tsx, its own stages) is gone.

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { HiringPipelineView } from "@/components/hiring/pipeline/HiringPipelineView";
import { QualificationSettingsDialog } from "@/components/hiring/pipeline/QualificationSettingsDialog";

export default function HRHiring() {
  const { userRole } = useAuth();
  // ceoView unlocks the final-interview answers and the Send to TA hand-off;
  // Marcus (admin) and the dev get it, Elena works her own TA surface.
  const ceoView = userRole === "admin" || userRole === "dev";
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Hiring Management"
          subtitle="Trial calls through to hired. Open a candidate to see their screening and move them on."
          actions={<QualificationSettingsDialog />}
        />
        <HiringPipelineView canAct ceoView={ceoView} />
      </PageContainer>
    </DashboardLayout>
  );
}
