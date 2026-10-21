// @auth: none
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, close-sig-timestamp, close-sig-hash",
};

// Helper functions for email normalization
const normalizeEmail = (s: string): string => s?.trim().toLowerCase();
const localPart = (s: string): string => normalizeEmail(s).split("@")[0];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // TEMP (2026-07-27): capture one real Close payload verbatim to locate
    // where the true event id lives (event.id is always empty — dedup table
    // has never had a row). Logging only, no logic change; remove after the
    // dedup key is fixed. Body is read as text so the raw bytes are logged;
    // JSON.parse below throws the same SyntaxError req.json() would.
    const rawBody = await req.text();
    console.log(
      `[WEBHOOK RAW CAPTURE] headers=${JSON.stringify(Object.fromEntries(req.headers))} body=${rawBody}`,
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const signatureKey = Deno.env.get("CLOSE_SIGNATURE_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse webhook payload
    const event = JSON.parse(rawBody);
    const eventId = event.id;
    const action = event.action;
    const objectType = event.object_type;

    console.log(`[WEBHOOK RECEIVED] id=${eventId} type=${objectType} action=${action}`);

    // Verify signature if configured
    const sigTimestamp = req.headers.get("close-sig-timestamp");
    const sigHash = req.headers.get("close-sig-hash");

    if (signatureKey && sigTimestamp && sigHash) {
      const payload = `${sigTimestamp}.${JSON.stringify(event)}`;
      const hmac = createHmac("sha256", signatureKey);
      hmac.update(payload);
      const computedHash = hmac.digest("hex");

      if (computedHash !== sigHash) {
        console.error("[WEBHOOK VERIFY FAIL] Invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("[WEBHOOK VERIFY SUCCESS] Signature validated");
    }

    // Check for duplicate events
    const { data: existing } = await supabase.from("close_events_dedup").select("id").eq("id", eventId).single();

    if (existing) {
      console.log(`[WEBHOOK SKIP] Duplicate event id=${eventId}`);
      return new Response(JSON.stringify({ ok: true, duplicate: true, id: eventId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record event to prevent duplicates
    await supabase.from("close_events_dedup").insert({ id: eventId });

    const today = new Date().toISOString().split("T")[0];

    // Handle different event types
    if (objectType === "activity.call" && action === "created") {
      // Extract email from event data
      const userEmail = event.data?.user_email || event.data?.user_name;

      if (!userEmail) {
        console.warn("[WEBHOOK WARN] No user email found in call event");
        return new Response(JSON.stringify({ ok: true, warning: "No user email", id: eventId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const duration = event.data?.duration || 0;

      // Find setter by email (exact or local-part match)
      const { data: setters } = await supabase.from("setters_profiles").select("user_id, email").eq("active", true);

      let setter = setters?.find((s) => normalizeEmail(s.email) === normalizeEmail(userEmail));
      if (!setter) {
        setter = setters?.find((s) => localPart(s.email) === localPart(userEmail));
      }

      if (!setter) {
        console.warn(`[WEBHOOK WARN] No setter found for email ${userEmail}`);
        return new Response(JSON.stringify({ ok: true, warning: "Setter not found", id: eventId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get current performance record
      const { data: perf } = await supabase
        .from("performance")
        .select("dials_made, talk_time")
        .eq("setter_id", setter.user_id)
        .eq("date", today)
        .single();

      const newDialsMade = (perf?.dials_made || 0) + 1;
      const newTalkTime = (perf?.talk_time || 0) + duration;

      // Upsert performance record
      await supabase.from("performance").upsert(
        {
          setter_id: setter.user_id,
          user_id: setter.user_id,
          email: setter.email,
          date: today,
          dials_made: newDialsMade,
          talk_time: newTalkTime,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "setter_id,date",
        },
      );

      console.log(
        `[WEBHOOK INGEST] call | email=${setter.email} | +1 dial | +${duration} sec | total_dials=${newDialsMade} total_time=${newTalkTime}`,
      );

      return new Response(JSON.stringify({ ok: true, received: "call", id: eventId, email: setter.email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (objectType === "lead" && action === "created") {
      // Extract email from event data
      const createdByEmail = event.data?.created_by_name || event.data?.owner_name;

      if (!createdByEmail) {
        console.warn("[WEBHOOK WARN] No creator email found in lead event");
        return new Response(JSON.stringify({ ok: true, warning: "No creator email", id: eventId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find setter by email (exact or local-part match)
      const { data: setters } = await supabase.from("setters_profiles").select("user_id, email").eq("active", true);

      let setter = setters?.find((s) => normalizeEmail(s.email) === normalizeEmail(createdByEmail));
      if (!setter) {
        setter = setters?.find((s) => localPart(s.email) === localPart(createdByEmail));
      }

      if (!setter) {
        console.warn(`[WEBHOOK WARN] No setter found for email ${createdByEmail}`);
        return new Response(JSON.stringify({ ok: true, warning: "Setter not found", id: eventId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get current performance record
      const { data: perf } = await supabase
        .from("performance")
        .select("warm_leads")
        .eq("setter_id", setter.user_id)
        .eq("date", today)
        .single();

      const newWarmLeads = (perf?.warm_leads || 0) + 1;

      // Upsert performance record
      await supabase.from("performance").upsert(
        {
          setter_id: setter.user_id,
          user_id: setter.user_id,
          email: setter.email,
          date: today,
          warm_leads: newWarmLeads,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "setter_id,date",
        },
      );

      console.log(`[WEBHOOK INGEST] lead | email=${setter.email} | +1 warm_lead | total_warm_leads=${newWarmLeads}`);

      return new Response(JSON.stringify({ ok: true, received: "lead", id: eventId, email: setter.email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unknown event type
    console.log(`[WEBHOOK SKIP] Unhandled event type=${objectType} action=${action}`);
    return new Response(JSON.stringify({ ok: true, unhandled: true, type: objectType, action, id: eventId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[WEBHOOK ERROR]", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
