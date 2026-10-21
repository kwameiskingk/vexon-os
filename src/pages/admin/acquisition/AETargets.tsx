import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { AETargetsView } from "@/components/acquisition/ae-targets/AETargetsView";

/**
 * AE target editor (admin/dev/ops — Phase 2, 2026-07-31). Cash targets are
 * deliberately absent: the CEO Goals editor is their single entry point.
 */
export default function AETargets() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="AE Targets"
          subtitle="Operational targets for Account Executives — what their monthly reviews grade against."
        />
        <AETargetsView />
      </PageContainer>
    </DashboardLayout>
  );
}
