import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TasksAndResponsibilitiesView } from "@/components/tasks/TasksAndResponsibilitiesView";

const ROLE_TO_LAYOUT: Record<string, "admin" | "setter" | "client"> = {
  setter: "setter",
  client: "client",
};

const TasksPage = () => {
  const { userRole } = useAuth();
  const layoutRole = ROLE_TO_LAYOUT[userRole || ""] || "admin";

  return (
    <DashboardLayout role={layoutRole}>
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold tracking-tight">Tasks &amp; Responsibilities</h1>
        <p className="text-sm text-muted-foreground">
          Your daily checklist and standing duties — auto-completes when you submit forms or log activity.
        </p>
      </header>
      <TasksAndResponsibilitiesView />
    </DashboardLayout>
  );
};

export default TasksPage;
