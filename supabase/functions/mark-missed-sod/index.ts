// Marks any user in start_of_day_settings.target_roles as "missed" for today
// if they have not submitted a Start of Day form.
// Triggered daily via pg_cron at the EOD popup time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getUKDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ukDate = getUKDateString();

    // 1. Read settings
    const { data: settings, error: settingsError } = await supabase
      .from("start_of_day_settings")
      .select("enabled, target_roles")
      .limit(1)
      .single();

    if (settingsError) throw settingsError;
    if (!settings?.enabled) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetRoles: string[] = settings.target_roles || [];
    if (!targetRoles.length) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "no_target_roles" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Find users with target roles
    const { data: roleRows, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", targetRoles as any);
    if (rolesError) throw rolesError;

    const userIds = Array.from(
      new Set((roleRows || []).map((r: any) => r.user_id))
    );
    if (!userIds.length) {
      return new Response(
        JSON.stringify({ ok: true, marked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Find who already submitted today
    const { data: existing, error: existingError } = await supabase
      .from("start_of_day_submissions")
      .select("user_id")
      .eq("date", ukDate)
      .in("user_id", userIds);
    if (existingError) throw existingError;

    const submitted = new Set((existing || []).map((r: any) => r.user_id));
    const missed = userIds.filter((id) => !submitted.has(id));

    if (!missed.length) {
      return new Response(
        JSON.stringify({ ok: true, marked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Insert missed rows (idempotent via unique(user_id, date))
    const rows = missed.map((user_id) => ({
      user_id,
      date: ukDate,
      missed: true,
    }));

    const { error: insertError } = await supabase
      .from("start_of_day_submissions")
      .upsert(rows, { onConflict: "user_id,date", ignoreDuplicates: true });
    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ ok: true, marked: missed.length, date: ukDate }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("mark-missed-sod error", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
