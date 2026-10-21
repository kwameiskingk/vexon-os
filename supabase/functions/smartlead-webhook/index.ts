import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

async function classifyReply(replyBody: string): Promise<string | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey || !replyBody) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 16,
        system:
          "You are a reply classifier. Classify the email reply into exactly one of these categories: positive, interested, not_interested, more_info, ooo. Respond with only the single word, lowercase.",
        messages: [{ role: "user", content: replyBody.slice(0, 4000) }],
      }),
    });
    const json = await res.json();
    const text = json?.content?.[0]?.text?.trim().toLowerCase() || "";
    const allowed = ["positive", "interested", "not_interested", "more_info", "ooo"];
    return allowed.includes(text) ? text : null;
  } catch (e) {
    console.error("[SMARTLEAD] classify error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const secretParam = url.searchParams.get("secret");
    const expected = Deno.env.get("SMARTLEAD_WEBHOOK_SECRET");
    if (!expected || secretParam !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = await req.json();
    console.log("[SMARTLEAD] event:", JSON.stringify(payload).substring(0, 500));

    const eventType: string = payload.event_type || payload.eventType || payload.type || "unknown";
    const campaignId = payload.campaign_id ?? payload.campaignId ?? payload.campaign?.id ?? null;
    const leadId = payload.lead_id ?? payload.leadId ?? payload.lead?.id ?? null;
    const emailAccountId =
      payload.email_account_id ?? payload.emailAccountId ?? payload.email_account?.id ?? null;
    const campaignName = payload.campaign_name ?? payload.campaignName ?? payload.campaign?.name ?? null;

    const { data: insertedEvent, error: eventErr } = await supabase
      .from("gtm_smartlead_events")
      .insert({
        event_type: eventType,
        campaign_id: campaignId ? Number(campaignId) : null,
        lead_id: leadId ? Number(leadId) : null,
        email_account_id: emailAccountId ? Number(emailAccountId) : null,
        payload,
      })
      .select("id")
      .single();

    if (eventErr) console.error("[SMARTLEAD] insert event error:", eventErr);

    // Update campaign metrics counter
    if (campaignId) {
      const normalized = eventType.toUpperCase();
      let field: string | null = null;
      if (normalized.includes("REPLIED") || normalized.includes("REPLY")) field = "emails_replied";
      else if (normalized.includes("BOUNCED") || normalized.includes("BOUNCE")) field = "emails_bounced";
      else if (normalized.includes("UNSUBSCRIBE")) field = "emails_unsubscribed";
      else if (normalized.includes("SENT")) field = "emails_sent";

      const { data: existing } = await supabase
        .from("gtm_smartlead_campaign_metrics")
        .select("*")
        .eq("smartlead_campaign_id", Number(campaignId))
        .maybeSingle();

      if (existing) {
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (campaignName) updates.campaign_name = campaignName;
        if (field) updates[field] = (existing[field] || 0) + 1;
        await supabase
          .from("gtm_smartlead_campaign_metrics")
          .update(updates)
          .eq("smartlead_campaign_id", Number(campaignId));
      } else {
        const newRow: Record<string, any> = {
          smartlead_campaign_id: Number(campaignId),
          campaign_name: campaignName || `Campaign ${campaignId}`,
        };
        if (field) newRow[field] = 1;
        await supabase.from("gtm_smartlead_campaign_metrics").insert(newRow);
      }
    }

    // EMAIL_REPLIED: classify sentiment + notify mapped setter
    const isReply = eventType.toUpperCase().includes("REPLIED") || eventType.toUpperCase().includes("REPLY");
    if (isReply && insertedEvent?.id) {
      const replyBody =
        payload.reply_message?.text ||
        payload.reply_message?.html ||
        payload.reply_body ||
        payload.message?.body ||
        payload.message?.text ||
        payload.text ||
        "";

      const sentiment = await classifyReply(String(replyBody));
      if (sentiment) {
        await supabase
          .from("gtm_smartlead_events")
          .update({ sentiment })
          .eq("id", insertedEvent.id);
      }

      if (emailAccountId) {
        const { data: senderAcct } = await supabase
          .from("gtm_smartlead_sender_accounts")
          .select("setter_profile_id, email_address")
          .eq("smartlead_account_id", Number(emailAccountId))
          .maybeSingle();

        if (senderAcct?.setter_profile_id) {
          const { data: setter } = await supabase
            .from("setters_profiles")
            .select("user_id, full_name")
            .eq("id", senderAcct.setter_profile_id)
            .maybeSingle();

          if (setter?.user_id) {
            const { data: roleRow } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", setter.user_id)
              .limit(1)
              .maybeSingle();

            const leadName =
              payload.lead?.first_name || payload.lead?.full_name || payload.lead?.email || "a prospect";

            await supabase.from("notifications").insert({
              recipient_id: setter.user_id,
              recipient_role: roleRow?.role || "setter",
              title: `📧 New cold email reply from ${leadName}`,
              message: `Sentiment: ${sentiment || "unclassified"}${campaignName ? ` (${campaignName})` : ""}`,
              category: "system",
              link_url: `/setter/smartlead-reply/${insertedEvent.id}`,
              triggered_by: null,
            });
          }
        }
      }
    }

    if (eventType.toUpperCase().includes("LEAD_CATEGORY_UPDATED")) {
      console.log("[SMARTLEAD] LEAD_CATEGORY_UPDATED logged for lead", leadId);
    }

    return new Response(JSON.stringify({ ok: true, event_type: eventType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[SMARTLEAD ERROR]", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
