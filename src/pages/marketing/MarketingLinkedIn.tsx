import { useState } from "react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { EmbeddedLayoutProvider } from "@/contexts/EmbeddedLayoutContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Linkedin } from "lucide-react";
import GTMInbox from "@/pages/gtm/GTMInbox";
import GTMCampaigns from "@/pages/gtm/GTMCampaigns";
import GTMSenders from "@/pages/gtm/GTMSenders";
import GTMActivityFeed from "@/pages/gtm/GTMActivityFeed";

const MarketingLinkedIn = () => {
  const [tab, setTab] = useState("inbox");

  return (
    <MarketingLayout>
      <div>
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#0A66C2] to-[#1e88e5] flex items-center justify-center shadow-lg shadow-[#0A66C2]/30 ring-1 ring-white/15">
            <Linkedin className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-[26px] font-bold tracking-tight leading-tight bg-gradient-to-br from-foreground via-foreground to-[#6b7a90]/80 bg-clip-text text-transparent">LinkedIn · HeyReach</h1>
            <p className="text-[13px] text-muted-foreground">Manage all LinkedIn outreach — inbox, campaigns, senders and activity.</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-4 bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm">
          <TabsTrigger value="inbox" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#0A66C2]/25 data-[state=active]:to-[#1e88e5]/10">Inbox</TabsTrigger>
          <TabsTrigger value="campaigns" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#0A66C2]/25 data-[state=active]:to-[#1e88e5]/10">Campaigns</TabsTrigger>
          <TabsTrigger value="senders" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#0A66C2]/25 data-[state=active]:to-[#1e88e5]/10">Senders</TabsTrigger>
          <TabsTrigger value="activity" className="data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#0A66C2]/25 data-[state=active]:to-[#1e88e5]/10">Activity</TabsTrigger>
        </TabsList>

        <EmbeddedLayoutProvider>
          <TabsContent value="inbox" className="mt-4"><GTMInbox /></TabsContent>
          <TabsContent value="campaigns" className="mt-4"><GTMCampaigns /></TabsContent>
          <TabsContent value="senders" className="mt-4"><GTMSenders /></TabsContent>
          <TabsContent value="activity" className="mt-4"><GTMActivityFeed /></TabsContent>
        </EmbeddedLayoutProvider>
      </Tabs>
    </MarketingLayout>
  );
};

export default MarketingLinkedIn;
