import { useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { AEDetailView } from "@/pages/admin/acquisition/AEDetail";

export default function OpsCommandAEDetail() {
  const { aeId } = useParams<{ aeId: string }>();

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <AEDetailView aeId={aeId} backPath="/ops-command/ae-oversight" />
      </PageContainer>
    </DashboardLayout>
  );
}
