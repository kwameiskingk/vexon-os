import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoicePayload {
  correlation_id: string;
  invoice_id: string;
  contact_name: string;
  contact_email: string;
  company_name: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  invoice_number: string;
  payment_method: string;
  notes: string;
  items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    account_code: string;
    tax_type: string;
  }>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the Zapier webhook URL from environment
    const zapierUrl = Deno.env.get('ZAPIER_XERO_WEBHOOK_URL');
    if (!zapierUrl) {
      throw new Error('ZAPIER_XERO_WEBHOOK_URL not configured');
    }

    // Parse the invoice payload
    const payload: InvoicePayload = await req.json();
    
    console.log('Processing invoice send request:', payload);

    // Build the full Zapier payload
    const zapierPayload = {
      correlation_id: payload.correlation_id,
      invoice_id: payload.invoice_id,
      contact_name: payload.contact_name,
      contact_email: payload.contact_email,
      company_name: payload.company_name,
      invoice_date: payload.invoice_date,
      due_date: payload.due_date,
      amount: payload.amount,
      invoice_number: payload.invoice_number,
      payment_method: payload.payment_method,
      notes: payload.notes,
      callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/xero-invoice-callback`,
      items: payload.items || [{
        description: `Services for ${payload.company_name}`,
        quantity: 1,
        unit_price: payload.amount,
        account_code: '200',
        tax_type: 'NONE'
      }]
    };

    console.log('Sending to Zapier webhook:', zapierUrl);

    // Send to Zapier webhook
    const response = await fetch(zapierUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(zapierPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Zapier webhook error:', errorText);
      throw new Error(`Zapier webhook failed: ${response.status}`);
    }

    const result = await response.json().catch(() => ({}));
    console.log('Zapier response:', result);

    return new Response(
      JSON.stringify({ success: true, result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing invoice:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
