import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// marketing_leads is newer than the generated types.ts (regen owed), so table
// and column names are cast with the house `as never` pattern until then.

export interface MarketingLead {
  id: string;
  source: "meta_ads" | "heyreach" | "website";
  typeform_response_token: string | null;
  heyreach_event_id: string | null;
  name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  revenue_band: string | null;
  qualification: "qualified" | "price_qualified" | "unqualified" | null;
  outcome: "meeting_booked" | "no_meeting" | null;
  booking_url: string | null;
  campaign_name: string | null;
  sentiment: string | null;
  /** Enquire leads: { form: slug, answers: { "Question title": answer }, hidden, outcome }. */
  raw: { form?: string; answers?: Record<string, unknown>; hidden?: Record<string, string>; outcome?: string | null } | null;
  is_partial: boolean;
  submitted_at: string | null;
  seen_at: string | null;
  actioned_at: string | null;
  created_at: string;
}

const table = () => supabase.from("marketing_leads" as never);

export const useMarketingLeads = () =>
  useQuery({
    queryKey: ["marketing-leads"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await table()
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as MarketingLead[];
    },
  });

export const useMarkLeadsSeen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await table()
        .update({ seen_at: new Date().toISOString() } as never)
        .is("seen_at" as never, null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-leads"] }),
  });
};

export const useToggleLeadActioned = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, actioned }: { id: string; actioned: boolean }) => {
      const { error } = await table()
        .update({ actioned_at: actioned ? new Date().toISOString() : null } as never)
        .eq("id" as never, id as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-leads"] }),
  });
};
