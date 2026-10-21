import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InboxTab, CampaignsTab, EmailAccountsTab } from "@/pages/marketing/MarketingEmail";

const GTMEmail = () => {
  const [tab, setTab] = useState("inbox");

  return (
    <DashboardLayout role="admin">
      <div className="space-y-5">
        <PageHeader title="Email · Smartlead" subtitle="Cold email replies, campaigns and sending accounts" />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="accounts">Email Accounts</TabsTrigger>
          </TabsList>
          <TabsContent value="inbox" className="mt-4"><InboxTab /></TabsContent>
          <TabsContent value="campaigns" className="mt-4"><CampaignsTab /></TabsContent>
          <TabsContent value="accounts" className="mt-4"><EmailAccountsTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default GTMEmail;
