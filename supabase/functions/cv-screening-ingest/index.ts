import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CV screening agent -> cv_screenings dual-write endpoint.
// Caller is run_parallel.py on the owner's iMac (not the app), so auth is a
// dedicated fail-closed shared secret (CV_SCREENING_INGEST_SECRET) — same
// pattern as candidate-assessments-intake, independent rotation.
//
// Upsert key is source_file_slug, computed by the CALLER with
// run_parallel.py's slugify(). This function never derives the slug from
// source_file: a second slugify implementation here could drift from the
// Python one, which is the duplicate-row bug class the key exists to kill.
//
// Human-owned columns (review_status, ops_notes, is_archived) are silently
// dropped from every payload — this endpoint can only touch agent columns.
//
// Failure semantics (documented in the dual-write design, PR #TBD):
// upserts here are idempotent by construction, so the orchestrator may
// retry a failed/partial batch as many times as it likes without creating
// duplicates. Per-candidate errors are returned in the response and never
// reject the rest of the batch.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKETS = ['SHORTLIST', 'MAYBE', 'REJECT', 'REVIEW_MANUALLY']
const REJECT_REASONS = ['tenure_under_10_months', 'b2c_only', 'no_sales_experience', 'stale', 'long_gap']
const GATES = ['pass', 'fail', 'near_miss', 'unknown']
const IDENTITY = ['match', 'partial_mismatch', 'mismatch', 'no_linkedin']
const B2B = ['b2b', 'b2c', 'unclear']
const MAX_BATCH = 500

const textOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

const intOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) ? v : null

const boolOrNull = (v: unknown): boolean | null =>
  typeof v === 'boolean' ? v : null

const stringArray = (v: unknown, field: string, errors: string[]): string[] => {
  if (v === null || v === undefined) return []
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    errors.push(`${field} must be an array of strings`)
    return []
  }
  return v
}

const objectOrNull = (v: unknown, field: string, errors: string[]): Record<string, unknown> | null => {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object' || Array.isArray(v)) {
    errors.push(`${field} must be an object`)
    return null
  }
  return v as Record<string, unknown>
}

const enumOrNull = (v: unknown, allowed: string[], field: string, errors: string[]): string | null => {
  const s = textOrNull(v)
  if (s === null) return null
  if (!allowed.includes(s)) {
    errors.push(`${field} must be one of ${allowed.join('/')}, got '${s}'`)
    return null
  }
  return s
}

// deno-lint-ignore no-explicit-any
function buildRow(c: any, defaults: { run_id: string | null; skill_version: string | null; screened_on: string | null }) {
  const errors: string[] = []

  // Shape check only, mirroring what run_parallel.py's slugify() actually
  // emits: lowercased, no whitespace, single hyphens, trimmed. It keeps
  // unicode letters ("resumè") — an earlier ASCII-only regex here rejected
  // real production slugs (2026-08-07). Do not re-tighten to ASCII: the
  // Python slugify is the single source of slug truth, this guard exists
  // to catch stubs and garbage, not to enforce a charset.
  const slug = textOrNull(c.source_file_slug)
  if (!slug) errors.push('source_file_slug is required (compute it with run_parallel.py slugify)')
  else if (
    slug !== slug.toLowerCase() ||
    /\s/.test(slug) ||
    slug.includes('--') ||
    slug.startsWith('-') ||
    slug.endsWith('-')
  ) errors.push(`source_file_slug '${slug}' is not a valid slug`)

  const fullName = textOrNull(c.full_name)
  if (!fullName) errors.push('full_name is required')

  const sourceFile = textOrNull(c.source_file)
  if (!sourceFile) errors.push('source_file is required')

  const screenedOn = textOrNull(c.screened_on) ?? defaults.screened_on
  if (!screenedOn || !/^\d{4}-\d{2}-\d{2}$/.test(screenedOn)) {
    errors.push('screened_on must be YYYY-MM-DD (per record or batch-level)')
  }

  const bucket = textOrNull(c.bucket)
  if (!bucket || !BUCKETS.includes(bucket)) {
    errors.push(`bucket must be one of ${BUCKETS.join('/')}, got '${bucket}'`)
  }

  const rejectReason = enumOrNull(c.reject_reason, REJECT_REASONS, 'reject_reason', errors)
  if (bucket === 'REJECT' && rejectReason === null) errors.push('REJECT requires a reject_reason')
  if (bucket !== 'REJECT' && rejectReason !== null) errors.push(`bucket ${bucket} must not carry a reject_reason`)

  // Agent-owned columns only. review_status / ops_notes / is_archived are
  // deliberately absent — anything the payload sends for them is dropped.
  const row = {
    source_file: sourceFile,
    source_file_slug: slug,
    agent_candidate_id: textOrNull(c.agent_candidate_id) ?? textOrNull(c.candidate_id),
    screened_on: screenedOn,
    run_id: textOrNull(c.run_id) ?? defaults.run_id,
    skill_version: textOrNull(c.skill_version) ?? defaults.skill_version,
    ingested_via: 'agent',
    // Which job-board Drive folder the CV was picked up from (1 Sep) —
    // linkedin / indeed / typeform. Lowercased free text; the run pipeline
    // derives it from the folder path, never the AI.
    source: textOrNull(c.source)?.toLowerCase() ?? null,
    full_name: fullName,
    phone: textOrNull(c.phone),
    email: textOrNull(c.email),
    linkedin_url: textOrNull(c.linkedin_url),
    location: textOrNull(c.location),
    bucket,
    score: intOrNull(c.score),
    reject_reason: rejectReason,
    current_title: textOrNull(c.current_title),
    current_company: textOrNull(c.current_company),
    currently_employed: boolOrNull(c.currently_employed),
    qualifying_months: intOrNull(c.qualifying_months),
    months_since_last_qualifying: intOrNull(c.months_since_last_qualifying),
    gate_tenure: enumOrNull(c.gate_tenure, GATES, 'gate_tenure', errors),
    gate_recency: enumOrNull(c.gate_recency, GATES, 'gate_recency', errors),
    pros: stringArray(c.pros, 'pros', errors),
    cons: stringArray(c.cons, 'cons', errors),
    gaps_to_probe: stringArray(c.gaps_to_probe, 'gaps_to_probe', errors),
    evidence: stringArray(c.evidence, 'evidence', errors),
    flags: stringArray(c.flags, 'flags', errors),
    date_issues: stringArray(c.date_issues, 'date_issues', errors),
    reasoning: textOrNull(c.reasoning),
    signals: objectOrNull(c.signals, 'signals', errors),
    market_exposure: objectOrNull(c.market_exposure, 'market_exposure', errors),
    daily_output: textOrNull(c.daily_output),
    b2b_or_b2c: enumOrNull(c.b2b_or_b2c, B2B, 'b2b_or_b2c', errors),
    matric_year_raw: textOrNull(c.matric_year_raw),
    languages_raw: textOrNull(c.languages_raw),
    notice_period_raw: textOrNull(c.notice_period_raw),
    salary_expectation_raw: textOrNull(c.salary_expectation_raw),
    identity_check: enumOrNull(c.identity_check, IDENTITY, 'identity_check', errors),
  }
  // A payload without a source must not null out a stored one on re-delivery
  // (older ledger entries predate source labelling) — omit rather than null.
  if (row.source === null) delete (row as Record<string, unknown>).source
  return { row, errors, slug: slug ?? textOrNull(c.candidate_id) ?? '(no slug)' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const expected = Deno.env.get('CV_SCREENING_INGEST_SECRET')
    const auth = req.headers.get('authorization') || ''
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
    if (!expected || !bearer || bearer !== expected) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()

    // Accept: one candidate object, a bare array, or a results.json-style
    // envelope { run_id, skill_version, candidates: [...] }.
    let candidates: unknown[]
    const defaults = {
      run_id: textOrNull(body?.run_id),
      skill_version: textOrNull(body?.skill_version),
      screened_on: textOrNull(body?.screened_on),
    }
    if (Array.isArray(body)) candidates = body
    else if (Array.isArray(body?.candidates)) candidates = body.candidates
    else if (body && typeof body === 'object') candidates = [body]
    else {
      return new Response(
        JSON.stringify({ error: 'Body must be a candidate object, an array, or { candidates: [...] }' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (candidates.length === 0 || candidates.length > MAX_BATCH) {
      return new Response(
        JSON.stringify({ error: `Batch must contain 1-${MAX_BATCH} candidates, got ${candidates.length}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const results: Array<Record<string, unknown>> = []
    let inserted = 0, updated = 0, failed = 0

    for (const c of candidates) {
      const { row, errors, slug } = buildRow(c, defaults)
      if (errors.length > 0) {
        failed++
        results.push({ slug, status: 'error', errors })
        continue
      }

      // Two-step upsert so the response can say inserted vs updated, and so
      // last_screened_at is only stamped on genuine re-screens.
      const { data: existing, error: selErr } = await supabase
        .from('cv_screenings')
        .select('id')
        .eq('source_file_slug', row.source_file_slug!)
        .maybeSingle()

      if (selErr) {
        failed++
        results.push({ slug, status: 'error', errors: [selErr.message] })
        continue
      }

      if (existing) {
        const { error: updErr } = await supabase
          .from('cv_screenings')
          .update({ ...row, last_screened_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (updErr) {
          failed++
          results.push({ slug, status: 'error', errors: [updErr.message] })
        } else {
          updated++
          results.push({ slug, status: 'updated', id: existing.id })
        }
      } else {
        const { data: ins, error: insErr } = await supabase
          .from('cv_screenings')
          .insert(row)
          .select('id')
          .single()
        if (insErr) {
          failed++
          results.push({ slug, status: 'error', errors: [insErr.message] })
        } else {
          inserted++
          results.push({ slug, status: 'inserted', id: ins.id })
        }
      }
    }

    if (failed > 0) {
      console.error(`cv-screening-ingest: ${failed}/${candidates.length} candidates failed`,
        JSON.stringify(results.filter((r) => r.status === 'error')))
    }
    console.log(`cv-screening-ingest: processed=${candidates.length} inserted=${inserted} updated=${updated} failed=${failed}`)

    return new Response(
      JSON.stringify({ processed: candidates.length, inserted, updated, failed, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('cv-screening-ingest unexpected error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
