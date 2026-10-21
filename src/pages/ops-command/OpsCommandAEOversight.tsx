import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { AEManagementView } from "@/pages/admin/acquisition/AEManagement";

export default function OpsCommandAEOversight() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="AE Oversight"
          subtitle="Discovery, pitch and deal activity across the account executives."
        />
        <AEManagementView basePath="/ops-command/ae-oversight" />
      </PageContainer>
    </DashboardLayout>
  );
}
