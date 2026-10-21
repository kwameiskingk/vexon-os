import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Renewal clock runs off campaigns.end_date ONLY (ruling 2026-07-20):
// client_profiles.campaign_end_date / renewal_date are the CSM's renewal
// record and are deliberately not read here. Sent-flags dedupe like
// catchup-notifications; a campaign entering the window late fires only its
// current threshold and back-fills the earlier flags. The DB trigger
// trg_reset_campaign_renewal_flags re-arms all three when end_date changes.
const THRESHOLDS = [
  { days: 30, flag: "renewal_notified_30d" },
  { days: 14, flag: "renewal_notified_14d" },
  { days: 7, flag: "renewal_notified_7d" },
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().split("T")[0];
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 30);
    const horizonStr = horizon.toISOString().split("T")[0];

    const { data: campaigns, error } = await supabase
      .from("campaigns")
      .select(
        "id, name, client_id, end_date, renewal_notified_30d, renewal_notified_14d, renewal_notified_7d, clients(company_name)",
      )
      .eq("status", "active")
      .gte("end_date", today)
      .lte("end_date", horizonStr);

    if (error) throw error;

    const notifications: any[] = [];

    for (const campaign of campaigns || []) {
      const daysLeft = Math.round(
        (new Date(campaign.end_date).getTime() - new Date(today).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      const due = THRESHOLDS.find(
        (t) => daysLeft <= t.days && !(campaign as any)[t.flag],
      );
      if (!due) continue;

      const clientName =
        (campaign.clients as any)?.company_name || "a client";
      const endDatePretty = new Date(campaign.end_date).toLocaleDateString(
        "en-GB",
        { day: "numeric", month: "short", year: "numeric" },
      );
      const title = `Campaign ending in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
      const message = `Campaign "${campaign.name}" for ${clientName} ends on ${endDatePretty} — start the renewal conversation.`;

      notifications.push(
        {
          recipient_role: "csm",
          recipient_id: null,
          title,
          message,
          category: "renewal",
          link_url: `/csm/campaigns/${campaign.id}`,
        },
        {
          recipient_role: "admin",
          recipient_id: null,
          title,
          message,
          category: "renewal",
          link_url: `/admin/campaigns/${campaign.id}`,
        },
      );

      // Back-fill every flag at or above the fired threshold so a campaign
      // entering the window late never triple-pings on day one.
      const flagUpdate: Record<string, boolean> = {};
      for (const t of THRESHOLDS) {
        if (daysLeft <= t.days) flagUpdate[t.flag] = true;
      }
      const { error: flagError } = await supabase
        .from("campaigns")
        .update(flagUpdate)
        .eq("id", campaign.id);
      if (flagError) {
        // Skip the notification rather than risk re-pinging tomorrow.
        console.error(`Flag update failed for campaign ${campaign.id}:`, flagError);
        notifications.splice(-2, 2);
      }
    }

    if (notifications.length > 0) {
      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notifications);
      if (notifError) console.error("Failed to insert notifications:", notifError);
    }

    return new Response(
      JSON.stringify({ checked: campaigns?.length || 0, sent: notifications.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
