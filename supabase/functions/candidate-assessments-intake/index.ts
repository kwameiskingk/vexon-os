import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
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
    // Fail-closed shared-secret auth (audit 2026-07-06: this was the one
    // service-role webhook with no internal auth). Dedicated secret rather
    // than N8N_WEBHOOK_SECRET — different caller, independent rotation.
    // Jotform can't set custom headers, so the secret is also accepted as
    // a ?secret= query param on the webhook URL.
    const expected = Deno.env.get('CANDIDATE_INTAKE_SECRET')
    const auth = req.headers.get('authorization') || ''
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
    const headerSecret = req.headers.get('x-webhook-secret') || ''
    const querySecret = new URL(req.url).searchParams.get('secret') || ''
    const provided = bearer || headerSecret || querySecret
    if (!expected || !provided || provided !== expected) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    console.log('Received candidate assessment intake:', JSON.stringify(body))

    const {
      external_submission_id,
      full_name,
      email,
      phone,
      role_applied,
      submitted_at_raw,
      assessment_pretty_text,
      assessment_payload,
      source = 'jotform',
      status = 'new'
    } = body

    if (!external_submission_id) {
      return new Response(
        JSON.stringify({ error: 'external_submission_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upsert based on external_submission_id
    const { data, error } = await supabase
      .from('candidate_assessments')
      .upsert(
        {
          external_submission_id,
          full_name,
          email,
          phone,
          role_applied,
          submitted_at_raw,
          assessment_pretty_text,
          assessment_payload: typeof assessment_payload === 'string' 
            ? JSON.parse(assessment_payload) 
            : assessment_payload,
          source,
          status,
          updated_at: new Date().toISOString()
        },
        { 
          onConflict: 'external_submission_id',
          ignoreDuplicates: false 
        }
      )
      .select()
      .single()

    if (error) {
      console.error('Error upserting candidate assessment:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Successfully upserted candidate assessment:', data.id)

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
