import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  GraduationCap,
  Users as UsersIcon,
  Sparkles,
} from "lucide-react";
import { useSetterProfile } from "@/hooks/useSetterProfile";
import SetterProfileHeader from "@/components/sdr-manager/setter-profile/SetterProfileHeader";
import OverviewTab from "@/components/sdr-manager/setter-profile/tabs/OverviewTab";
import CoachingTab from "@/components/sdr-manager/setter-profile/tabs/CoachingTab";
import CallReviewTab from "@/components/sdr-manager/setter-profile/tabs/CallReviewTab";
import { SetterClientsTab } from "@/components/sdr-manager/SetterClientsTab";
import SetterQuickActions from "@/components/sdr-manager/setter-profile/SetterQuickActions";

export default function SetterProfilePage() {
  const { setterProfileId } = useParams<{ setterProfileId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  const { setter, isLoading, updateStatus, updateTitle, updateCoachingFocus, updateNotes } =
    useSetterProfile(setterProfileId || null);

  if (isLoading) {
    return (
      <DashboardLayout role="admin">
        <PageContainer>
          <div className="space-y-6">
            <Skeleton className="h-10 w-48" />
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-6">
                  <Skeleton className="h-24 w-24 rounded-full" />
                  <div className="space-y-3 flex-1">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  if (!setter || !setterProfileId) {
    return (
      <DashboardLayout role="admin">
        <PageContainer>
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Setter not found or no longer assigned to you.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/sdr-manager/setters")}>
              Back to Setter Management
            </Button>
          </div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <div className="space-y-6">
          <SetterProfileHeader
            setter={setter}
            setterProfileId={setterProfileId}
            updateTitle={updateTitle}
            updateStatus={updateStatus}
            updateCoachingFocus={updateCoachingFocus}
            updateNotes={updateNotes}
            onJumpToTargets={() => setActiveTab("overview")}
          />

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={setter.department === "acquisition" ? "grid grid-cols-3 w-full max-w-2xl" : "grid grid-cols-4 w-full max-w-3xl"}>
              <TabsTrigger value="overview" className="gap-2">
                <Building2 className="h-4 w-4 hidden sm:block" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="coaching" className="gap-2">
                <GraduationCap className="h-4 w-4 hidden sm:block" />
                Training
              </TabsTrigger>
              <TabsTrigger value="call-review" className="gap-2">
                <Sparkles className="h-4 w-4 hidden sm:block" />
                Call Review
              </TabsTrigger>
              {setter.department !== "acquisition" && (
                <TabsTrigger value="clients" className="gap-2">
                  <UsersIcon className="h-4 w-4 hidden sm:block" />
                  Clients
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              {setter.department === "acquisition" && (
                <div className="mb-6">
                  <SetterQuickActions
                    variant="card"
                    setter={setter}
                    setterProfileId={setterProfileId}
                    updateTitle={updateTitle}
                    updateCoachingFocus={updateCoachingFocus}
                    updateNotes={updateNotes}
                  />
                </div>
              )}
              <OverviewTab setter={setter} />
            </TabsContent>
            <TabsContent value="coaching" className="mt-6">
              <CoachingTab
                setterProfileId={setterProfileId}
                setterFullName={setter.full_name || setter.email}
              />
            </TabsContent>
            <TabsContent value="call-review" className="mt-6">
              <CallReviewTab
                setterProfileId={setterProfileId}
                setterFullName={setter.full_name || setter.email}
              />
            </TabsContent>
            {setter.department !== "acquisition" && (
              <TabsContent value="clients" className="mt-6">
                <SetterClientsTab
                  setterId={setterProfileId}
                  department={setter.department || "fulfilment"}
                />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
