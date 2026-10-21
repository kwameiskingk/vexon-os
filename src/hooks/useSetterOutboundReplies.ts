import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OutboundReply {
  id: string;
  prospect_name: string | null;
  prospect_company: string | null;
  prospect_linkedin_url: string | null;
  sender_name: string | null;
  sender_email: string | null;
  campaign_name: string | null;
  campaign_id: string | null;
  message_preview: string | null;
  received_at: string;
  payload: any;
  actioned: boolean;
  outcome?: string;
}

export function useSetterOutboundReplies(userId?: string) {
  return useQuery({
    queryKey: ["setter-outbound-replies", userId],
    queryFn: async () => {
      if (!userId) return { replies: [], unactionedCount: 0 };

      // 1. Get setter profile
      const { data: setterProfile } = await supabase
        .from("setters_profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!setterProfile) return { replies: [], unactionedCount: 0 };

      // 2. Get linked sender accounts
      const { data: senderAccounts } = await supabase
        .from("gtm_sender_accounts")
        .select("sender_email")
        .eq("setter_profile_id", setterProfile.id);

      const senderEmails = senderAccounts?.map(s => s.sender_email).filter(Boolean) as string[];
      if (!senderEmails?.length) return { replies: [], unactionedCount: 0 };

      // 3. Fetch reply events for these senders
      const { data: events } = await supabase
        .from("gtm_heyreach_events")
        .select("*")
        .in("sender_email", senderEmails)
        .like("event_type", "%reply%")
        .not("event_type", "like", "setter_action_%")
        .order("received_at", { ascending: false })
        .limit(100);

      if (!events?.length) return { replies: [], unactionedCount: 0 };

      // 4. Check which have been actioned
      const eventIds = events.map(e => e.id);
      const { data: actions } = await supabase
        .from("heyreach_reply_actions" as any)
        .select("event_id, outcome")
        .in("event_id", eventIds);

      const actionMap = new Map<string, string>();
      (actions || []).forEach((a: any) => actionMap.set(a.event_id, a.outcome));

      const replies: OutboundReply[] = events.map(e => ({
        id: e.id,
        prospect_name: e.prospect_name,
        prospect_company: e.prospect_company,
        prospect_linkedin_url: e.prospect_linkedin_url,
        sender_name: e.sender_name,
        sender_email: e.sender_email,
        campaign_name: e.campaign_name,
        campaign_id: e.campaign_id,
        message_preview: e.message_preview,
        received_at: e.received_at,
        payload: e.payload,
        actioned: actionMap.has(e.id),
        outcome: actionMap.get(e.id),
      }));

      // Sort: unactioned first, then by received_at desc
      replies.sort((a, b) => {
        if (a.actioned !== b.actioned) return a.actioned ? 1 : -1;
        return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
      });

      const unactionedCount = replies.filter(r => !r.actioned).length;

      return { replies, unactionedCount };
    },
    enabled: !!userId,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
