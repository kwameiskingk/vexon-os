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
    const closeApiKey = Deno.env.get('CLOSE_API_KEY');

    if (!closeApiKey) {
      throw new Error('CLOSE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[MEETINGS CONSOLIDATION] Starting 21:00 SAST consolidation...');

    let totalImported = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    // Step 1: Re-run Close API fetch
    console.log('[MEETINGS CONSOLIDATION] Running Close API fetch...');
    try {
      const closeResponse = await fetch(`${supabaseUrl}/functions/v1/sync-close-meetings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (closeResponse.ok) {
        const closeResult = await closeResponse.json();
        totalImported += closeResult.imported || 0;
        totalUpdated += closeResult.updated || 0;
        totalErrors += closeResult.errors || 0;
        console.log('[MEETINGS CONSOLIDATION] Close API sync completed:', closeResult);
      } else {
        console.error('[MEETINGS CONSOLIDATION] Close API sync failed:', await closeResponse.text());
        totalErrors++;
      }
    } catch (error) {
      console.error('[MEETINGS CONSOLIDATION] Error calling Close API sync:', error);
      totalErrors++;
    }

    // Step 2: Merge duplicates by close_activity_id and prospect_email
    console.log('[MEETINGS CONSOLIDATION] Merging duplicates...');
    try {
      // Find duplicates based on prospect_email + meeting_date
      const { data: allMeetings } = await supabase
        .from('meetings')
        .select('*')
        .order('created_at', { ascending: true });

      if (allMeetings && allMeetings.length > 0) {
        const seen = new Map();
        const toDelete = [];

        for (const meeting of allMeetings) {
          const key = `${meeting.prospect_email}_${meeting.meeting_date}`;
          
          if (seen.has(key)) {
            const existing = seen.get(key);
            
            // Prefer Close API records over CSV/manual
            if (meeting.close_activity_id && !existing.close_activity_id) {
              // Update existing with Close data, then delete this one
              await supabase
                .from('meetings')
                .update({
                  close_activity_id: meeting.close_activity_id,
                  source: 'consolidated',
                  outcome: meeting.outcome,
                  call_duration: meeting.call_duration,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
              
              toDelete.push(meeting.id);
            } else {
              // Keep existing, delete this duplicate
              toDelete.push(meeting.id);
            }
          } else {
            seen.set(key, meeting);
          }
        }

        // Delete duplicates
        if (toDelete.length > 0) {
          await supabase
            .from('meetings')
            .delete()
            .in('id', toDelete);
          
          console.log(`[MEETINGS CONSOLIDATION] Removed ${toDelete.length} duplicates`);
        }

        // Mark all remaining as consolidated
        await supabase
          .from('meetings')
          .update({ source: 'consolidated' })
          .neq('source', 'consolidated');
      }
    } catch (error) {
      console.error('[MEETINGS CONSOLIDATION] Error merging duplicates:', error);
      totalErrors++;
    }

    // Step 3: Update performance metrics
    await updatePerformanceMetrics(supabase);

    // Step 4: Log consolidation activity
    await supabase.from('admin_activity_log').insert({
      action: 'meetings_consolidation',
      details: {
        total_imported: totalImported,
        total_updated: totalUpdated,
        total_errors: totalErrors,
        timestamp: new Date().toISOString(),
      },
    });

    const result = {
      success: true,
      message: 'Daily consolidation completed at 21:00 SAST',
      total_imported: totalImported,
      total_updated: totalUpdated,
      total_errors: totalErrors,
      timestamp: new Date().toISOString(),
    };

    console.log('[MEETINGS CONSOLIDATION] Completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[MEETINGS CONSOLIDATION] Error:', error);
    
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

async function updatePerformanceMetrics(supabase: any) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get meeting counts per setter for today
    const { data: meetingCounts } = await supabase
      .from('meetings')
      .select('setter_profile_id, outcome')
      .gte('meeting_date', today);

    if (!meetingCounts) return;

    // Demo/test setters' meetings must never be consolidated into the
    // performance table (the daily/weekly ops leaderboard reads it raw).
    const { data: testSetters } = await supabase
      .from('setters_profiles')
      .select('id')
      .eq('is_test_account', true);
    const testProfileIds = new Set((testSetters || []).map((s: { id: string }) => String(s.id)));

    // Aggregate by setter
    const setterStats = new Map();
    for (const meeting of meetingCounts) {
      const setterId = meeting.setter_profile_id;
      if (setterId && testProfileIds.has(String(setterId))) continue;
      if (!setterStats.has(setterId)) {
        setterStats.set(setterId, { booked: 0, showed: 0 });
      }
      const stats = setterStats.get(setterId);
      stats.booked++;
      if (meeting.outcome === 'showed') stats.showed++;
    }

    // Update performance table
    for (const [setterId, stats] of setterStats) {
      await supabase
        .from('performance')
        .upsert({
          setter_id: setterId,
          date: today,
          meetings_booked: stats.booked,
          sat_meetings: stats.showed,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'setter_id,date'
        });
    }

    console.log('[MEETINGS CONSOLIDATION] Performance metrics updated');
  } catch (error) {
    console.error('[MEETINGS CONSOLIDATION] Error updating performance:', error);
  }
}
