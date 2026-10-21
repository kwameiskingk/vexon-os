import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ObjectionReportAdmin } from "@/components/hr/ObjectionReportAdmin";

export default function ObjectionsReport() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader title="Objections Report" subtitle="Track the most common objections reported by setters" />
        <ObjectionReportAdmin />
      </PageContainer>
    </DashboardLayout>
  );
}
