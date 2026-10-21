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

    console.log('[CSV IMPORT] Starting CSV import...');

    const formData = await req.formData();
    const csvFile = formData.get('file') as File;
    
    if (!csvFile) {
      throw new Error('No CSV file provided');
    }

    const csvText = await csvFile.text();
    const lines = csvText.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }

    // Parse header to find column indices
    // Expected: Setter Email, Dials Made, Talk Time (sec), Warm Leads Created
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const emailIdx = headers.findIndex(h => h.includes('email'));
    const callsIdx = headers.findIndex(h => h.includes('dial'));
    const talkTimeIdx = headers.findIndex(h => h.includes('talk'));
    const leadsIdx = headers.findIndex(h => h.includes('lead'));

    if (emailIdx === -1) {
      throw new Error('Could not find email column in CSV');
    }

    let updatedCount = 0;
    const today = new Date().toISOString().split('T')[0];

    // Process each data row
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      
      if (values.length < headers.length) {
        continue; // Skip incomplete rows
      }

      const email = values[emailIdx];
      
      if (!email || email === '') {
        continue;
      }

      // Get user_id from setters_profiles
      const { data: setter } = await supabase
        .from('setters_profiles')
        .select('user_id')
        .eq('email', email)
        .single();

      if (!setter) {
        console.warn(`[CSV IMPORT] Setter not found for email: ${email}`);
        continue;
      }

      const performanceData: any = {
        setter_id: setter.user_id,
        user_id: setter.user_id,
        email: email,
        date: today,
        updated_at: new Date().toISOString(),
      };

      if (callsIdx !== -1 && values[callsIdx]) {
        performanceData.dials_made = parseInt(values[callsIdx]) || 0;
      }
      if (talkTimeIdx !== -1 && values[talkTimeIdx]) {
        performanceData.talk_time = parseInt(values[talkTimeIdx]) || 0;
      }
      if (leadsIdx !== -1 && values[leadsIdx]) {
        performanceData.warm_leads = parseInt(values[leadsIdx]) || 0;
      }

      const { error } = await supabase
        .from('performance')
        .upsert(performanceData, {
          onConflict: 'setter_id,date'
        });

      if (error) {
        console.error(`[CSV IMPORT] Error updating ${email}:`, error);
      } else {
        updatedCount++;
      }
    }

    // Log activity
    await supabase.from('admin_activity_log').insert({
      action: 'csv_kpis_import',
      details: {
        total_rows: lines.length - 1,
        updated_rows: updatedCount,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[CSV IMPORT] rows=${lines.length - 1} updated=${updatedCount}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'CSV import completed (fallback source)',
        totalRows: lines.length - 1,
        updatedRows: updatedCount,
        source: 'csv_import'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CSV IMPORT] Error:', error);
    
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
