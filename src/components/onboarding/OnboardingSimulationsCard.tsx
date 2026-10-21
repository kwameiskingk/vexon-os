// "Run a simulation of the latest onboarding" (Marcus, 8 Sep): two buttons,
// one per deck, opening the sandboxes in a new tab. Both sandboxes render the
// real deck over the flow as it is saved right now and write nothing, so
// this is safe to hand to a mentor mid-call. Sits on CEO Command, Ops
// Command and CSM Command; the routes decide who may open each sandbox.

import { ExternalLink, MonitorPlay, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function OnboardingSimulationsCard({ compact }: { compact?: boolean }) {
  const buttons = (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <a href="/client/onboarding/sandbox" target="_blank" rel="noreferrer">
          <MonitorPlay className="h-4 w-4" /> Client onboarding <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      </Button>
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <a href="/onboarding/sandbox" target="_blank" rel="noreferrer">
          <UserRound className="h-4 w-4" /> New starter onboarding <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      </Button>
    </div>
  );

  if (compact) {
    return (
      <div className={cn("rounded-xl border bg-card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3")}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Run an onboarding simulation</p>
          <p className="text-xs text-muted-foreground">The latest flow, exactly as a client or a new starter sees it. Nothing is saved.</p>
        </div>
        {buttons}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Run an onboarding simulation</CardTitle>
        <CardDescription>The latest flow, exactly as a client or a new starter sees it, in a new tab. Every card can be completed and nothing is saved.</CardDescription>
      </CardHeader>
      <CardContent>{buttons}</CardContent>
    </Card>
  );
}
