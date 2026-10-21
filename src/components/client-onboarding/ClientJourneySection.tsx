// Per-client onboarding panel on the Client Profile (Operations → Onboarding).
// Start a journey for clients that didn't arrive via a signed contract, work
// the paid gate, and open the full journey detail.

import { useState } from "react";
import { CheckCircle2, Loader2, PlayCircle, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JourneyDetailSheet } from "@/components/client-onboarding/JourneysPanel";
import {
  useJourneyAdminAction,
  useJourneysOverview,
} from "@/hooks/useClientOnboardingAdmin";

export function ClientJourneySection({ clientId }: { clientId: string }) {
  const { data, isLoading } = useJourneysOverview();
  const act = useJourneyAdminAction();
  const [detailOpen, setDetailOpen] = useState(false);

  const row = (data?.journeys ?? []).find((j) => j.client_profile_id === clientId);

  const run = async (action: string, okMsg: string) => {
    try {
      await act.mutateAsync({ action, client_profile_id: clientId });
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Rocket className="h-4 w-4 text-violet-500" /> Onboarding journey
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
        ) : !row ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No onboarding journey yet. Starting one seeds the client-facing flow and alerts the
              CSM team to confirm payment (which sends the welcome email).
            </p>
            <Button
              size="sm"
              className="bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white border-0"
              disabled={act.isPending}
              onClick={() => run("start_onboarding", "Journey started — confirm payment to send the welcome email")}
            >
              <PlayCircle className="h-4 w-4 mr-1.5" /> Start onboarding
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500"
                    style={{ width: `${row.progress_pct}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-semibold">{row.progress_pct}%</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {row.status === "awaiting_payment"
                ? "Contract signed — payment not yet confirmed."
                : row.status === "completed"
                  ? "Campaign live — onboarding complete."
                  : `In progress · ${row.active_stage ?? "working through the stages"}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {row.status === "awaiting_payment" && (
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white border-0"
                  disabled={act.isPending}
                  onClick={() => run("confirm_paid", "Payment confirmed — welcome email sent")}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm paid
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setDetailOpen(true)}>
                Open journey detail
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <JourneyDetailSheet
        clientProfileId={detailOpen ? clientId : null}
        onClose={() => setDetailOpen(false)}
      />
    </Card>
  );
}
