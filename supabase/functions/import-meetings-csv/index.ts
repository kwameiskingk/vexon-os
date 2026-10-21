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

    console.log('[CSV MEETINGS IMPORT] Starting import...');

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      throw new Error('No file uploaded');
    }

    const csvText = await file.text();
    const lines = csvText.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    // Parse headers
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Expected: Prospect Name, Prospect Email, Company, Meeting Date, Meeting Time, Setter Email, Outcome
    const nameIdx = headers.findIndex(h => h.includes('prospect') && h.includes('name'));
    const emailIdx = headers.findIndex(h => h.includes('prospect') && h.includes('email'));
    const companyIdx = headers.findIndex(h => h.includes('company'));
    const dateIdx = headers.findIndex(h => h.includes('date'));
    const timeIdx = headers.findIndex(h => h.includes('time'));
    const setterIdx = headers.findIndex(h => h.includes('setter') && h.includes('email'));
    const outcomeIdx = headers.findIndex(h => h.includes('outcome') || h.includes('status'));

    if (nameIdx === -1 || emailIdx === -1 || dateIdx === -1) {
      throw new Error('CSV missing required columns: Prospect Name, Prospect Email, Meeting Date');
    }

    // Get all setters for email lookup
    const { data: setters } = await supabase
      .from('setters_profiles')
      .select('id, email');
    
    const setterMap = new Map(setters?.map(s => [s.email.toLowerCase(), s.id]) || []);

    // Get all client profiles for lookup
    const { data: clients } = await supabase
      .from('client_profiles')
      .select('id, company_name');
    
    const clientMap = new Map(clients?.map(c => [c.company_name?.toLowerCase(), c.id]) || []);

    let imported = 0;
    let updated = 0;
    let errors = 0;

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(cell => cell.trim());
      
      if (row.length < headers.length) {
        console.warn(`[CSV MEETINGS IMPORT] Skipping malformed row ${i + 1}`);
        continue;
      }

      try {
        const prospectName = row[nameIdx];
        const prospectEmail = row[emailIdx];
        const company = companyIdx >= 0 ? row[companyIdx] : 'Unknown';
        const meetingDate = row[dateIdx];
        const meetingTime = timeIdx >= 0 ? row[timeIdx] : '09:00:00';
        const setterEmail = setterIdx >= 0 ? row[setterIdx]?.toLowerCase() : '';
        const outcome = outcomeIdx >= 0 ? row[outcomeIdx]?.toLowerCase() : 'pending';

        // Validate required fields
        if (!prospectName || !prospectEmail || !meetingDate) {
          await supabase.from('sync_errors').insert({
            source: 'csv_import',
            error_reason: `Row ${i + 1}: Missing required fields`,
            raw_payload: { row_number: i + 1, data: row },
          });
          errors++;
          continue;
        }

        // Lookup setter by email
        let setterId = null;
        if (setterEmail) {
          setterId = setterMap.get(setterEmail);
          if (!setterId) {
            console.warn(`[CSV MEETINGS IMPORT] No setter found for ${setterEmail}`);
          }
        }

        if (!setterId) {
          await supabase.from('sync_errors').insert({
            source: 'csv_import',
            error_reason: `Row ${i + 1}: No setter found for email: ${setterEmail}`,
            raw_payload: { row_number: i + 1, data: row },
          });
          errors++;
          continue;
        }

        // Lookup client by company name
        const clientId = clientMap.get(company.toLowerCase());

        // Normalize outcome
        let normalizedOutcome = 'pending';
        if (outcome.includes('show') && !outcome.includes('no')) normalizedOutcome = 'showed';
        else if (outcome.includes('no-show') || outcome.includes('no show')) normalizedOutcome = 'no-show';
        else if (outcome.includes('cancel')) normalizedOutcome = 'cancelled';
        else if (outcome.includes('reschedul')) normalizedOutcome = 'rescheduled';

        // Check if meeting already exists (by email + date, not close_activity_id)
        const { data: existing } = await supabase
          .from('meetings')
          .select('id, close_activity_id')
          .eq('prospect_email', prospectEmail)
          .eq('meeting_date', meetingDate)
          .maybeSingle();

        const meetingData = {
          company_name: company,
          prospect_name: prospectName,
          prospect_email: prospectEmail,
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          outcome: normalizedOutcome,
          setter_profile_id: setterId,
          client_profile_id: clientId,
          source: 'csv_import',
          status: normalizedOutcome === 'showed' ? 'approved' : 'pending',
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          // Update but don't overwrite close_activity_id if it exists
          const updateData = existing.close_activity_id 
            ? { ...meetingData } 
            : { ...meetingData };

          const { error } = await supabase
            .from('meetings')
            .update(updateData)
            .eq('id', existing.id);

          if (error) {
            throw error;
          }
          updated++;
        } else {
          // Insert new meeting
          const { error } = await supabase
            .from('meetings')
            .insert({
              ...meetingData,
              created_at: new Date().toISOString(),
            });

          if (error) {
            throw error;
          }
          imported++;
        }

      } catch (error) {
        console.error(`[CSV MEETINGS IMPORT] Error processing row ${i + 1}:`, error);
        await supabase.from('sync_errors').insert({
          source: 'csv_import',
          error_reason: error instanceof Error ? error.message : String(error),
          raw_payload: { row_number: i + 1, data: row },
        });
        errors++;
      }
    }

    // Update performance metrics
    await updatePerformanceMetrics(supabase);

    // Log activity
    await supabase.from('admin_activity_log').insert({
      action: 'csv_meetings_import',
      details: {
        total_rows: lines.length - 1,
        imported,
        updated,
        errors,
        timestamp: new Date().toISOString(),
      },
    });

    const result = {
      success: true,
      message: 'CSV meetings imported successfully',
      total_rows: lines.length - 1,
      imported,
      updated,
      errors,
      timestamp: new Date().toISOString(),
    };

    console.log(`[CSV MEETINGS IMPORT] Completed: imported=${imported} updated=${updated} errors=${errors}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[CSV MEETINGS IMPORT] Error:', error);
    
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

    // Aggregate by setter
    const setterStats = new Map();
    for (const meeting of meetingCounts) {
      const setterId = meeting.setter_profile_id;
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

    console.log('[CSV MEETINGS IMPORT] Performance metrics updated');
  } catch (error) {
    console.error('[CSV MEETINGS IMPORT] Error updating performance:', error);
  }
}
