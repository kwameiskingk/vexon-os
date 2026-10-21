import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES = ['scored', 'no_transcript', 'dq_health'];
const GATE_KEYS = ['gate_revenue', 'gate_tam', 'gate_urgency', 'gate_decision_maker', 'gate_educated'] as const;

const asTextOrNull = (v: unknown) => (v === undefined || v === null ? null : String(v));
const asTrimmed = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

// call_date is a `date` column and is now half of an identity key, so it is
// normalised to YYYY-MM-DD ('2026-07-15T00:00:00Z' → '2026-07-15').
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
    // setter-metrics): these endpoints write qualification scores that feed
    // SDR-manager coaching surfaces, so a bearer PREFIX check is not auth.
    const expected = Deno.env.get('N8N_WEBHOOK_SECRET');
    const auth = req.headers.get('authorization') || '';
    const provided = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!expected || !provided || provided !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    // ── Identity ─────────────────────────────────────────────────────────
    // meeting_id is nullable since the trigger moved off Vexon OS's meetings
    // table onto Close-native signals. A row is identified by meeting_id when
    // present, otherwise by (lead_id, call_date).
    const rawMeetingId = asTrimmed(body.meeting_id);
    const meetingId: string | null = rawMeetingId === '' ? null : rawMeetingId;
    if (meetingId !== null && !UUID_RE.test(meetingId)) {
      return new Response(JSON.stringify({ error: 'Invalid meeting_id: must be a uuid' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const leadId = asTrimmed(body.lead_id);
    const rawCallDate = asTrimmed(body.call_date);
    const callDate = asDateOnly(body.call_date);
    // A supplied call_date must be parseable — never silently store null for a
    // malformed date, it is an identity component.
    if (rawCallDate && !callDate) {
      return new Response(JSON.stringify({ error: 'Invalid call_date: expected YYYY-MM-DD' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Without a meeting_id the composite key is the only way to identify the
    // row, so both halves are mandatory.
    if (meetingId === null && !(leadId && callDate)) {
      return new Response(JSON.stringify({
        error: 'lead_id and call_date are required when meeting_id is absent',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const status = String(body.status ?? '');
    if (!VALID_STATUSES.includes(status)) {
      return new Response(JSON.stringify({ error: "Invalid status: must be 'scored', 'no_transcript' or 'dq_health'" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Explicit allowlist mapping — never spread the payload into the row.
    const row: Record<string, unknown> = {
      meeting_id: meetingId,
      call_id: asTextOrNull(body.call_id),
      lead_id: leadId === '' ? null : leadId,
      // setter_id is a profiles FK: accept only uuid-shaped values, else null.
      setter_id: UUID_RE.test(String(body.setter_id ?? '')) ? String(body.setter_id) : null,
      setter_name: asTextOrNull(body.setter_name),
      call_date: callDate === '' ? null : callDate,
      recording_url: asTextOrNull(body.recording_url),
      status,
      gate_revenue: null,
      gate_revenue_evidence: asTextOrNull(body.gate_revenue_evidence),
      gate_tam: null,
      gate_tam_evidence: asTextOrNull(body.gate_tam_evidence),
      gate_urgency: null,
      gate_urgency_evidence: asTextOrNull(body.gate_urgency_evidence),
      gate_decision_maker: null,
      gate_decision_maker_evidence: asTextOrNull(body.gate_decision_maker_evidence),
      gate_educated: null,
      gate_educated_evidence: asTextOrNull(body.gate_educated_evidence),
      gates_hit: null,
      health_flag: Boolean(body.health_flag ?? false),
      health_flag_reason: asTextOrNull(body.health_flag_reason),
      info_headcount: asTextOrNull(body.info_headcount),
      info_prior_leadgen: asTextOrNull(body.info_prior_leadgen),
      info_years_in_business: asTextOrNull(body.info_years_in_business),
      reviewer_notes: asTextOrNull(body.reviewer_notes),
    };

    if (status === 'scored') {
      // Coerce the five gates and RECOMPUTE gates_hit server-side — a
      // payload gates_hit is never trusted.
      let gatesHit = 0;
      for (const k of GATE_KEYS) {
        const hit = Boolean(body[k] ?? false);
        row[k] = hit;
        if (hit) gatesHit += 1;
      }
      row.gates_hit = gatesHit;
    } else if (status === 'dq_health') {
      // Policy disqualification (healthcare/NHS): not a gate failure and the
      // SDR is not penalised — no score, health flag forced on.
      row.gates_hit = null;
      row.health_flag = true;
    } else {
      // no_transcript: nothing to score.
      row.gates_hit = null;
    }

    // ── Write ────────────────────────────────────────────────────────────
    // Resolved by explicit lookup rather than .upsert(onConflict), because
    // BOTH uniqueness guarantees are now PARTIAL indexes (meeting_id WHERE NOT
    // NULL, and (lead_id, call_date) WHERE meeting_id IS NULL). Postgres only
    // infers a partial index as an ON CONFLICT arbiter when the statement
    // repeats the index predicate, and PostgREST/supabase-js cannot send one —
    // so an upsert would fail with 42P10 "no unique or exclusion constraint
    // matching the ON CONFLICT specification". The partial indexes still
    // enforce uniqueness underneath; a true concurrent double-insert surfaces
    // loudly as a 23505 rather than being silently merged.
    let lookup = supabase.from('acq_qual_scores').select('id');
    lookup = meetingId
      ? lookup.eq('meeting_id', meetingId)
      : lookup.eq('lead_id', leadId).eq('call_date', callDate);

    const { data: existing, error: lookupError } = await lookup.limit(1).maybeSingle();
    if (lookupError) throw lookupError;

    let data: unknown;
    let error: unknown;

    if (existing) {
      const patch: Record<string, unknown> = { ...row };
      // Never wipe a meeting_id that acq-meetings-today has already backfilled
      // onto this row just because this call arrived without one.
      if (meetingId === null) delete patch.meeting_id;
      ({ data, error } = await supabase
        .from('acq_qual_scores')
        .update(patch)
        .eq('id', (existing as { id: string }).id)
        .select()
        .single());
    } else {
      ({ data, error } = await supabase
        .from('acq_qual_scores')
        .insert(row)
        .select()
        .single());
    }

    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[acq-qual-scores] error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
