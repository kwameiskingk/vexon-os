// CSM Onboarding — the owner's 26-Aug ruling gives this tab two jobs: TRACK every
// client's onboarding journey (incl. the loud "signed — confirm payment"
// queue) and BUILD the flow itself, same powers as the Dev Center. The legacy
// kanban board and the sandbox button retired on 14 Oct 2026 (the owner).

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { JourneysPanel } from "@/components/client-onboarding/JourneysPanel";
import { FlowBuilder } from "@/components/client-onboarding/FlowBuilder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CSMOnboarding = () => {
  const [tab, setTab] = useState("journeys");
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Client Onboarding"
          subtitle="Track journeys and configure the flow"
          gradient
        />
        <Tabs value={tab} onValueChange={setTab} className="mt-2">
          <TabsList>
            <TabsTrigger value="journeys">Journeys</TabsTrigger>
            <TabsTrigger value="flow">Flow builder</TabsTrigger>
          </TabsList>
          <TabsContent value="journeys" className="mt-4">
            <JourneysPanel />
          </TabsContent>
          <TabsContent value="flow" className="mt-4">
            <FlowBuilder />
          </TabsContent>
        </Tabs>
      </PageContainer>
    </DashboardLayout>
  );
};

export default CSMOnboarding;
