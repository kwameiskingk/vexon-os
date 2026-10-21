// Staff-side hooks for the client onboarding flow (CSM tab + Dev Center).
// All writes go through the client-onboarding-admin edge function.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const JOURNEYS_QUERY_KEY = ["client-onboarding-journeys"];

export interface JourneyOverviewRow {
  client_profile_id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  is_test: boolean;
  status: string;
  source: string;
  contract_signed_at: string | null;
  payment_confirmed_at: string | null;
  welcome_email_sent_at: string | null;
  first_signed_in_at: string | null;
  campaign_live_at: string | null;
  created_at: string;
  progress_pct: number;
  active_stage: string | null;
  ready_for_live: boolean;
}

async function invokeAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("client-onboarding-admin", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const payload = await ctx.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error(error.message || "Something went wrong");
  }
  if (data?.error && data?.needs_force !== true) throw new Error(data.error);
  return data;
}

export function useJourneysOverview(enabled = true) {
  return useQuery<{ journeys: JourneyOverviewRow[] }>({
    queryKey: JOURNEYS_QUERY_KEY,
    queryFn: () => invokeAdmin({ action: "overview" }),
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useJourneyDetail(clientProfileId: string | null) {
  return useQuery({
    queryKey: ["client-onboarding-journey-detail", clientProfileId],
    queryFn: () => invokeAdmin({ action: "journey_detail", client_profile_id: clientProfileId }),
    enabled: !!clientProfileId,
    staleTime: 10_000,
  });
}

export function useJourneyAdminAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: string } & Record<string, unknown>) => invokeAdmin(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: JOURNEYS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["client-onboarding-journey-detail"] });
    },
  });
}
