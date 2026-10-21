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

    const body = await req.json();
    const required = ['call_id', 'setter_id', 'setter_name', 'department', 'call_date', 'weighted_total', 'performance_rating'];
    for (const k of required) {
      if (body[k] === undefined || body[k] === null) {
        return new Response(JSON.stringify({ error: `Missing field: ${k}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const row = {
      call_id: String(body.call_id),
      setter_id: String(body.setter_id),
      setter_name: String(body.setter_name),
      department: String(body.department),
      call_date: String(body.call_date),
      recording_url: body.recording_url ?? null,
      weighted_total: Number(body.weighted_total),
      performance_rating: String(body.performance_rating),
      mandatory_gates_passed: Boolean(body.mandatory_gates_passed ?? false),
      mandatory_gates: body.mandatory_gates ?? {},
      overall_reviewer_notes: body.overall_reviewer_notes ?? null,
      sections: body.sections ?? {},
    };

    const { data, error } = await supabase
      .from('call_scores')
      .upsert(row, { onConflict: 'call_id' })
      .select()
      .single();

    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[call-scores] error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
