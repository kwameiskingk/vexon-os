import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeLeaveTracker } from "@/components/hr/EmployeeLeaveTracker";

export default function OpsCommandLeave() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Ops Command · Employee Leave"
          subtitle="Approved leave, holidays, and time-off requests."
        />
        <EmployeeLeaveTracker />
      </PageContainer>
    </DashboardLayout>
  );
}
