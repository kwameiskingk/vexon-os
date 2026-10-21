// acq-rescan-range — UI-initiated manual backfill of acquisition
// qualification scoring for a date range.
//
// WHY THIS IS A PROXY, NOT AN IMPLEMENTATION:
// The scoring pipeline (fetch Close status changes → pull the call transcript
// → run the AI gate rubric → acq-qual-check dedupe → acq-qual-scores write)
// lives in the n8n "ACQUISITION QA SCORING" workflow, which already holds the
// Close credentials, the transcript step and the gate prompt. Re-implementing
// that here would fork the rubric into a second source of truth — the exact
// failure the call-scoring rubric already suffered (three hand-copied mirrors
// of one rubric). So this function authenticates the caller, validates and
// caps the range, and hands off to n8n's webhook trigger.
//
// TIMEOUT SAFETY: the historical test run timed out at 60s pulling ~64 items.
// We wait a BOUNDED time for n8n; if it has not finished we return
// status:"started" (HTTP 202) so the UI degrades to "running in background"
// instead of surfacing a hard timeout. n8n keeps working either way.
//
// Unlike acq-qual-check / acq-qual-scores this endpoint is NOT an
// N8N_WEBHOOK_SECRET function — it is called from the browser by a signed-in
// admin/ops/sdr_manager, so it relies on verify_jwt (default true; there is
// deliberately NO verify_jwt=false entry for it in config.toml) plus the
// explicit role check below.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Mirrors MAX_RESCAN_DAYS in AcqQualificationView.tsx — keep in step. */
const MAX_RANGE_DAYS = 31;

/** How long we let n8n run before handing the UI a "started" answer. Kept
 *  under the platform request ceiling so we control the response, not the
 *  runtime. */
const N8N_WAIT_MS = 45_000;

const jsonResp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const dayDiffInclusive = (start: string, end: string) => {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.floor((b - a) / 86_400_000) + 1;
};

const asCount = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const auth = req.headers.get('authorization') || '';
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return jsonResp({ error: 'Missing bearer token' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const userRes = await supabase.auth.getUser(auth.replace(/^bearer\s+/i, ''));
    const userId = userRes.data.user?.id;
    if (!userId) return jsonResp({ error: 'Invalid token' }, 401);

    // Same tier that can read the qualification tab: admin/dev/ops in full,
    // plus sdr_manager (the acquisition manager is the intended operator).
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    const userRoles = new Set((roles || []).map((r: { role: string }) => r.role));
    const allowed = ['admin', 'dev', 'ops', 'sdr_manager'].some((r) => userRoles.has(r));
    if (!allowed) return jsonResp({ error: 'Forbidden' }, 403);

    let body: { start_date?: unknown; end_date?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResp({ error: 'Invalid JSON' }, 400);
    }

    const startDate = String(body.start_date ?? '').trim();
    const endDate = String(body.end_date ?? '').trim();
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
      return jsonResp({ error: 'start_date and end_date are required as YYYY-MM-DD' }, 400);
    }

    const days = dayDiffInclusive(startDate, endDate);
    if (Number.isNaN(days) || days < 1) {
      return jsonResp({ error: 'start_date must be on or before end_date' }, 400);
    }
    if (days > MAX_RANGE_DAYS) {
      return jsonResp({
        error: `Range is ${days} days; the manual rescan is capped at ${MAX_RANGE_DAYS}. Run it in chunks.`,
      }, 400);
    }

    const webhookUrl = Deno.env.get('N8N_ACQ_RESCAN_WEBHOOK_URL');
    const sharedSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
    if (!webhookUrl) {
      // Fail loudly and legibly rather than pretending a rescan ran.
      return jsonResp({
        error: 'N8N_ACQ_RESCAN_WEBHOOK_URL is not set in Supabase Edge Function secrets, so there is no workflow to hand the rescan to.',
        detail: 'Copy the Production URL from the "Manual Rescan Webhook" node in the ACQUISITION QA SCORING workflow and add it as that secret, then republish.',
      }, 503);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), N8N_WAIT_MS);

    let n8nRes: Response;
    try {
      n8nRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sharedSecret ? { Authorization: `Bearer ${sharedSecret}` } : {}),
        },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate,
          source: 'vexon-manual-rescan',
          requested_by: userId,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      // AbortError = n8n is still working; anything else is a real failure.
      if (e instanceof Error && e.name === 'AbortError') {
        return jsonResp({
          ok: true,
          status: 'started',
          message: 'Rescan handed to n8n; it is still running.',
          start_date: startDate,
          end_date: endDate,
        }, 202);
      }
      console.error('[acq-rescan-range] n8n call failed', e);
      return jsonResp({ error: `Could not reach the scoring workflow: ${e instanceof Error ? e.message : 'unknown'}` }, 502);
    } finally {
      clearTimeout(timer);
    }

    if (!n8nRes.ok) {
      const text = await n8nRes.text().catch(() => '');
      console.error('[acq-rescan-range] n8n returned', n8nRes.status, text.slice(0, 500));

      // n8n only registers a PRODUCTION webhook while the workflow is active,
      // and a /webhook-test/ URL only answers while someone is watching the
      // canvas. Both surface as 404 "not registered" — by far the most common
      // cause, so say so instead of echoing a bare status code.
      if (n8nRes.status === 404) {
        const isTestUrl = webhookUrl.includes('/webhook-test/');
        return jsonResp({
          error: isTestUrl
            ? 'The configured n8n URL is a TEST webhook (/webhook-test/), which only answers while the workflow canvas is open in "Listen for test event" mode.'
            : 'The n8n rescan webhook is not registered — the ACQUISITION QA SCORING workflow must be Published/active for its production webhook to accept calls.',
          detail: isTestUrl
            ? 'Set N8N_ACQ_RESCAN_WEBHOOK_URL to the Production URL (/webhook/...) and publish the workflow.'
            : text.slice(0, 300) || undefined,
        }, 502);
      }

      // A workflow that ran but never reached its "Respond to Webhook" node
      // answers 500. That is the normal outcome when every booking in the
      // range was already scored, so nothing reached the responder — the
      // rescan did NOT fail, it simply had nothing to do.
      if (n8nRes.status === 500 && /respond to webhook|no data|was not executed/i.test(text)) {
        return jsonResp({
          ok: true,
          status: 'started',
          message: 'Rescan ran, but n8n returned no summary — usually every booking in this range was already scored.',
          start_date: startDate,
          end_date: endDate,
        }, 202);
      }

      return jsonResp({
        error: `Scoring workflow returned ${n8nRes.status}`,
        detail: text.slice(0, 500) || undefined,
      }, 502);
    }

    // n8n's response shape is owned by the workflow. Read counts defensively:
    // if it responds immediately (ack-only) we report "started" rather than
    // inventing zeros, which would read as "nothing to score".
    let payload: Record<string, unknown> = {};
    try {
      payload = await n8nRes.json();
    } catch {
      payload = {};
    }

    const found = asCount(payload.found);
    const scored = asCount(payload.scored);
    const skipped = asCount(payload.skipped);

    if (found == null && scored == null && skipped == null) {
      return jsonResp({
        ok: true,
        status: 'started',
        message: 'Rescan accepted by n8n; it did not report counts.',
        start_date: startDate,
        end_date: endDate,
      }, 202);
    }

    return jsonResp({
      ok: true,
      status: 'completed',
      found: found ?? 0,
      scored: scored ?? 0,
      skipped: skipped ?? 0,
      start_date: startDate,
      end_date: endDate,
    });
  } catch (e) {
    console.error('[acq-rescan-range] error', e);
    return jsonResp({ error: e instanceof Error ? e.message : 'Unknown' }, 500);
  }
});
