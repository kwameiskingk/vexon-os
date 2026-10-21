import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Fail-closed shared-secret auth (same N8N_WEBHOOK_SECRET pattern as
    // setter-metrics): these endpoints write/read QA scores that feed
    // payroll bonuses and CEO tiles, so a bearer PREFIX check is not auth.
    const expected = Deno.env.get('N8N_WEBHOOK_SECRET');
    const auth = req.headers.get('authorization') || '';
    const provided = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!expected || !provided || provided !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { call_id } = await req.json();
    if (!call_id) {
      return new Response(JSON.stringify({ error: 'Missing call_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase
      .from('call_scores')
      .select('id')
      .eq('call_id', String(call_id))
      .maybeSingle();

    if (error) throw error;

    return new Response(JSON.stringify({ exists: !!data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[call-scores-check] error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
