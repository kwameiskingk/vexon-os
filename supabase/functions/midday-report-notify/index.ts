import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase
      .from("midday_report_settings")
      .select("enabled, target_roles")
      .limit(1)
      .single();

    if (!settings?.enabled) {
      return new Response(JSON.stringify({ message: "Midday reports disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const ukHour = parseInt(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hour12: false }).format(now),
      10
    );
    const ukDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    const ukDay = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/London", weekday: "long" }).format(now);

    const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    if (!weekdays.includes(ukDay)) {
      return new Response(JSON.stringify({ message: "Weekend - skipping" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only fire once per day at noon UK
    if (ukHour !== 12) {
      return new Response(JSON.stringify({ message: `Outside trigger hour (${ukHour})` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetRoles = settings.target_roles || ["setter"];
    const { data: targetUsers } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", targetRoles);

    if (!targetUsers?.length) {
      return new Response(JSON.stringify({ message: "No target users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = targetUsers.map((u) => u.user_id);
    const { data: existing } = await supabase
      .from("midday_reports")
      .select("user_id")
      .in("user_id", userIds)
      .eq("date", ukDate);

    const submitted = new Set((existing || []).map((u) => u.user_id));

    const notifications = targetUsers
      .filter((u) => !submitted.has(u.user_id))
      .map((u) => ({
        recipient_id: u.user_id,
        recipient_role: u.role,
        title: "Midday Report",
        message: "Quick check-in: how are you doing midday? Tap to fill in your report.",
        category: "system",
        link_url: "/forms",
      }));

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }

    return new Response(
      JSON.stringify({ message: `Notified ${notifications.length} users`, date: ukDate }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
