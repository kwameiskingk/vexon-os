import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HEYREACH_BASE = "https://api.heyreach.io/api/public";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("HEYREACH_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "HEYREACH_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, ...params } = body;

    const heyreachFetch = async (path: string, method = "GET", fetchBody?: any) => {
      const opts: RequestInit = {
        method,
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      };

      if (fetchBody && method !== "GET") {
        opts.body = JSON.stringify(fetchBody);
      }

      const url = `${HEYREACH_BASE}${path}`;
      console.log(`[heyreach-api] ${method} ${url}`);

      const res = await fetch(url, opts);
      const text = await res.text();

      if (!res.ok) {
        console.error(`[heyreach-api] ${res.status} from ${url}: ${text}`);
        throw new Error(`HeyReach API error ${res.status}: ${text}`);
      }

      if (!text) return { success: true };
      try {
        return JSON.parse(text);
      } catch {
        return { rawResponse: text };
      }
    };

    let result: any;

    switch (action) {
      // === Conversations (documented: POST /inbox/GetConversationsV2) ===
      case "get-conversations": {
        const filters: any = {};
        if (params.linkedInAccountId) filters.linkedInAccountIds = [Number(params.linkedInAccountId)];
        if (params.campaignId) filters.campaignIds = [Number(params.campaignId)];
        if (params.searchText) filters.searchString = params.searchText;
        if (params.read !== undefined) filters.seen = params.read;

        result = await heyreachFetch("/inbox/GetConversationsV2", "POST", {
          filters,
          offset: params.offset || 0,
          limit: params.limit || 25,
        });
        break;
      }

      // === Chatroom (documented: GET /inbox/GetChatroom/:accountId/:conversationId) ===
      case "get-chatroom": {
        const accountId = encodeURIComponent(String(params.accountId));
        const conversationId = encodeURIComponent(String(params.conversationId));
        result = await heyreachFetch(`/inbox/GetChatroom/${accountId}/${conversationId}`);
        // Log first message structure for debugging sender detection
        const msgs = result?.messages || result?.items || (Array.isArray(result) ? result : []);
        if (msgs.length > 0) {
          console.log(`[heyreach-api] Chatroom first message keys: ${JSON.stringify(Object.keys(msgs[0]))}`);
          console.log(`[heyreach-api] Chatroom first message sender: ${JSON.stringify(msgs[0].sender)}`);
          if (msgs.length > 1) {
            console.log(`[heyreach-api] Chatroom second message sender: ${JSON.stringify(msgs[1]?.sender)}`);
          }
        }
        break;
      }

      // === Send Message (documented: POST /inbox/SendMessage with conversationId) ===
      case "send-message": {
        result = await heyreachFetch("/inbox/SendMessage", "POST", {
          linkedInAccountId: Number(params.linkedInAccountId),
          conversationId: params.conversationId,
          message: params.message,
        });
        break;
      }

      // === Campaigns ===
      case "get-campaigns": {
        const payload: any = {
          offset: params.offset || 0,
          limit: params.limit || 50,
        };
        if (params.keyword) payload.keyword = params.keyword;
        if (params.statuses) payload.statuses = params.statuses;
        if (params.accountIds) payload.accountIds = params.accountIds;
        result = await heyreachFetch("/campaign/GetAll", "POST", payload);
        break;
      }

      case "get-campaign-by-id": {
        result = await heyreachFetch(`/campaign/GetById?campaignId=${params.campaignId}`);
        break;
      }

      case "get-campaign-stats": {
        result = await heyreachFetch("/analytics/GetOverallStats", "POST", {
          campaignIds: [Number(params.campaignId)],
        });
        break;
      }

      case "get-overall-stats": {
        const payload: any = {};
        if (params.campaignIds) payload.campaignIds = params.campaignIds;
        if (params.accountIds) payload.accountIds = params.accountIds;
        try {
          result = await heyreachFetch("/analytics/GetOverallStats", "POST", payload);
        } catch (error: any) {
          console.warn(`[heyreach-api] get-overall-stats failed, returning empty: ${error.message}`);
          result = {
            connectionRequestsSent: 0,
            connectionRequestsAccepted: 0,
            messagesSent: 0,
            messagesReplied: 0,
          };
        }
        break;
      }

      // === LinkedIn Accounts ===
      case "get-senders": {
        try {
          const limit = Math.min(Math.max(Number(params.limit || 100), 1), 100);
          try {
            result = await heyreachFetch("/li_account/GetAll", "POST", {
              offset: Number(params.offset || 0),
              limit,
            });
          } catch (error: any) {
            console.warn(`[heyreach-api] li_account/GetAll unavailable, deriving senders from inbox: ${error.message}`);
            result = { items: [] };
          }
          const items = Array.isArray(result?.items) ? result.items : Array.isArray(result) ? result : [];
          if (items.length === 0) {
            const conversations = await heyreachFetch("/inbox/GetConversationsV2", "POST", {
              filters: {},
              offset: 0,
              limit,
            });
            const accounts = new Map<number, any>();
            (conversations?.items || []).forEach((conversation: any) => {
              const account = conversation.linkedInAccount;
              const accountId = Number(conversation.linkedInAccountId || account?.id);
              if (account && accountId && !accounts.has(accountId)) {
                accounts.set(accountId, {
                  id: accountId,
                  firstName: account.firstName,
                  lastName: account.lastName,
                  fullName: [account.firstName, account.lastName].filter(Boolean).join(" ").trim(),
                  emailAddress: account.emailAddress,
                  profileUrl: account.profileUrl,
                  authIsValid: account.authIsValid,
                });
              }
            });
            result = { items: Array.from(accounts.values()) };
          }
        } catch (error: any) {
          console.warn(`[heyreach-api] get-senders failed, returning empty: ${error.message}`);
          result = [];
        }
        break;
      }

      case "get-sender": {
        const senderId = encodeURIComponent(String(params.senderId));
        result = await heyreachFetch(`/linkedInAccount/Get?id=${senderId}`);
        break;
      }

      // === Campaign Controls ===
      case "pause-campaign": {
        result = await heyreachFetch(`/campaign/Pause?campaignId=${params.campaignId}`, "POST");
        break;
      }

      case "resume-campaign": {
        result = await heyreachFetch(`/campaign/Resume?campaignId=${params.campaignId}`, "POST");
        break;
      }

      // === Auth Check ===
      case "check-api-key": {
        result = await heyreachFetch("/auth/CheckApiKey");
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("heyreach-api error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
