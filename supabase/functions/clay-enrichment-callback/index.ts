import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get("CLAY_CALLBACK_SECRET");
    const webhookSecret = req.headers.get("X-Webhook-Secret") || req.headers.get("x-webhook-secret");

    if (!secret || webhookSecret !== secret) {
      console.error("Invalid webhook secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawText = await req.text();
    if (!rawText || rawText.trim().length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No body received" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Record<string, any>;
    try {
      body = JSON.parse(rawText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const {
      request_id,
      mobile_phone,
      direct_phone,
      work_phone,
      email,
      source,
      status,
      full_name,
      company_name,
      company_domain,
      personal_linkedin,
    } = body;

    if (!request_id) {
      return new Response(JSON.stringify({ error: "Missing request_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the request exists
    const { data: existing, error: fetchError } = await serviceClient
      .from("enrichment_requests")
      .select("id")
      .eq("id", request_id)
      .maybeSingle();

    if (fetchError || !existing) {
      console.error("Request not found:", request_id, fetchError);
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Choose phone_best: first non-empty
    const phone_best = mobile_phone || direct_phone || work_phone || null;

    // Determine final status — if Clay called back successfully, mark as enriched
    // even if no phone/email was found (the enrichment completed, just no data available)
    let final_status: string;
    if (status === "error") {
      final_status = "error";
    } else {
      final_status = "enriched";
    }

    const updatePayload: Record<string, unknown> = {
      mobile_phone: mobile_phone || null,
      direct_phone: direct_phone || null,
      work_phone: work_phone || null,
      phone_best,
      email: email || null,
      source: source || null,
      status: final_status,
      raw_payload: body,
      error_message: status === "error" ? (body.error_message || "Unknown error from Clay") : null,
    };

    // Store enriched metadata if provided
    if (full_name) updatePayload.full_name = full_name;
    if (company_name) updatePayload.company_name = company_name;
    if (company_domain) updatePayload.company_domain = company_domain;
    if (personal_linkedin) updatePayload.linkedin_url = personal_linkedin;

    const { error: updateError } = await serviceClient
      .from("enrichment_requests")
      .update(updatePayload)
      .eq("id", request_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update request" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
