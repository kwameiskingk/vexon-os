import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { UserAchievementsView } from "@/components/achievements/UserAchievementsView";

const AEAchievements = () => {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <UserAchievementsView 
          userRole="account_executive" 
          userDepartment={null}
        />
      </PageContainer>
    </DashboardLayout>
  );
};

export default AEAchievements;
