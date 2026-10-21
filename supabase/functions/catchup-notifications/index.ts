import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHour = now.getUTCHours();

    // Get all scheduled catchups from today forward + 2 days back window
    const twoDaysFromNow = new Date(now);
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    const twoDaysStr = twoDaysFromNow.toISOString().split("T")[0];

    const { data: catchups, error } = await supabase
      .from("client_catchups")
      .select("*, client_profiles!inner(company_name, user_id)")
      .eq("status", "scheduled")
      .gte("scheduled_date", today)
      .lte("scheduled_date", twoDaysStr);

    if (error) throw error;

    // Client logins are linked via the client_profile_users junction (the
    // legacy client_profiles.user_id is a fallback only) — resolve every
    // login for each profile so junction-linked clients get reminders too.
    const profileIds = [...new Set((catchups || []).map((c: any) => c.client_profile_id).filter(Boolean))];
    const junctionByProfile = new Map<string, string[]>();
    if (profileIds.length > 0) {
      const { data: links } = await supabase
        .from("client_profile_users")
        .select("client_profile_id, user_id")
        .in("client_profile_id", profileIds);
      for (const l of links || []) {
        const arr = junctionByProfile.get(l.client_profile_id) || [];
        arr.push(l.user_id);
        junctionByProfile.set(l.client_profile_id, arr);
      }
    }

    const notifications: any[] = [];

    for (const catchup of catchups || []) {
      const scheduledDate = new Date(catchup.scheduled_date + "T" + catchup.scheduled_time);
      const diffMs = scheduledDate.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      const clientName = catchup.client_profiles?.company_name || "Client";
      const recipientIds = [...new Set([
        ...(junctionByProfile.get(catchup.client_profile_id) || []),
        ...(catchup.client_profiles?.user_id ? [catchup.client_profiles.user_id] : []),
      ])];

      // 2 days before
      if (diffDays <= 2 && diffDays > 1 && !catchup.notification_2d_sent) {
        for (const rid of recipientIds) {
          notifications.push({
            recipient_id: rid,
            recipient_role: "client",
            title: "Weekly Catch-up in 2 Days",
            message: `Your weekly catch-up with us is scheduled for ${catchup.scheduled_date} at ${catchup.scheduled_time?.slice(0, 5)}.`,
            category: "catchup",
            link_url: "/client/dashboard",
          });
        }
        await supabase.from("client_catchups").update({ notification_2d_sent: true }).eq("id", catchup.id);
      }

      // 1 day before
      if (diffDays <= 1 && diffDays > 0.5 && !catchup.notification_1d_sent) {
        for (const rid of recipientIds) {
          notifications.push({
            recipient_id: rid,
            recipient_role: "client",
            title: "Weekly Catch-up Tomorrow",
            message: `Reminder: Your weekly catch-up is tomorrow at ${catchup.scheduled_time?.slice(0, 5)}.`,
            category: "catchup",
            link_url: "/client/dashboard",
          });
        }
        await supabase.from("client_catchups").update({ notification_1d_sent: true }).eq("id", catchup.id);
      }

      // Same day
      if (catchup.scheduled_date === today && !catchup.notification_day_sent) {
        for (const rid of recipientIds) {
          notifications.push({
            recipient_id: rid,
            recipient_role: "client",
            title: "Weekly Catch-up Today",
            message: `Your weekly catch-up is today at ${catchup.scheduled_time?.slice(0, 5)}. Please be ready.`,
            category: "catchup",
            link_url: "/client/dashboard",
          });
        }
        await supabase.from("client_catchups").update({ notification_day_sent: true }).eq("id", catchup.id);
      }

      // 1 hour before
      if (diffHours <= 1 && diffHours > 0 && !catchup.notification_1h_sent) {
        for (const rid of recipientIds) {
          notifications.push({
            recipient_id: rid,
            recipient_role: "client",
            title: "Weekly Catch-up Starting Soon",
            message: `Your weekly catch-up starts in less than 1 hour.`,
            category: "catchup",
            link_url: "/client/dashboard",
          });
        }
        await supabase.from("client_catchups").update({ notification_1h_sent: true }).eq("id", catchup.id);
      }
    }

    // Insert all notifications
    if (notifications.length > 0) {
      const { error: notifError } = await supabase.from("notifications").insert(notifications);
      if (notifError) console.error("Failed to insert notifications:", notifError);
    }

    return new Response(JSON.stringify({ sent: notifications.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
