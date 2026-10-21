import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Share2 } from "lucide-react";

const GTMSocialMedia = () => {
  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <PageHeader title="Social Media" subtitle="Content scheduling and engagement tracking" />

        <Card className="bg-card border-border">
          <CardContent className="py-16">
            <div className="text-center text-muted-foreground">
              <Share2 className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Coming Soon</h3>
              <p className="text-sm max-w-md mx-auto">
                Social media management tools will be available here — content scheduling, 
                engagement tracking, and analytics across platforms.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default GTMSocialMedia;
