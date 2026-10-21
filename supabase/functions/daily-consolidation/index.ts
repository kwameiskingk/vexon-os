import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[DAILY CONSOLIDATION] Starting consolidation job...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    // Get all performance records for yesterday
    const { data: performanceRaw, error: fetchError } = await supabase
      .from('performance')
      .select('*')
      .eq('date', dateStr);

    if (fetchError) {
      throw fetchError;
    }

    // Demo/test setters' rows are never copied into performance_history.
    const { data: testSetters } = await supabase
      .from('setters_profiles')
      .select('email')
      .eq('is_test_account', true);
    const testEmails = new Set(
      (testSetters || []).map((s: { email: string | null }) => (s.email || '').toLowerCase()).filter(Boolean),
    );
    const performanceData = (performanceRaw || []).filter(
      (r: { email: string | null }) => !testEmails.has((r.email || '').toLowerCase()),
    );

    if (!performanceData || performanceData.length === 0) {
      console.log('[DAILY CONSOLIDATION] No data found for', dateStr);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No data to consolidate',
          date: dateStr,
          rows: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert into performance_history
    const historyRecords = performanceData.map(record => ({
      user_id: record.user_id,
      email: record.email,
      setter_id: record.setter_id,
      date: record.date,
      dials_made: record.dials_made,
      talk_time: record.talk_time,
      warm_leads: record.warm_leads,
      meetings_booked: record.meetings_booked,
      leaderboard_rank: record.leaderboard_rank,
      conversations: record.conversations,
      sat_meetings: record.sat_meetings,
      conversion_rate: record.conversion_rate,
      dials_target: record.dials_target,
      meetings_target: record.meetings_target,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('performance_history')
      .upsert(historyRecords, {
        onConflict: 'user_id,date'
      });

    if (insertError) {
      throw insertError;
    }

    console.log(`[DAILY CONSOLIDATION] completed ${dateStr} rows=${historyRecords.length}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Daily consolidation completed',
        date: dateStr,
        rows: historyRecords.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[DAILY CONSOLIDATION] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
