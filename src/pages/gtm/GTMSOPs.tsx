import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardCheck } from "lucide-react";

const GTMSOPs = () => {
  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <PageHeader title="SOPs" subtitle="Standard Operating Procedures management" />

        <Card className="bg-card border-border">
          <CardContent className="py-16">
            <div className="text-center text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <h3 className="text-lg font-semibold text-foreground mb-2">SOP Management Hub</h3>
              <p className="text-sm max-w-md mx-auto">
                Create, edit, organise, and share standard operating procedures for the team.
                This feature is being built out — stay tuned.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default GTMSOPs;
