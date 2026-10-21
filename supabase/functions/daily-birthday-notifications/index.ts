import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECIPIENT_ROLES = ["admin", "dev", "ops", "csm"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const fmt = (opt: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...opt }).format(now);
    const month = parseInt(fmt({ month: "numeric" }), 10);
    const day = parseInt(fmt({ day: "numeric" }), 10);
    const ukDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);

    // Find employees whose birthday matches today (any year)
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, birthday")
      .not("birthday", "is", null);
    if (pErr) throw pErr;

    const birthdayUsers = (profiles || []).filter((p: any) => {
      if (!p.birthday) return false;
      const d = new Date(p.birthday);
      return d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
    });

    if (birthdayUsers.length === 0) {
      return new Response(JSON.stringify({ message: "No birthdays today", date: ukDate }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exclude clients
    const ids = birthdayUsers.map((p: any) => p.id);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids);
    const nonClientIds = new Set(
      (roles || []).filter((r: any) => r.role !== "client").map((r: any) => r.user_id)
    );
    const employees = birthdayUsers.filter((p: any) => nonClientIds.has(p.id));

    // Recipients (admins / dev / ops / csm)
    const { data: recipients } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", RECIPIENT_ROLES);

    const notifications: any[] = [];
    let totalNotified = 0;

    for (const emp of employees) {
      const firstName = (emp.full_name || "there").split(" ")[0];

      // De-dup: skip if a birthday notif for this employee was already inserted today
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", emp.id)
        .eq("category", "achievement")
        .ilike("title", "%Happy Birthday%")
        .gte("created_at", `${ukDate}T00:00:00Z`);
      if ((count || 0) > 0) continue;

      // Notify the employee themself
      notifications.push({
        recipient_id: emp.id,
        recipient_role: (roles || []).find((r: any) => r.user_id === emp.id)?.role || "admin",
        title: "🎉 Happy Birthday!",
        message: `Wishing you a fantastic birthday, ${firstName}! Have an amazing day from everyone at the team. 🎂`,
        category: "achievement",
        link_url: "/",
      });

      // Notify admins / dev / ops / csm
      for (const rec of recipients || []) {
        if (rec.user_id === emp.id) continue;
        notifications.push({
          recipient_id: rec.user_id,
          recipient_role: rec.role,
          title: "🎂 Team Birthday Today",
          message: `It's ${emp.full_name || "a teammate"}'s birthday today — wish them a happy birthday!`,
          category: "achievement",
          link_url: "/admin/hr/overview",
        });
      }
      totalNotified++;
    }

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }

    return new Response(
      JSON.stringify({
        message: `Sent ${notifications.length} birthday notifications for ${totalNotified} employees`,
        date: ukDate,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
