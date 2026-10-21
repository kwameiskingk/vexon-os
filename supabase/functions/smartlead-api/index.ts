import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("SMARTLEAD_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "SMARTLEAD_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...params } = await req.json();

    const slFetch = async (path: string, method = "GET", body?: any) => {
      const sep = path.includes("?") ? "&" : "?";
      const url = `${SMARTLEAD_BASE}${path}${sep}api_key=${encodeURIComponent(apiKey)}`;
      const opts: RequestInit = {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      };
      if (body && method !== "GET") opts.body = JSON.stringify(body);
      console.log(`[smartlead-api] ${method} ${path}`);
      const res = await fetch(url, opts);
      const text = await res.text();
      if (!res.ok) {
        console.error(`[smartlead-api] ${res.status}: ${text}`);
        throw new Error(`Smartlead API ${res.status}: ${text}`);
      }
      if (!text) return { success: true };
      try { return JSON.parse(text); } catch { return { rawResponse: text }; }
    };

    const fetchAllEmailAccounts = async () => {
      const all: any[] = [];
      let offset = 0;
      const limit = 100;
      while (true) {
        const page = await slFetch(`/email-accounts/?limit=${limit}&offset=${offset}`);
        if (!Array.isArray(page) || page.length === 0) break;
        all.push(...page);
        if (page.length < limit) break;
        offset += limit;
        if (offset > 5000) break;
      }
      return all;
    };

    let result: any;
    switch (action) {
      case "get-inbox-replies":
        result = await slFetch("/master-inbox/fetch-lead-replies", "POST", params);
        break;
      case "get-email-thread":
        result = await slFetch(`/campaigns/${params.campaign_id}/leads/${params.lead_id}/mail-messages`);
        break;
      case "reply-to-lead":
        result = await slFetch(`/campaigns/${params.campaign_id}/leads/reply-email-thread`, "POST", params);
        break;
      case "get-campaigns":
        result = await slFetch("/campaigns/");
        break;
      case "get-campaign-stats":
        result = await slFetch(`/campaigns/${params.campaign_id}/statistics`);
        break;
      case "get-email-accounts":
        result = await fetchAllEmailAccounts();
        break;
      case "sync-sender-accounts": {
        const setterProfileId = params.setter_profile_id;
        if (!setterProfileId) throw new Error("setter_profile_id required");
        const all = await fetchAllEmailAccounts();
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const rows = all.map((a: any) => ({
          smartlead_account_id: a.id,
          email_address: a.from_email,
          setter_profile_id: setterProfileId,
        }));
        if (rows.length > 0) {
          const { error: upErr } = await admin
            .from("gtm_smartlead_sender_accounts")
            .upsert(rows, { onConflict: "smartlead_account_id" });
          if (upErr) throw new Error(`Upsert failed: ${upErr.message}`);
        }
        result = { synced: rows.length };
        break;
      }
      case "pause-campaign":
        result = await slFetch(`/campaigns/${params.campaign_id}/update-status`, "POST", { status: "PAUSED" });
        break;
      case "resume-campaign":
        result = await slFetch(`/campaigns/${params.campaign_id}/update-status`, "POST", { status: "ACTIVE" });
        break;
      case "check-api-key":
        result = await slFetch("/campaigns/");
        result = { ok: true, count: Array.isArray(result) ? result.length : 0 };
        break;
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
    console.error("smartlead-api error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
