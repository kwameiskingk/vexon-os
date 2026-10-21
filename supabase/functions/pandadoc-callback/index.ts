import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

interface CallbackPayload {
  queue_id: string;
  correlation_id: string;
  pandadoc_document_id: string;
  status: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret
    const webhookSecret = req.headers.get("x-webhook-secret");
    const expectedSecret = Deno.env.get("PANDADOC_CALLBACK_SECRET");

    if (!expectedSecret || webhookSecret !== expectedSecret) {
      console.error("Unauthorized - invalid webhook secret");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - invalid secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse callback payload
    const body: CallbackPayload = await req.json();
    console.log("Received PandaDoc callback:", body);

    // Validate required fields
    if (!body.queue_id || !body.correlation_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing queue_id or correlation_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find and update the queue record
    const { data: existingRecord, error: fetchError } = await supabase
      .from("agreement_send_queue")
      .select("*")
      .eq("id", body.queue_id)
      .eq("correlation_id", body.correlation_id)
      .single();

    if (fetchError || !existingRecord) {
      console.error("Queue record not found:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: "Queue record not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the queue record
    const { error: updateError } = await supabase
      .from("agreement_send_queue")
      .update({
        status: body.status === "sent" ? "sent" : body.status,
        pandadoc_document_id: body.pandadoc_document_id || null,
        sent_at: body.status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", body.queue_id);

    if (updateError) {
      console.error("Failed to update queue record:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update queue record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Successfully updated queue record:", body.queue_id);

    return new Response(
      JSON.stringify({ success: true, message: "Callback processed" }),
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
