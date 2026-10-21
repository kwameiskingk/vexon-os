import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper functions for email normalization
const normalizeEmail = (s: string): string => s?.trim().toLowerCase();
const localPart = (s: string): string => normalizeEmail(s).split('@')[0];

const CLOSE_SETTER_EMAILS = [
  'faizel@meridiansales.example',
  'javaun@meridiansales.example'
];

const BASE = 'https://api.close.com/api/v1';

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

    console.log('[DEBUG KPI SYNC] Starting KPI sync...');

    // Get all active setters from database
    const { data: setters, error: settersError } = await supabase
      .from('setters_profiles')
      .select('user_id, email, full_name')
      .eq('active', true);

    if (settersError) throw settersError;

    console.log(`[DEBUG KPI SYNC] Found ${setters?.length || 0} active setters in database`);

    const today = new Date().toISOString().split('T')[0];
    const cutoff = Date.now() - 72 * 60 * 60 * 1000; // Last 3 days
    let syncedCount = 0;
    const errors: string[] = [];
    const results: any[] = [];

    // Process each Close email
    for (const closeEmail of CLOSE_SETTER_EMAILS) {
      try {
        // Find matching setter: first try exact match, then local-part match
        let setter = setters?.find(s => normalizeEmail(s.email) === normalizeEmail(closeEmail));
        
        if (!setter) {
          // Try local-part match (domain-insensitive)
          setter = setters?.find(s => localPart(s.email) === localPart(closeEmail));
        }
        
        if (!setter) {
          console.warn(`[DEBUG KPI SYNC] No database setter match for Close email ${closeEmail}`);
          continue;
        }

        console.log(`[DEBUG KPI SYNC] Processing Close email ${closeEmail} → Setter ${setter.email}...`);

        // CALLS: Fetch call activities using Close email (with pagination)
        let allCalls: any[] = [];
        let callsPage = 1;
        let callsNextUrl: string | null = `${BASE}/activity/?_limit=100&type=call&direction=outbound&user_email=${encodeURIComponent(closeEmail)}`;
        
        while (callsNextUrl) {
          const callsResponse: Response = await fetch(callsNextUrl, {
            headers: {
              'Authorization': `Basic ${btoa(closeApiKey + ':')}`,
              'Content-Type': 'application/json',
            },
          });

          if (callsResponse.ok) {
            const callsData: any = await callsResponse.json();
            const pageData = callsData.data || [];
            allCalls.push(...pageData);
            console.log(`[DEBUG CLOSE FETCH] user=${closeEmail} type=calls page=${callsPage} count=${pageData.length}`);
            
            // Follow pagination using _next (not next or has_more)
            callsNextUrl = callsData._next ? `https://api.close.com${callsData._next}` : null;
            callsPage++;
          } else {
            const errorBody = await callsResponse.text();
            console.error(`[DEBUG CLOSE ERROR] user=${closeEmail} type=calls status=${callsResponse.status} url=${callsNextUrl} body=${errorBody.substring(0, 400)}`);
            break;
          }
        }

        console.log(`[DEBUG CLOSE FETCH] user=${closeEmail} type=calls status=200 total_count=${allCalls.length}`);
        
        // Filter locally to last 3 days
        const recentCalls = allCalls.filter((call: any) => {
          const callTime = new Date(call.date_created).getTime();
          return callTime >= cutoff;
        });
        
        const dials_made = recentCalls.length;
        const talk_time_total = recentCalls.reduce((sum: number, call: any) => sum + (call.duration || 0), 0);

        // LEADS: Fetch leads using all possible attribution fields
        const leadQueries = [
          `created_by.email:${closeEmail}`,
          `owner.email:${closeEmail}`,
          `updated_by.email:${closeEmail}`
        ];
        
        let allLeads: any[] = [];
        
        for (const query of leadQueries) {
          let leadsPage = 1;
          let leadsNextUrl: string | null = `${BASE}/lead/?_limit=100&query=${encodeURIComponent(query)}`;
          
          while (leadsNextUrl) {
            const leadsResponse: Response = await fetch(leadsNextUrl, {
              headers: {
                'Authorization': `Basic ${btoa(closeApiKey + ':')}`,
                'Content-Type': 'application/json',
              },
            });

            if (leadsResponse.ok) {
              const leadsData: any = await leadsResponse.json();
              const pageData = leadsData.data || [];
              allLeads.push(...pageData);
              console.log(`[DEBUG CLOSE FETCH] user=${closeEmail} type=leads query=${query} page=${leadsPage} count=${pageData.length}`);
              
              // Follow pagination using _next (not next or has_more)
              leadsNextUrl = leadsData._next ? `https://api.close.com${leadsData._next}` : null;
              leadsPage++;
            } else {
              const errorBody = await leadsResponse.text();
              console.error(`[DEBUG CLOSE ERROR] user=${closeEmail} type=leads query=${query} status=${leadsResponse.status} url=${leadsNextUrl} body=${errorBody.substring(0, 400)}`);
              break;
            }
          }
        }

        console.log(`[DEBUG CLOSE FETCH] user=${closeEmail} type=leads status=200 total_count=${allLeads.length}`);
        
        // Filter locally to last 3 days
        const recentLeads = allLeads.filter((lead: any) => {
          const createdAt = lead.date_created || lead.created_at;
          const leadTime = new Date(createdAt).getTime();
          return leadTime >= cutoff;
        });
        
        const warm_leads_created = recentLeads.length;

        // Get meetings_booked count from meetings table (logged directly in dashboard)
        const { count: meetings_booked } = await supabase
          .from('meetings')
          .select('*', { count: 'exact', head: true })
          .eq('setter_profile_id', setter.user_id)
          .gte('meeting_date', today)
          .lte('meeting_date', today);

        // Get sat_meetings count (showed up)
        const { count: sat_meetings } = await supabase
          .from('meetings')
          .select('*', { count: 'exact', head: true })
          .eq('setter_profile_id', setter.user_id)
          .eq('outcome', 'showed')
          .gte('meeting_date', today)
          .lte('meeting_date', today);

        // Log complete metrics before DB write
        console.log(`[VALIDATION] ${closeEmail} → ${setter.email} | Dials:${dials_made} | TalkTime:${talk_time_total}s | WarmLeads:${warm_leads_created}`);

        const show_rate = (meetings_booked && meetings_booked > 0) 
          ? ((sat_meetings || 0) / meetings_booked * 100).toFixed(1) 
          : '0.0';

        results.push({
          email: setter.email,
          dials_made,
          talk_time_total,
          warm_leads_created,
          meetings_booked: meetings_booked || 0,
          sat_meetings: sat_meetings || 0,
          show_rate
        });

        // Upsert to performance table (preserve meetings_booked and show_rate from in-app)
        const { error: upsertError } = await supabase
          .from('performance')
          .upsert({
            setter_id: setter.user_id,
            user_id: setter.user_id,
            email: setter.email,
            date: today,
            dials_made,
            talk_time: talk_time_total,
            warm_leads: warm_leads_created,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'setter_id,date'
          });

        if (upsertError) {
          console.error(`[ERROR] DB upsert failed for ${setter.email}:`, upsertError);
          errors.push(`${setter.email}: ${upsertError.message}`);
        } else {
          console.log(`[SUCCESS] DB updated for ${setter.email}`);
          syncedCount++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (error) {
        console.error(`[ERROR] Processing ${closeEmail}:`, error);
        errors.push(`${closeEmail}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Optionally upsert to performance_history if it exists
    for (const result of results) {
      try {
        await supabase
          .from('performance_history')
          .upsert({
            setter_id: setters?.find(s => normalizeEmail(s.email) === normalizeEmail(result.email))?.user_id,
            user_id: setters?.find(s => normalizeEmail(s.email) === normalizeEmail(result.email))?.user_id,
            email: result.email,
            date: today,
            dials_made: result.dials_made,
            talk_time: result.talk_time_total,
            warm_leads: result.warm_leads_created,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,date'
          });
      } catch (histError) {
        // Ignore if table doesn't exist or has different schema
        console.log('[DEBUG] performance_history upsert skipped or failed');
      }
    }

    // Calculate leaderboard ranks (primary: meetings_booked, tie-breaker: dials_made)
    results.sort((a, b) => {
      if (b.meetings_booked !== a.meetings_booked) {
        return b.meetings_booked - a.meetings_booked;
      }
      return b.dials_made - a.dials_made;
    });
    
    for (let i = 0; i < results.length; i++) {
      await supabase
        .from('performance')
        .update({ leaderboard_rank: i + 1 })
        .eq('email', results[i].email)
        .eq('date', today);
    }

    // Log activity
    await supabase.from('admin_activity_log').insert({
      action: 'close_kpis_sync',
      details: {
        synced_count: syncedCount,
        total_setters: setters?.length || 0,
        results,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString(),
      },
    });

    // Final validation summary
    console.log('\n========== SYNC SUMMARY ==========');
    results.forEach(r => {
      console.log(`Setter: ${r.email} | Dials: ${r.dials_made} | TalkTime(sec): ${r.talk_time_total} | WarmLeads: ${r.warm_leads_created}`);
    });
    console.log('==================================\n');

    const result = {
      success: true,
      message: 'KPIs successfully synced from Close API',
      synced_count: syncedCount,
      total_setters: setters?.length || 0,
      results,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    };

    console.log(`[SYNC SUCCESS] total_users=${CLOSE_SETTER_EMAILS.length} updated=${syncedCount} timestamp=${new Date().toISOString()}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[DEBUG CLOSE SYNC] Error:', error);
    
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
