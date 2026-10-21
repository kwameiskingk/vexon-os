import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateBuilder } from "@/components/tasks/management/TemplateBuilder";
import { AssignmentMatrix } from "@/components/tasks/management/AssignmentMatrix";
import { ComplianceGrid } from "@/components/tasks/management/ComplianceGrid";

const TaskManagement = () => {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Task Management"
          subtitle="Define what every role is responsible for, who it's assigned to, and how the team is performing."
        />
        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
          </TabsList>
          <TabsContent value="templates"><TemplateBuilder /></TabsContent>
          <TabsContent value="assignments"><AssignmentMatrix /></TabsContent>
          <TabsContent value="compliance"><ComplianceGrid /></TabsContent>
        </Tabs>
      </PageContainer>
    </DashboardLayout>
  );
};

export default TaskManagement;
