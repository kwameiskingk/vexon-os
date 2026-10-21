// HR · Payslips (14 Oct 2026, the owner): the page is the payslip generator
// Elena uses in Ops Command, not the old PDF upload list. One component,
// two doors.

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PayslipStudio } from "@/components/payslips/PayslipStudio";

export default function HRPayslips() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Payslips"
          subtitle="Build a payslip, check the preview, then download it or email it to the employee from the accounts address."
        />
        <PayslipStudio />
      </PageContainer>
    </DashboardLayout>
  );
}
