import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { SdrManagerReviewView } from "@/components/operations/manager-review/SdrManagerReviewView";

/**
 * SDR Manager monthly performance reviews (admin/dev/ops only — managers do
 * not see their own reviews; same ruling family as AE reviews, 2026-07-28).
 */
export default function ManagerReviews() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="SDR Manager Performance Reviews"
          subtitle="Monthly reviews covering personal delivery and team performance."
        />
        <SdrManagerReviewView />
      </PageContainer>
    </DashboardLayout>
  );
}
