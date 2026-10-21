// Slot lookup for signed-in staff. The engine itself lives in
// _shared/slot-engine.ts, shared with booking-public.
//
// Auth is enforced IN CODE (the create-user precedent): the deploy pipeline
// ships every function with platform JWT verification off, so config.toml
// defaults don't protect anything — the function checks its caller itself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { computeSlots } from "../_shared/slot-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Caller gate first: staff surfaces invoke this with the signed-in
    // user's JWT (supabase.functions.invoke attaches it automatically).
    const authHeader = req.headers.get("Authorization") || "";
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const { event_type_id, host_user_id, from_date, days = 14 } = await req.json();
    if (!event_type_id || !host_user_id) {
      return json({ error: "event_type_id and host_user_id are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: eventType, error: etErr } = await supabase
      .from("booking_event_types")
      .select("*, booking_event_hosts(host_user_id, host_calendar_email)")
      .eq("id", event_type_id)
      .single();
    if (etErr || !eventType) return json({ error: "Event type not found" }, 404);
    if (!eventType.is_active) return json({ error: "Event type is not accepting bookings" }, 409);

    const host = (eventType.booking_event_hosts || []).find(
      (h: { host_user_id: string }) => h.host_user_id === host_user_id
    );
    if (!host) return json({ error: "This host is not assigned to this event type" }, 409);

    try {
      const result = await computeSlots(
        supabase, eventType,
        { hostUserId: host_user_id, calendarEmail: host.host_calendar_email },
        { fromDate: from_date, days }
      );
      return json({ ...result, duration_minutes: eventType.duration_minutes });
    } catch (e) {
      console.error("[booking-availability] Google free/busy failed:", e);
      return json({ error: "Could not check the host's calendar — try again shortly" }, 502);
    }
  } catch (e) {
    console.error("[booking-availability]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
