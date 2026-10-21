import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PayslipStudio } from "@/components/payslips/PayslipStudio";

export default function OpsCommandPayslips() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Payslip generator"
          subtitle="Build a payslip, check the preview, then download it or email it to the employee from the accounts address."
        />
        <PayslipStudio />
      </PageContainer>
    </DashboardLayout>
  );
}
