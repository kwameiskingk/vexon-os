import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// UTC bounds of "today" in Europe/London. The London civil date is resolved
// via Intl, then anchored with the current London UTC offset (GMT or BST).
// DST switches at 01:00 London time, so the offset at call time matches the
// offset at that day's midnight for any sane end-of-day schedule.
function londonTodayUtcBounds(now: Date): { dateStr: string; startIso: string; endIso: string } {
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now); // YYYY-MM-DD
  const offsetPart = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London', timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const offset = offsetPart === 'GMT' ? '+00:00' : offsetPart.replace('GMT', '');
  const start = new Date(`${dateStr}T00:00:00${offset}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dateStr, startIso: start.toISOString(), endIso: end.toISOString() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Fail-closed shared-secret auth (same N8N_WEBHOOK_SECRET pattern as
    // setter-metrics): these endpoints feed the acquisition qualification
    // scoring workflow and expose prospect PII, so a bearer PREFIX check
    // is not auth.
    const expected = Deno.env.get('N8N_WEBHOOK_SECRET');
    const auth = req.headers.get('authorization') || '';
    const provided = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!expected || !provided || provided !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { startIso, endIso } = londonTodayUtcBounds(new Date());

    // Acquisition meetings logged today (created_at, not meeting_date —
    // scoring reviews the setter's booking call, which happens the day the
    // meeting is logged). Rebooks are excluded from qualification scoring.
    const { data: meetings, error: meetingsError } = await supabase
      .from('meetings')
      .select('id, close_lead_link, prospect_email, company_name, logged_by_setter_id, setter_id, created_at')
      .eq('department', 'acquisition')
      .or('is_rebook.is.null,is_rebook.eq.false')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true });
    if (meetingsError) throw meetingsError;

    const all = meetings ?? [];
    const meetingIds = all.map((m: { id: string }) => m.id);

    // Skip meetings that already have a qualification score row.
    let scoredIds = new Set<string>();
    if (meetingIds.length > 0) {
      const { data: existing, error: existingError } = await supabase
        .from('acq_qual_scores')
        .select('meeting_id')
        .in('meeting_id', meetingIds);
      if (existingError) throw existingError;
      scoredIds = new Set((existing ?? []).map((r: { meeting_id: string }) => r.meeting_id));
    }

    // Setter attribution for scoring: COALESCE(logged_by_setter_id, setter_id)
    // (auth-user uuids). Names come from setters_profiles.full_name with a
    // profiles.full_name fallback; test-account setters are excluded per the
    // house population-gate convention.
    const setterUuids = Array.from(new Set(
      all
        .map((m: { logged_by_setter_id: string | null; setter_id: string | null }) =>
          m.logged_by_setter_id ?? m.setter_id)
        .filter(Boolean),
    )) as string[];

    const setterProfileByUserId = new Map<string, { full_name: string | null; is_test_account: boolean | null }>();
    const profileNameById = new Map<string, string | null>();
    if (setterUuids.length > 0) {
      const [{ data: setterProfiles, error: spError }, { data: profiles, error: pError }] = await Promise.all([
        supabase
          .from('setters_profiles')
          .select('user_id, full_name, is_test_account')
          .in('user_id', setterUuids),
        supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', setterUuids),
      ]);
      if (spError) throw spError;
      if (pError) throw pError;
      for (const sp of setterProfiles ?? []) {
        if (sp.user_id) setterProfileByUserId.set(String(sp.user_id), { full_name: sp.full_name, is_test_account: sp.is_test_account });
      }
      for (const p of profiles ?? []) {
        profileNameById.set(String(p.id), p.full_name);
      }
    }

    const result = all
      .filter((m: { id: string }) => !scoredIds.has(m.id))
      .filter((m: { logged_by_setter_id: string | null; setter_id: string | null }) => {
        const uuid = m.logged_by_setter_id ?? m.setter_id;
        if (!uuid) return true; // no resolvable setter — still surface the meeting
        return setterProfileByUserId.get(uuid)?.is_test_account !== true;
      })
      .map((m: {
        id: string; close_lead_link: string | null; prospect_email: string;
        company_name: string | null; logged_by_setter_id: string | null;
        setter_id: string | null; created_at: string;
      }) => {
        const setterUuid = m.logged_by_setter_id ?? m.setter_id ?? null;
        const setterName = setterUuid
          ? (setterProfileByUserId.get(setterUuid)?.full_name ?? profileNameById.get(setterUuid) ?? null)
          : null;
        return {
          meeting_id: m.id,
          // AUDITED GAP: meetings has no structured Close CRM lead id — only
          // close_lead_link (free-text URL typed by humans). lead_id is
          // always null here; n8n must match on prospect_email (the NOT NULL
          // deterministic key), with close_lead_link and company_name as
          // supporting signals.
          lead_id: null,
          close_lead_link: m.close_lead_link ?? null,
          prospect_email: m.prospect_email,
          company_name: m.company_name ?? null,
          setter_id: setterUuid,
          setter_name: setterName,
          meeting_created_at: m.created_at,
        };
      });

    return new Response(JSON.stringify({ meetings: result, fetched_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[acq-meetings-today] error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
