import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const asTrimmed = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

// call_date is a `date` column and is now half of an identity key, so it is
// normalised to YYYY-MM-DD before matching ('2026-07-15T00:00:00Z' → '2026-07-15').
// Returns '' if the value is absent or not date-shaped.
const asDateOnly = (v: unknown) => {
  const s = asTrimmed(v);
  if (!s) return '';
  const d = s.slice(0, 10);
  return DATE_RE.test(d) ? d : '';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Fail-closed shared-secret auth (same N8N_WEBHOOK_SECRET pattern as
    // setter-metrics): these endpoints gate the acquisition qualification
    // scoring workflow, so a bearer PREFIX check is not auth.
    const expected = Deno.env.get('N8N_WEBHOOK_SECRET');
    const auth = req.headers.get('authorization') || '';
    const provided = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!expected || !provided || provided !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    // meeting_id is nullable since the trigger moved off Vexon OS's meetings
    // table onto Close-native signals. Accept EITHER identity key:
    //   { meeting_id }            — Vexon OS-logged meeting (legacy path)
    //   { lead_id, call_date }    — Close-native booking with no meetings row
    const meetingId = asTrimmed(body.meeting_id);
    const leadId = asTrimmed(body.lead_id);
    const callDate = asDateOnly(body.call_date);

    if (!meetingId && !(leadId && callDate)) {
      return new Response(JSON.stringify({
        error: 'Provide either meeting_id, or both lead_id and call_date (YYYY-MM-DD)',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // meeting_id wins when present. The (lead_id, call_date) lookup is
    // deliberately NOT filtered to meeting_id IS NULL: once acq-meetings-today
    // backfills a meeting_id onto a row, that row must still count as existing
    // so the pipeline does not re-score the same booking into a duplicate.
    let query = supabase.from('acq_qual_scores').select('id');
    query = meetingId
      ? query.eq('meeting_id', meetingId)
      : query.eq('lead_id', leadId).eq('call_date', callDate);

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) throw error;

    return new Response(JSON.stringify({ exists: !!data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[acq-qual-check] error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
