import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ObjectionReportAdmin } from "@/components/hr/ObjectionReportAdmin";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";

export default function SDRManagerObjectionsReport() {
  // Person-level surface: reports union over every held department.
  const { departments: managerDepartments } = useSdrManagerScope();
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader title="Objections Report" subtitle="Track the most common objections reported by your team" />
        <ObjectionReportAdmin scopeDepartment={managerDepartments} />
      </PageContainer>
    </DashboardLayout>
  );
}
