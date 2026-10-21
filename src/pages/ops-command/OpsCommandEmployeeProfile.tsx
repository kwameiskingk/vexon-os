import { useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmployeeProfileView } from "@/pages/admin/hr/EmployeeProfile";

export default function OpsCommandEmployeeProfile() {
  const { employeeId } = useParams<{ employeeId: string }>();

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <EmployeeProfileView employeeId={employeeId} backPath="/ops-command/employees" />
      </PageContainer>
    </DashboardLayout>
  );
}
