import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Fail-closed dual-mode auth: this endpoint has two legitimate callers —
    // the n8n QA workflow (shared N8N_WEBHOOK_SECRET, same pattern as
    // setter-metrics) and the HR Call Scores admin page, which invokes it
    // with the logged-in user's Supabase JWT. Accept either the exact
    // secret or a valid JWT belonging to an authorized staff role (same
    // role-gate pattern as performance-review-compile). Everything else,
    // including any junk bearer value, is rejected — these rows feed
    // payroll bonuses and CEO tiles, so a bearer PREFIX check is not auth.
    const AUTHORIZED_ROLES = ['dev', 'admin', 'ops', 'hr', 'csm', 'sdr_manager'];
    const UNSCOPED_ROLES = ['dev', 'admin', 'ops', 'hr', 'csm'];
    const expected = Deno.env.get('N8N_WEBHOOK_SECRET');
    const auth = req.headers.get('authorization') || '';
    const provided = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!provided) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const isSecretCaller = !!expected && provided === expected;
    // sdr_manager without a broader staff role is scoped server-side to
    // fulfilment scores, mirroring the UI lock on SDRManagerAttendance and
    // the performance-review-compile scoping pattern.
    let forcedDepartment: string | null = null;
    if (!isSecretCaller) {
      const { data: userData } = await supabase.auth.getUser(provided);
      const userId = userData?.user?.id;
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      const userRoles = new Set((roles ?? []).map((r: { role: string }) => r.role));
      if (!AUTHORIZED_ROLES.some((r) => userRoles.has(r))) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!UNSCOPED_ROLES.some((r) => userRoles.has(r))) forcedDepartment = 'fulfilment';
    }

    const url = new URL(req.url);
    const date_from = url.searchParams.get('date_from');
    const date_to = url.searchParams.get('date_to');
    const department = url.searchParams.get('department');
    const setter_name = url.searchParams.get('setter_name');
    const performance_rating = url.searchParams.get('performance_rating');

    let q = supabase.from('call_scores').select('*').order('call_date', { ascending: false });
    if (date_from) q = q.gte('call_date', date_from);
    if (date_to) q = q.lte('call_date', date_to);
    if (forcedDepartment) q = q.eq('department', forcedDepartment);
    else if (department && department !== 'all') q = q.eq('department', department);
    if (setter_name && setter_name !== 'all') q = q.eq('setter_name', setter_name);
    if (performance_rating && performance_rating !== 'all') q = q.eq('performance_rating', performance_rating);

    const { data, error } = await q.limit(1000);
    if (error) throw error;

    // Test-account exclusion (2026-07-21): call_scores has no test flag of
    // its own, so drop rows belonging to test setters here — matching the
    // setters_profiles population-gate convention used by every aggregate.
    // setter_id is text and holds a close_user_id or auth uuid depending on
    // the n8n workflow version, so match every known identifier plus name.
    const { data: testSetters } = await supabase
      .from('setters_profiles')
      .select('id, user_id, close_user_id, full_name')
      .eq('is_test_account', true);
    const testIds = new Set(
      (testSetters ?? []).flatMap((s: { id: string; user_id: string | null; close_user_id: string | null }) =>
        [s.id, s.user_id, s.close_user_id].filter(Boolean).map(String),
      ),
    );
    const testNames = new Set(
      (testSetters ?? [])
        .map((s: { full_name: string | null }) => String(s.full_name ?? '').toLowerCase().trim())
        .filter(Boolean),
    );
    const rows = (data ?? []).filter(
      (r: { setter_id: string | null; setter_name: string | null }) =>
        !testIds.has(String(r.setter_id ?? '')) &&
        !testNames.has(String(r.setter_name ?? '').toLowerCase().trim()),
    );

    return new Response(JSON.stringify({ rows, fetched_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[call-scores-fetch] error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
