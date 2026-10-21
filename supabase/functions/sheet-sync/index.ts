import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPREADSHEET_ID = '1aH-QXD8l-n-yXh_dvljPv-FGgf4J73i3fPxxtq0-NQ4';
const SHEET_NAME = 'Setter_KPIs';

interface SheetRow {
  date: string;
  setter_name: string;
  setter_email: string;
  calls_outbound: number;
  call_duration_seconds: number;
  leads_created: number;
  meetings_booked: number;
  opps_created: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_SHEETS_KEY');
    if (!apiKey) throw new Error('GOOGLE_SHEETS_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[sheet-sync] Fetching data from Google Sheets...');
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}?key=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`Google Sheets API error: ${response.statusText}`);

    const data = await response.json();
    const rows = data.values || [];
    
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No data found in sheet' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === PARSE HEADERS ===
    const rawHeaders = rows[0].map((h: string) => h?.trim() || '');
    const headers = rawHeaders.map((h: string) => h.toLowerCase().replace(/\s+/g, '_'));
    
    const headerAliases: Record<string, string[]> = {
      'date': ['date', 'dates', 'day', 'report_date'],
      'setter_name': ['setter_name', 'name', 'setter', 'agent_name', 'agent'],
      'setter_email': ['setter_email', 'email', 'agent_email', 'user_email'],
      'calls_outbound': ['calls_outbound', 'calls', 'outbound_calls', 'dials', 'total_calls'],
      'call_duration_seconds': ['call_duration_seconds', 'call_duration', 'duration', 'talk_time_seconds', 'total_duration'],
      'leads_created': ['leads_created', 'leads', 'warm_leads', 'new_leads'],
      'meetings_booked': ['meetings_booked', 'meetings', 'bookings', 'appointments'],
    };
    
    const columnMap: Record<string, number> = {};
    for (const [canonical, aliases] of Object.entries(headerAliases)) {
      const foundIndex = headers.findIndex((h: string) => aliases.includes(h));
      if (foundIndex !== -1) columnMap[canonical] = foundIndex;
    }
    
    // Detect unlabeled date column
    if (columnMap['date'] === undefined && headers[0] === '' && rows.length > 1) {
      const firstDataValue = rows[1][0]?.toString()?.trim() || '';
      const looksLikeDate = /^\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}$/.test(firstDataValue) ||
                           /^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/.test(firstDataValue) ||
                           /^\d{4}-\d{2}-\d{2}/.test(firstDataValue);
      if (looksLikeDate) columnMap['date'] = 0;
    }
    
    const requiredHeaders = ['date', 'setter_email', 'calls_outbound', 'meetings_booked'];
    const missingHeaders = requiredHeaders.filter(h => columnMap[h] === undefined);
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required headers: ${missingHeaders.join(', ')}. Found: ${headers.join(', ')}`);
    }

    // === PARSE ROWS ===
    const getValue = (row: any[], key: string): string => {
      const idx = columnMap[key];
      return idx !== undefined ? (row[idx]?.toString()?.replace(/,/g, '') || '') : '';
    };

    const parseDate = (raw: string): string | null => {
      let d = raw.trim();
      if (!d) return null;
      
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        // Already ISO
      } else if (d.includes('/') || (d.includes('-') && !d.startsWith('20'))) {
        const sep = d.includes('/') ? '/' : '-';
        const parts = d.split(sep);
        if (parts.length !== 3) return null;
        const first = parseInt(parts[0]), second = parseInt(parts[1]);
        let month: string, day: string, year = parts[2];
        if (first > 12) { day = parts[0].padStart(2, '0'); month = parts[1].padStart(2, '0'); }
        else { month = parts[0].padStart(2, '0'); day = parts[1].padStart(2, '0'); }
        if (year.length === 2) year = `20${year}`;
        d = `${year}-${month}-${day}`;
      }
      
      if (isNaN(new Date(d).getTime())) return null;
      return d;
    };

    const parsedRows: SheetRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const date = parseDate(getValue(row, 'date'));
      const email = getValue(row, 'setter_email')?.trim().toLowerCase();
      if (!date || !email) continue;
      
      parsedRows.push({
        date,
        setter_name: getValue(row, 'setter_name')?.trim() || '',
        setter_email: email,
        calls_outbound: parseFloat(getValue(row, 'calls_outbound')) || 0,
        call_duration_seconds: parseFloat(getValue(row, 'call_duration_seconds')) || 0,
        leads_created: parseFloat(getValue(row, 'leads_created')) || 0,
        meetings_booked: parseFloat(getValue(row, 'meetings_booked')) || 0,
        opps_created: parseFloat(getValue(row, 'opps_created')) || 0,
      });
    }

    console.log(`[sheet-sync] Parsed ${parsedRows.length} valid rows`);

    // === GROUP BY (date, email) ===
    const grouped = new Map<string, SheetRow>();
    parsedRows.forEach(row => {
      const key = `${row.date}|${row.setter_email}`;
      if (grouped.has(key)) {
        const e = grouped.get(key)!;
        e.calls_outbound += row.calls_outbound;
        e.call_duration_seconds += row.call_duration_seconds;
        e.leads_created += row.leads_created;
        e.meetings_booked += row.meetings_booked;
        e.opps_created += row.opps_created;
      } else {
        grouped.set(key, { ...row });
      }
    });

    console.log(`[sheet-sync] Grouped into ${grouped.size} unique records`);

    // === BATCH: Fetch all profiles at once ===
    const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');
    
    const emailToUserId = new Map<string, string>();
    profiles?.forEach(p => {
      emailToUserId.set(p.email.toLowerCase(), p.id);
      emailToUserId.set(p.email.toLowerCase().split('@')[0], p.id);
    });
    // Map sheet emails by prefix
    for (const row of grouped.values()) {
      const prefix = row.setter_email.split('@')[0];
      if (emailToUserId.has(prefix) && !emailToUserId.has(row.setter_email)) {
        emailToUserId.set(row.setter_email, emailToUserId.get(prefix)!);
      }
    }

    // Build records with user IDs
    const records = Array.from(grouped.values())
      .map(row => {
        const userId = emailToUserId.get(row.setter_email);
        if (!userId) return null;
        // NOTE: dials_made / call_duration_seconds / talk_time are intentionally
        // omitted — n8n -> setter-metrics is the sole source of truth for those
        // fields. Sheet-sync only contributes meeting / opp / lead counts.
        return {
          setter_id: userId,
          user_id: userId,
          email: row.setter_email,
          date: row.date,
          conversations: Math.round(row.leads_created),
          meetings_booked: Math.round(row.meetings_booked),
          opps_created: Math.round(row.opps_created),
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as any[];

    if (records.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No matching users found', inserted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === BATCH: Fetch ALL existing performance records in ONE query ===
    const uniqueSetterIds = [...new Set(records.map(r => r.setter_id))];
    const uniqueDates = [...new Set(records.map(r => r.date))];
    
    const { data: existingPerf } = await supabase
      .from('performance')
      .select('setter_id, date, meetings_booked, dials_target, meetings_target')
      .in('setter_id', uniqueSetterIds)
      .in('date', uniqueDates);

    const existingMap = new Map<string, any>();
    existingPerf?.forEach(p => {
      existingMap.set(`${p.setter_id}|${p.date}`, p);
    });

    // === BATCH: Count ALL app meetings in ONE query ===
    // Use created_at (logged date) not meeting_date (scheduled date)
    // This matches the sync_meeting_to_performance trigger logic
    const minDate = uniqueDates.reduce((a, b) => a < b ? a : b);
    const maxDate = uniqueDates.reduce((a, b) => a > b ? a : b);
    const { data: appMeetings } = await supabase
      .from('meetings')
      .select('setter_id, logged_by_setter_id, created_at')
      .gte('created_at', `${minDate}T00:00:00`)
      .lte('created_at', `${maxDate}T23:59:59`);

    // Group app meetings by (userId, created_at date)
    const appMeetingCounts = new Map<string, number>();
    appMeetings?.forEach(m => {
      const userId = m.logged_by_setter_id || m.setter_id;
      if (!userId || !m.created_at) return;
      const loggedDate = m.created_at.split('T')[0];
      const key = `${userId}|${loggedDate}`;
      appMeetingCounts.set(key, (appMeetingCounts.get(key) || 0) + 1);
    });

    // === Merge: preserve targets and take MAX meetings ===
    const finalRecords = records.map(record => {
      const key = `${record.setter_id}|${record.date}`;
      const existing = existingMap.get(key);
      const appCount = appMeetingCounts.get(key) || 0;
      
      return {
        ...record,
        dials_target: existing?.dials_target ?? 0,
        meetings_target: existing?.meetings_target ?? 0,
        meetings_booked: Math.max(record.meetings_booked, existing?.meetings_booked ?? 0, appCount),
      };
    });

    // === BATCH UPSERT (chunks of 50) ===
    const CHUNK_SIZE = 50;
    let upsertErrors = 0;
    for (let i = 0; i < finalRecords.length; i += CHUNK_SIZE) {
      const chunk = finalRecords.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('performance')
        .upsert(chunk, { onConflict: 'setter_id,date', ignoreDuplicates: false });
      if (error) {
        console.error('[sheet-sync] Batch upsert error:', error);
        upsertErrors++;
      }
    }

    console.log(`[sheet-sync] Upserted ${finalRecords.length} records (${upsertErrors} batch errors)`);

    // === POST-SYNC RECONCILIATION (batched) ===
    // Find setter+date combos in meetings table that are NOT covered by sheet data
    const sheetKeys = new Set(finalRecords.map(r => `${r.setter_id}|${r.date}`));
    const reconcileRecords: any[] = [];

    for (const [key, count] of appMeetingCounts) {
      if (sheetKeys.has(key)) continue; // Already handled above
      const [userId, date] = key.split('|');
      const profile = profiles?.find(p => p.id === userId);
      if (!profile) continue;
      
      const existing = existingMap.get(key);
      reconcileRecords.push({
        setter_id: userId,
        user_id: userId,
        email: profile.email.toLowerCase(),
        date,
        meetings_booked: Math.max(count, existing?.meetings_booked ?? 0),
        dials_target: existing?.dials_target ?? 0,
        meetings_target: existing?.meetings_target ?? 0,
        updated_at: new Date().toISOString(),
      });
    }

    if (reconcileRecords.length > 0) {
      for (let i = 0; i < reconcileRecords.length; i += CHUNK_SIZE) {
        const chunk = reconcileRecords.slice(i, i + CHUNK_SIZE);
        await supabase
          .from('performance')
          .upsert(chunk, { onConflict: 'setter_id,date', ignoreDuplicates: false });
      }
      console.log(`[sheet-sync] Reconciled ${reconcileRecords.length} additional meeting records`);
    }

    console.log('[sheet-sync] ✅ Sync completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `✅ Synced ${finalRecords.length} records from Google Sheets`,
        processed: parsedRows.length,
        grouped: grouped.size,
        inserted: finalRecords.length,
        reconciled: reconcileRecords.length,
        last_synced_at: new Date().toISOString(),
        sync_timestamp: Date.now(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sheet-sync] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
