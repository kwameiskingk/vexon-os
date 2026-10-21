import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clayWebhookUrl = Deno.env.get("CLAY_WEBHOOK_URL");

    if (!clayWebhookUrl) {
      return new Response(JSON.stringify({ error: "CLAY_WEBHOOK_URL not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { full_name, personal_linkedin, company_name, company_domain, force } = body;

    // Validate required fields
    if (!full_name || !full_name.trim()) {
      return new Response(JSON.stringify({ error: "full_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!personal_linkedin || !personal_linkedin.includes("linkedin.com/")) {
      return new Response(JSON.stringify({ error: "Invalid LinkedIn URL. Must contain linkedin.com/" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!company_name || !company_name.trim()) {
      return new Response(JSON.stringify({ error: "company_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!company_domain || !company_domain.trim()) {
      return new Response(JSON.stringify({ error: "company_domain is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // 23 Sep 2026 (the owner): the 5-a-day cap is gone. Setters enrich as many
    // contacts as they need; the duplicate check below still stops repeats.

    // --- Duplicate check (by LinkedIn URL across ALL users) ---
    const linkedinTrimmed = personal_linkedin.trim().toLowerCase().replace(/\/+$/, "");
    const { data: existingEnrichment } = await serviceClient
      .from("enrichment_requests")
      .select("*")
      .eq("status", "enriched")
      .ilike("linkedin_url", linkedinTrimmed)
      .limit(1)
      .maybeSingle();

    if (existingEnrichment && !force) {
      return new Response(JSON.stringify({
        error: "duplicate_found",
        message: "This contact has already been enriched.",
        existing: existingEnrichment,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestId = crypto.randomUUID();

    // Insert enrichment request
    const { error: insertError } = await serviceClient
      .from("enrichment_requests")
      .insert({
        id: requestId,
        created_by_user_id: user.id,
        linkedin_url: personal_linkedin.trim(),
        full_name: full_name.trim(),
        company_name: company_name.trim(),
        company_domain: company_domain.trim(),
        status: "enriching",
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create enrichment request" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST to Clay webhook
    try {
      const clayResponse = await fetch(clayWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          setter_id: user.id,
          full_name: full_name.trim(),
          personal_linkedin: personal_linkedin.trim(),
          company_name: company_name.trim(),
          company_domain: company_domain.trim(),
        }),
      });

      if (!clayResponse.ok) {
        const errorText = await clayResponse.text();
        console.error("Clay webhook failed:", clayResponse.status, errorText);
        await serviceClient
          .from("enrichment_requests")
          .update({ status: "error", error_message: `Clay API error: ${clayResponse.status}` })
          .eq("id", requestId);
      }
    } catch (fetchErr) {
      console.error("Clay webhook fetch error:", fetchErr);
      await serviceClient
        .from("enrichment_requests")
        .update({ status: "error", error_message: `Network error: ${fetchErr.message}` })
        .eq("id", requestId);
    }

    return new Response(JSON.stringify({
      request_id: requestId,
    }), {
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
