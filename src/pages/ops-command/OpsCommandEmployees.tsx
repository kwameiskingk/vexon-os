import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeHubView } from "@/pages/admin/hr/EmployeeHub";

export default function OpsCommandEmployees() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Employee Hub"
          subtitle="Team directory — Close IDs, salaries, and employment details."
        />
        <EmployeeHubView basePath="/ops-command/employees" />
      </PageContainer>
    </DashboardLayout>
  );
}
