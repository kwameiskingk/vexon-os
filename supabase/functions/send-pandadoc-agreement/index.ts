import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgreementPayload {
  client_name: string;
  client_email: string;
  company_name: string;
  contract_value: number;
  agreement_date: string;
  discovery_log_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const zapierWebhookUrl = Deno.env.get("ZAPIER_PANDADOC_URL");

    if (!zapierWebhookUrl) {
      console.error("ZAPIER_PANDADOC_URL not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Webhook URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body: AgreementPayload = await req.json();
    console.log("Received agreement request:", body);

    // Validate required fields
    const requiredFields = ["client_name", "client_email", "company_name", "contract_value", "agreement_date", "discovery_log_id"];
    for (const field of requiredFields) {
      if (!body[field as keyof AgreementPayload]) {
        return new Response(
          JSON.stringify({ success: false, error: `Missing required field: ${field}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Generate correlation ID
    const correlationId = crypto.randomUUID();
    console.log("Generated correlation_id:", correlationId);

    // Insert into agreement_send_queue
    const { data: queueRecord, error: insertError } = await supabase
      .from("agreement_send_queue")
      .insert({
        discovery_log_id: body.discovery_log_id,
        client_first_name: body.client_name.split(" ")[0] || body.client_name,
        client_last_name: body.client_name.split(" ").slice(1).join(" ") || "",
        client_email: body.client_email,
        company_name: body.company_name,
        contract_value: body.contract_value,
        correlation_id: correlationId,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting queue record:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create queue record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Queue record created:", queueRecord.id);

    // Build the flat payload for Zapier
    const zapierPayload = {
      correlation_id: correlationId,
      queue_id: queueRecord.id,
      client_name: body.client_name,
      client_email: body.client_email,
      company_name: body.company_name,
      contract_value: body.contract_value,
      agreement_date: body.agreement_date,
      discovery_log_id: body.discovery_log_id,
    };

    console.log("Sending to Zapier:", zapierPayload);

    // Update status to 'sending'
    await supabase
      .from("agreement_send_queue")
      .update({ status: "sending" })
      .eq("id", queueRecord.id);

    // Send to Zapier webhook
    const callbackSecret = Deno.env.get("PANDADOC_CALLBACK_SECRET");
    const zapierResponse = await fetch(zapierWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(callbackSecret && { "x-webhook-secret": callbackSecret }),
      },
      body: JSON.stringify(zapierPayload),
    });

    if (!zapierResponse.ok) {
      const errorText = await zapierResponse.text();
      console.error("Zapier webhook failed:", errorText);
      
      // Update status to 'failed'
      await supabase
        .from("agreement_send_queue")
        .update({ 
          status: "failed",
          error_message: `Zapier error: ${zapierResponse.status} - ${errorText}`
        })
        .eq("id", queueRecord.id);

      return new Response(
        JSON.stringify({ success: false, error: "Failed to send to Zapier" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Successfully sent to Zapier");

    // Update discovery log to mark contract as being processed
    await supabase
      .from("sales_discovery_logs")
      .update({ sent_contract_at: new Date().toISOString() })
      .eq("id", body.discovery_log_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        queue_id: queueRecord.id,
        correlation_id: correlationId,
        status: "sending"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
