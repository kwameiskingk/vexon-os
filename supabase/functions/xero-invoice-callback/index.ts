import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-webhook-secret, authorization, x-client-info, apikey, content-type, accept, accept-encoding, accept-language, user-agent, x-request-id',
};

interface CallbackPayload {
  correlation_id: string;
  invoice_id: string;
  xero_invoice_id: string;
  xero_invoice_number: string;
  xero_invoice_url: string;
  status: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Debug: Confirm secret is loaded (only logs true/false)
  const expectedSecret = Deno.env.get('XERO_WEBHOOK_SECRET');
  console.log("XERO_WEBHOOK_SECRET loaded:", !!expectedSecret);

  // Verify custom webhook secret header
  const webhookSecret = req.headers.get('x-webhook-secret');
  
  if (!webhookSecret || webhookSecret !== expectedSecret) {
    console.error('Missing or invalid x-webhook-secret header');
    return new Response(
      JSON.stringify({ 
        error: 'Unauthorized - invalid secret' 
      }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse the callback payload
    const payload: CallbackPayload = await req.json();
    
    console.log('Received Xero callback:', payload);

    // Validate required fields
    if (!payload.correlation_id || !payload.invoice_id || !payload.xero_invoice_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the invoice by correlation_id
    const { data: invoice, error: findError } = await supabase
      .from('accounting_records')
      .select('*')
      .eq('correlation_id', payload.correlation_id)
      .single();

    if (findError || !invoice) {
      console.error('Invoice not found:', findError);
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize status to lowercase for consistency
    const normalizedStatus = payload.status.toLowerCase();
    
    // Map Xero status to invoice_external_status
    // IMPORTANT: This ONLY updates invoice_external_status, NEVER payment status
    const invoiceExternalStatus = normalizedStatus === 'sent' ? 'sent' 
      : normalizedStatus === 'failed' ? 'failed' 
      : 'pending';

    // Update the invoice record - ONLY invoice lifecycle fields
    const { error: updateError } = await supabase
      .from('accounting_records')
      .update({
        invoice_external_status: invoiceExternalStatus,
        external_invoice_id: payload.xero_invoice_id,
        external_invoice_number: payload.xero_invoice_number,
        external_invoice_url: payload.xero_invoice_url,
        external_status: normalizedStatus.toUpperCase(), // Keep for backward compatibility
        sent_at: new Date().toISOString()
        // NOTE: We do NOT update 'status' here - payment lifecycle is separate from invoice lifecycle
      })
      .eq('id', invoice.id);

    if (updateError) {
      console.error('Failed to update invoice:', updateError);
      throw updateError;
    }

    // Insert audit log entry
    const { error: auditError } = await supabase
      .from('invoice_audit_log')
      .insert({
        accounting_record_id: invoice.id,
        performed_by: invoice.created_by || '',
        action: 'xero_sent',
        details: payload
      });

    if (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    console.log('Invoice updated successfully:', invoice.id, 'invoice_external_status:', invoiceExternalStatus);

    return new Response(
      JSON.stringify({ success: true, invoice_external_status: invoiceExternalStatus }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing callback:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
