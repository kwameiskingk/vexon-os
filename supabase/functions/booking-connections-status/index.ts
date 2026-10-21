// Reports which booking-platform provider secrets are configured (presence
// only — never values). Called by the Dev Center Bookings module.
//
// Auth is enforced IN CODE (the create-user precedent): the deploy pipeline
// ships every function with platform JWT verification off, so the function
// requires a signed-in user itself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await anonClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const has = (name: string) => {
    const v = Deno.env.get(name);
    return typeof v === "string" && v.length > 0;
  };

  const body = {
    google: has("GOOGLE_SERVICE_ACCOUNT_JSON"),
    twilio:
      has("TWILIO_ACCOUNT_SID") &&
      has("TWILIO_AUTH_TOKEN") &&
      has("TWILIO_FROM_NUMBER"),
    resend: has("RESEND_API_KEY"),
  };

  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
