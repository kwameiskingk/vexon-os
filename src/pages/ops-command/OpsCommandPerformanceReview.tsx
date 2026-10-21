import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PerformanceReviewView } from "@/components/ops-command/performance-review/PerformanceReviewView";

export default function OpsCommandPerformanceReview() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Monthly Performance Reviews"
          subtitle="Monthly performance reviews for setters."
        />
        <PerformanceReviewView />
      </PageContainer>
    </DashboardLayout>
  );
}
