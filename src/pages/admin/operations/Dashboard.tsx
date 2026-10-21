// Operations · Overview (rebuilt 14 Oct 2026, the owner). The KPI tiles, the
// call-activity leaderboard and the team goal card are gone: those numbers
// live on the Sheets. The page is now the fulfilment appointments for today
// and the rest of the week, with confirmation calls answered in place.

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { AppointmentsOverview } from "@/components/dashboard/AppointmentsOverview";
import { useGreeting } from "@/hooks/useGreeting";
import { format } from "date-fns";

const OperationsDashboard = () => {
  const { fullGreeting } = useGreeting();
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title={fullGreeting}
          subtitle={`Fulfilment appointments for ${format(new Date(), "EEEE d MMMM yyyy")} and the week ahead`}
        />
        <AppointmentsOverview department="fulfilment" appointmentsPath="/admin/meetings" />
      </PageContainer>
    </DashboardLayout>
  );
};

export default OperationsDashboard;
