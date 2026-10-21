import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Marketing Hub owner — warm replies land in his lead feed (see step 4a).
const JAMES_USER_ID = "42292222-46a0-4b2c-85b8-ecf3fca6415b";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
async function classifyReply(replyBody: string): Promise<string | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey || !replyBody) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 16,
        system: "You are a reply classifier. Classify the LinkedIn reply into exactly one of these categories: positive, interested, not_interested, more_info, ooo. Respond with only the single word, lowercase.",
        messages: [{ role: "user", content: replyBody.slice(0, 4000) }],
      }),
    });
    const json = await res.json();
    const text = json?.content?.[0]?.text?.trim().toLowerCase() || "";
    const allowed = ["positive", "interested", "not_interested", "more_info", "ooo"];
    return allowed.includes(text) ? text : null;
  } catch (e) {
    console.error("[HEYREACH] classify error:", e);
    return null;
  }
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookSecret = Deno.env.get("HEYREACH_WEBHOOK_SECRET");

    const url = new URL(req.url);
    const secretParam = url.searchParams.get("secret");

    if (webhookSecret && secretParam !== webhookSecret) {
      console.error("[HEYREACH] Invalid or missing webhook secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const payload = await req.json();

    console.log("[HEYREACH] Webhook received:", JSON.stringify(payload).substring(0, 500));

    const eventType = payload.event_type || payload.eventType || payload.type || "unknown";

    // Campaign
    const campaignId = payload.campaign?.id || payload.campaign_id || payload.campaignId || "";
    const campaignName = payload.campaign?.name || payload.campaign_name || payload.campaignName || "";

    // Lead/prospect - HeyReach uses "lead"
    const prospectName = payload.lead?.full_name || payload.lead?.name ||
      [payload.lead?.first_name || payload.lead?.firstName, payload.lead?.last_name || payload.lead?.lastName].filter(Boolean).join(" ") ||
      payload.prospect_name || payload.prospectName || "";
    const prospectLinkedinUrl = payload.lead?.profile_url || payload.lead?.linkedin_url ||
      payload.prospect_linkedin_url || payload.prospectLinkedInUrl || "";
    const prospectCompany = payload.lead?.company_name || payload.lead?.company ||
      payload.prospect_company || payload.prospectCompany || "";
    const prospectPosition = payload.lead?.position || "";
    const prospectLocation = payload.lead?.location || "";
    const prospectSummary = payload.lead?.summary || "";

    // Sender
    const senderName = payload.sender?.full_name || payload.sender?.name ||
      payload.sender_name || payload.senderName || "";
    const senderEmail = payload.sender?.email_address || payload.sender?.email ||
      payload.sender_email || payload.senderEmail || "";
    const senderLinkedinUrl = payload.sender?.profile_url || payload.sender?.linkedin_url || "";

    // Message
    const messagePreview = payload.message || payload.messagePreview || payload.message_preview || "";

    // 1. Insert raw event
    const { data: insertedEvent, error: eventError } = await supabase.from("gtm_heyreach_events").insert({
      event_type: eventType,
      campaign_id: String(campaignId),
      campaign_name: campaignName,
      sender_name: senderName,
      sender_email: senderEmail,
      prospect_name: prospectName,
      prospect_linkedin_url: prospectLinkedinUrl,
      prospect_company: prospectCompany,
      message_preview: messagePreview,
      payload: payload,
    }).select("id").single();

    if (eventError) {
      console.error("[HEYREACH] Error inserting event:", eventError);
    }

    // 2. Upsert campaign metrics
    if (campaignId) {
      const normalizedEventType = eventType.toLowerCase().replace(/[^a-z_]/g, "_");

      let incrementField: string | null = null;

      if (normalizedEventType.includes("reply") || normalizedEventType.includes("replied")) {
        incrementField = normalizedEventType.includes("inmail") ? "inmails_replied" : "messages_replied";
      } else if (normalizedEventType.includes("connection") && normalizedEventType.includes("accepted")) {
        incrementField = "connections_accepted";
      } else if (normalizedEventType.includes("connection") && normalizedEventType.includes("sent")) {
        incrementField = "connections_sent";
      } else if (normalizedEventType.includes("message") && normalizedEventType.includes("sent")) {
        incrementField = "messages_sent";
      } else if (normalizedEventType.includes("inmail") && normalizedEventType.includes("sent")) {
        incrementField = "inmails_sent";
      }

      const { data: existing } = await supabase
        .from("gtm_campaign_metrics")
        .select("*")
        .eq("heyreach_campaign_id", String(campaignId))
        .maybeSingle();

      if (existing) {
        const updates: Record<string, any> = { last_event_at: new Date().toISOString() };
        if (campaignName) updates.campaign_name = campaignName;
        if (incrementField) {
          updates[incrementField] = (existing[incrementField] || 0) + 1;
        }
        await supabase
          .from("gtm_campaign_metrics")
          .update(updates)
          .eq("heyreach_campaign_id", String(campaignId));
      } else {
        const newRecord: Record<string, any> = {
          heyreach_campaign_id: String(campaignId),
          campaign_name: campaignName || `Campaign ${campaignId}`,
          last_event_at: new Date().toISOString(),
        };
        if (incrementField) {
          newRecord[incrementField] = 1;
        }
        await supabase.from("gtm_campaign_metrics").insert(newRecord);
      }
    }

    // 3. Upsert sender account with HeyReach numeric ID
    const heyreachSenderId = payload.sender?.id || null;
    let existingSender: { id: string; setter_profile_id: string | null } | null = null;
    if (senderName || senderEmail) {

      if (senderEmail) {
        const { data } = await supabase
          .from("gtm_sender_accounts")
          .select("id, setter_profile_id")
          .eq("sender_email", senderEmail)
          .maybeSingle();
        existingSender = data;
      }
      
      if (!existingSender && senderName) {
        const { data } = await supabase
          .from("gtm_sender_accounts")
          .select("id, setter_profile_id")
          .eq("sender_name", senderName)
          .maybeSingle();
        existingSender = data;
      }

      if (existingSender) {
        const senderUpdates: Record<string, any> = {
          last_activity_at: new Date().toISOString(),
          status: "active",
        };
        if (senderLinkedinUrl) senderUpdates.linkedin_url = senderLinkedinUrl;
        if (senderEmail) senderUpdates.sender_email = senderEmail;
        if (heyreachSenderId) senderUpdates.heyreach_sender_id = heyreachSenderId;
        await supabase
          .from("gtm_sender_accounts")
          .update(senderUpdates)
          .eq("id", existingSender.id);
      } else if (senderName) {
        await supabase.from("gtm_sender_accounts").insert({
          sender_name: senderName,
          sender_email: senderEmail || null,
          linkedin_url: senderLinkedinUrl || null,
          heyreach_sender_id: heyreachSenderId || null,
          last_activity_at: new Date().toISOString(),
        });
      }

    }

    // 4. REPLY HANDLING: classify sentiment for EVERY reply (not just mapped
    // senders), feed the Marketing Hub lead feed, then notify the linked setter.
    const normalizedType = eventType.toLowerCase().replace(/[^a-z_]/g, "_");
    const isReply = normalizedType.includes("reply") || normalizedType.includes("replied");

    if (isReply && insertedEvent?.id) {
      // Classify reply sentiment via Claude
      const sentiment = await classifyReply(String(messagePreview || ""));
      if (sentiment) {
        await supabase.from("gtm_heyreach_events").update({ sentiment }).eq("id", insertedEvent.id);
      }

      // 4a. MARKETING HUB LEAD: warm replies become marketing_leads rows and
      // ring Tom's bell (the owner's ruling 26 Aug: positive/interested/more_info).
      const LEAD_SENTIMENTS = ["positive", "interested", "more_info"];
      if (sentiment && LEAD_SENTIMENTS.includes(sentiment)) {
        try {
          const { error: leadError } = await supabase.from("marketing_leads").insert({
            source: "heyreach",
            heyreach_event_id: insertedEvent.id,
            name: prospectName || null,
            company_name: prospectCompany || null,
            campaign_name: campaignName || null,
            sentiment,
            outcome: "no_meeting",
            raw: payload,
            submitted_at: new Date().toISOString(),
          });
          // Unique heyreach_event_id makes retries a no-op (duplicate key).
          if (leadError && !String(leadError.message || "").includes("duplicate")) {
            console.error("[HEYREACH] marketing_leads insert failed:", leadError);
          } else if (!leadError) {
            const sentimentLabel = sentiment === "more_info" ? "Wants more info" :
              sentiment.charAt(0).toUpperCase() + sentiment.slice(1);
            await supabase.from("notifications").insert({
              recipient_id: JAMES_USER_ID,
              recipient_role: "setter",
              title: `🔗 New lead from HeyReach — ${prospectName || "a prospect"}`,
              message: `${prospectName || "Someone"}${prospectCompany ? ` (${prospectCompany})` : ""} · ${sentimentLabel} reply${campaignName ? ` · ${campaignName}` : ""}`,
              category: "system",
              link_url: "/marketing/leads",
              triggered_by: null,
            });
          }
        } catch (leadErr) {
          console.error("[HEYREACH] Error creating marketing lead:", leadErr);
        }
      }

      // 4b. Notify the linked setter (pre-existing behaviour, unchanged).
      if (existingSender?.setter_profile_id) {
        try {
          // Look up setter's user_id from setters_profiles

          const { data: setterProfile } = await supabase
            .from("setters_profiles")
            .select("user_id, full_name")
            .eq("id", existingSender.setter_profile_id)
            .maybeSingle();

          if (setterProfile?.user_id) {
            // Get setter's role for the notification
            const { data: userRole } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", setterProfile.user_id)
              .limit(1)
              .maybeSingle();

            const recipientRole = userRole?.role || "setter";

            await supabase.from("notifications").insert({
              recipient_id: setterProfile.user_id,
              recipient_role: recipientRole,
              title: `💬 New LinkedIn Reply from ${prospectName || "a prospect"}`,
              message: prospectCompany
                ? `${prospectName || "Someone"} from ${prospectCompany} replied to your outreach${campaignName ? ` (${campaignName})` : ""}.`
                : `${prospectName || "Someone"} replied to your LinkedIn outreach${campaignName ? ` (${campaignName})` : ""}.`,
              category: "system",
              link_url: `/setter/heyreach-reply/${insertedEvent.id}`,
              triggered_by: null,
            });

            console.log(`[HEYREACH] Notification sent to setter ${setterProfile.full_name} (${setterProfile.user_id}) for reply from ${prospectName}`);
          } else {
            console.log(`[HEYREACH] Setter profile ${existingSender.setter_profile_id} has no user_id, skipping notification`);
          }
        } catch (notifError) {
          console.error("[HEYREACH] Error sending reply notification:", notifError);
        }
      }
    }

    console.log(`[HEYREACH] Processed event: ${eventType} for campaign ${campaignId} | prospect: ${prospectName} | sender: ${senderName}`);

    return new Response(JSON.stringify({ ok: true, event_type: eventType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[HEYREACH ERROR]", error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
