import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { RoiCalculatorSection } from "@/components/acquisition/RoiCalculatorSection";
import { ColdCallingFunnel } from "@/components/acquisition/ColdCallingFunnel";

// 14 Oct 2026 (the owner): Pre-Disco Insights retired (never used); the two tools stay.
export default function SalesTools() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Sales Tools"
          subtitle="ROI calculator and cold-calling funnel benchmarks"
        />
        <div className="space-y-4">
          <RoiCalculatorSection />
          <ColdCallingFunnel />
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
