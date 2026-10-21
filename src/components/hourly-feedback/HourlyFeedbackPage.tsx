import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { HourlyUpdatesComplianceView } from "@/components/hourly-feedback/HourlyUpdatesComplianceView";

interface HourlyFeedbackPageProps {
  scope: "sdr_manager" | "operations";
  embedded?: boolean;
}

export function HourlyFeedbackPage({ scope, embedded = false }: HourlyFeedbackPageProps) {
  const content = <HourlyUpdatesComplianceView scope={scope} />;

  if (embedded) return content;

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Hourly Feedback"
          subtitle="Compliance overview of hourly updates by setter — see who submitted each hour slot and their dial/talk-time pace"
          gradient
        />
        {content}
      </PageContainer>
    </DashboardLayout>
  );
}
