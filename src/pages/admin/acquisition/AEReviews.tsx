import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { AEReviewView } from "@/components/acquisition/ae-review/AEReviewView";

/**
 * AE monthly performance reviews (admin/dev/ops only — ruling 2026-07-28:
 * no AE self-view, no manager view for now).
 */
export default function AEReviews() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="AE Performance Reviews"
          subtitle="Monthly performance reviews for Account Executives."
        />
        <AEReviewView />
      </PageContainer>
    </DashboardLayout>
  );
}
