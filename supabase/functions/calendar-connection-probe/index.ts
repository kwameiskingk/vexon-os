// Hourly probe of every connected client calendar (11 Sep; Marcus and
// Daniel, 8 Sep, after Locumsmart's calendar silently un-synced).
//
// Forces a token refresh for each connection. A revoked or expired grant
// fails the refresh, which flips the connection to "error" and, the first
// time only, notifies the CSM and shows the client a reconnect banner (see
// reportClientCalendarDisconnect). Without this, a broken calendar was only
// discovered when the next booking quietly fell back to working hours.
//
// Scheduled by pg_cron (migration 20260911130000) at 40 minutes past every
// hour, offset from the auto-sat sweep.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { getClientCalendarAccess } from "../_shared/google-calendar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conns, error } = await supabase
      .from("calendar_connections")
      .select("id, client_profile_id, calendar_email, provider")
      .eq("owner_type", "client")
      .eq("status", "connected")
      .not("client_profile_id", "is", null);

    if (error) {
      console.error("[calendar-connection-probe] fetch:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ client_profile_id: string; ok: boolean }> = [];
    for (const conn of conns ?? []) {
      try {
        const access = await getClientCalendarAccess(supabase, conn.client_profile_id, { forceRefresh: true });
        results.push({ client_profile_id: conn.client_profile_id, ok: !!access });
      } catch (e) {
        console.error(`[calendar-connection-probe] ${conn.calendar_email}:`, e);
        results.push({ client_profile_id: conn.client_profile_id, ok: false });
      }
    }

    const broken = results.filter((r) => !r.ok).length;
    console.log(`[calendar-connection-probe] checked ${results.length}, broken ${broken}`);
    return new Response(JSON.stringify({ success: true, checked: results.length, broken }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[calendar-connection-probe]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
