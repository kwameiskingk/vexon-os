import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPREADSHEET_ID = '1yVfe7Von85n7FHcysLMOhBHQsVqrgu66CDeW6UybnyI';
const SHEET_NAME = 'Meeting Log';

interface SheetRow {
  meeting_date: string;
  setter_name: string;
  client_name: string;
  prospect_company: string;
  fit: number;
  engagement: number;
  authority: number;
  next_step: number;
  notes: string;
}

const HEADER_ALIASES: Record<string, string[]> = {
  meeting_date: ['meeting_date', 'meeting date', 'date', 'appointment date', 'sat date', 'date sat', 'meeting sat date'],
  setter_name: ['setter_name', 'setter name', 'setter', 'sdr', 'sales development rep'],
  client_name: ['client_name', 'client name', 'client', 'account', 'campaign'],
  prospect_company: ['prospect_company', 'prospect/company', 'prospect / company', 'prospect', 'company', 'prospect company', 'prospect name', 'company name'],
  fit: ['fit'],
  engagement: ['engagement'],
  authority: ['authority'],
  next_step: ['next_step', 'next step', 'next steps', 'next-step'],
  notes: ['notes', 'note', 'comments'],
};

function normHeader(h: string) {
  return (h || '').toString().trim().toLowerCase().replace(/[\n\r]+/g, ' ').replace(/[_/—–-]+/g, ' ').replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ');
}

function headerMatches(cell: string, aliases: string[]) {
  const normalizedAliases = aliases.map(normHeader);
  return normalizedAliases.some(alias => cell === alias || cell.startsWith(`${alias} `) || cell.endsWith(` ${alias}`));
}

function parseDate(raw: string): string | null {
  let d = (raw || '').toString().trim();
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  // Handle DD/MM/YYYY or MM/DD/YYYY
  const sep = d.includes('/') ? '/' : (d.includes('-') ? '-' : null);
  if (!sep) return null;
  const parts = d.split(sep);
  if (parts.length !== 3) return null;
  let [a, b, y] = parts;
  if (y.length === 2) y = `20${y}`;
  const ai = parseInt(a), bi = parseInt(b);
  let day: string, month: string;
  if (ai > 12) { day = a.padStart(2, '0'); month = b.padStart(2, '0'); }
  else { day = b.padStart(2, '0'); month = a.padStart(2, '0'); }
  const iso = `${y}-${month}-${day}`;
  if (isNaN(new Date(iso).getTime())) return null;
  return iso;
}

function parseScore(raw: any): number | null {
  if (raw == null) return null;
  const n = parseFloat(raw.toString().trim());
  if (isNaN(n)) return null;
  const r = Math.round(n);
  if (r < 1 || r > 5) return null;
  return r;
}

function fuzzyEq(a: string, b: string) {
  const na = (a || '').toLowerCase().trim();
  const nb = (b || '').toLowerCase().trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('GOOGLE_SHEETS_KEY');
    if (!apiKey) throw new Error('GOOGLE_SHEETS_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // === Auth: must be staff ===
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        const allowed = ['admin', 'dev', 'ops', 'csm', 'sdr_manager'];
        const hasRole = (roles || []).some((r: any) => allowed.includes(r.role));
        if (!hasRole) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // === Fetch sheet ===
    const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${apiKey}`;
    const res = await fetch(sheetUrl);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Google Sheets error: ${res.status} ${txt}`);
    }
    const data = await res.json();
    const rows: any[][] = data.values || [];
    if (rows.length < 2) {
      return new Response(JSON.stringify({ success: true, total: 0, matched: 0, unmatched: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === Locate header row (sheet may have title/banner rows above the real headers) ===
    const required = ['meeting_date', 'setter_name', 'client_name', 'fit', 'engagement', 'authority', 'next_step'];
    let headerRowIdx = -1;
    let headers: string[] = [];
    let colMap: Record<string, number> = {};
    const SCAN_LIMIT = Math.min(rows.length, 100);
    for (let i = 0; i < SCAN_LIMIT; i++) {
      const candidate = (rows[i] || []).map(normHeader);
      const candidateMap: Record<string, number> = {};
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        const idx = candidate.findIndex((h: string) => headerMatches(h, aliases));
        if (idx !== -1) candidateMap[key] = idx;
      }
      const missing = required.filter(k => candidateMap[k] === undefined);
      if (missing.length === 0) {
        headerRowIdx = i;
        headers = candidate;
        colMap = candidateMap;
        break;
      }
    }
    if (headerRowIdx === -1) {
      const sampledRows = rows.slice(0, SCAN_LIMIT).map((row, idx) => `Row ${idx + 1}: ${(row || []).map(normHeader).filter(Boolean).join(' | ')}`).filter(line => !line.endsWith(': ')).slice(0, 20);
      throw new Error(`Could not locate header row in first ${SCAN_LIMIT} rows. Sample rows: ${sampledRows.join(' || ')}`);
    }

    // === Parse rows (start AFTER the located header row) ===
    const parsed: SheetRow[] = [];
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const date = parseDate(r[colMap.meeting_date]);
      const setter = (r[colMap.setter_name] || '').toString().trim();
      const client = (r[colMap.client_name] || '').toString().trim();
      const fit = parseScore(r[colMap.fit]);
      const eng = parseScore(r[colMap.engagement]);
      const auth = parseScore(r[colMap.authority]);
      const next = parseScore(r[colMap.next_step]);
      if (!date || !setter || !client || fit === null || eng === null || auth === null || next === null) continue;
      parsed.push({
        meeting_date: date,
        setter_name: setter,
        client_name: client,
        prospect_company: (colMap.prospect_company !== undefined ? (r[colMap.prospect_company] || '').toString().trim() : ''),
        fit, engagement: eng, authority: auth, next_step: next,
        notes: (colMap.notes !== undefined ? (r[colMap.notes] || '').toString() : ''),
      });
    }

    if (parsed.length === 0) {
      return new Response(JSON.stringify({ success: true, total: 0, matched: 0, unmatched: 0, message: 'No valid rows in sheet' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === Fetch candidate meetings (date range covering sheet ±1d) ===
    const dates = parsed.map(p => p.meeting_date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    // expand by 1 day each side
    const expand = (d: string, delta: number) => {
      const dt = new Date(d + 'T00:00:00Z');
      dt.setUTCDate(dt.getUTCDate() + delta);
      return dt.toISOString().slice(0, 10);
    };

    const { data: meetings, error: mErr } = await supabase
      .from('meetings')
      .select('id, meeting_date, setter_id, logged_by_setter_id, client_profile_id, company_name')
      .gte('meeting_date', expand(minDate, -1))
      .lte('meeting_date', expand(maxDate, 1))
      // Scoring-exempt meetings can never be match candidates: a sheet score
      // must not attach to (or re-queue) an exempted meeting. Such sheet rows
      // surface as unmatched instead of silently binding.
      .eq('scoring_exempt', false);
    if (mErr) throw mErr;

    // Fetch setter profiles + client profiles for matching
    const setterIds = [...new Set((meetings || []).flatMap((m: any) => [m.setter_id, m.logged_by_setter_id]).filter(Boolean))];
    const clientIds = [...new Set((meetings || []).map((m: any) => m.client_profile_id).filter(Boolean))];

    const [{ data: setters }, { data: clients }] = await Promise.all([
      supabase.from('setters_profiles').select('user_id, full_name, email').in('user_id', setterIds),
      supabase.from('client_profiles').select('id, company_name').in('id', clientIds),
    ]);

    const setterById = new Map<string, { full_name: string; email: string }>();
    (setters || []).forEach((s: any) => setterById.set(s.user_id, { full_name: s.full_name || '', email: s.email || '' }));
    const clientById = new Map<string, string>();
    (clients || []).forEach((c: any) => clientById.set(c.id, c.company_name || ''));

    // Build enriched meeting records
    const enriched = (meetings || []).map((m: any) => {
      const sUid = m.logged_by_setter_id || m.setter_id;
      const sp = sUid ? setterById.get(sUid) : null;
      const clientName = m.client_profile_id ? clientById.get(m.client_profile_id) : m.company_name;
      return {
        id: m.id,
        meeting_date: (m.meeting_date || '').slice(0, 10),
        setter_name: sp?.full_name || '',
        client_name: clientName || '',
      };
    });

    // === Match & build upsert payload ===
    const upserts: any[] = [];
    let matchedCount = 0;
    for (const row of parsed) {
      const rowDate = new Date(row.meeting_date + 'T00:00:00Z').getTime();
      const candidates = enriched.filter(m => {
        if (!m.meeting_date) return false;
        const mt = new Date(m.meeting_date + 'T00:00:00Z').getTime();
        if (Math.abs(mt - rowDate) > 24 * 60 * 60 * 1000) return false;
        if (!fuzzyEq(m.setter_name, row.setter_name)) return false;
        if (!fuzzyEq(m.client_name, row.client_name)) return false;
        return true;
      });
      // Prefer exact name match, exact date
      candidates.sort((a, b) => {
        const aExact = (a.setter_name.toLowerCase() === row.setter_name.toLowerCase() ? 0 : 1)
                     + (a.client_name.toLowerCase() === row.client_name.toLowerCase() ? 0 : 1)
                     + (a.meeting_date === row.meeting_date ? 0 : 1);
        const bExact = (b.setter_name.toLowerCase() === row.setter_name.toLowerCase() ? 0 : 1)
                     + (b.client_name.toLowerCase() === row.client_name.toLowerCase() ? 0 : 1)
                     + (b.meeting_date === row.meeting_date ? 0 : 1);
        return aExact - bExact;
      });
      const match = candidates[0];
      const matched = !!match;
      if (matched) matchedCount++;
      upserts.push({
        appointment_id: match?.id || null,
        meeting_date: row.meeting_date,
        setter_name: row.setter_name,
        client_name: row.client_name,
        prospect_company: row.prospect_company || '',
        fit: row.fit,
        engagement: row.engagement,
        authority: row.authority,
        next_step: row.next_step,
        notes: row.notes || null,
        matched,
        synced_at: new Date().toISOString(),
      });
    }

    // === Upsert in chunks ===
    const CHUNK = 100;
    let upsertErrors = 0;
    for (let i = 0; i < upserts.length; i += CHUNK) {
      const chunk = upserts.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('meeting_scores')
        .upsert(chunk, {
          onConflict: 'meeting_date,setter_name,client_name,prospect_company',
          ignoreDuplicates: false,
        });
      if (error) {
        // The unique index uses lower() so onConflict by raw cols may not be honored.
        // Fallback: upsert one by one using manual delete+insert.
        for (const row of chunk) {
          await supabase.from('meeting_scores')
            .delete()
            .eq('meeting_date', row.meeting_date)
            .ilike('setter_name', row.setter_name)
            .ilike('client_name', row.client_name)
            .ilike('prospect_company', row.prospect_company);
          const { error: insErr } = await supabase.from('meeting_scores').insert(row);
          if (insErr) upsertErrors++;
        }
      }
    }

    // === Auto-mark matched appointments as 'sat' ===
    // The presence of a score in the sheet is proof the meeting was sat.
    // Only update appointments that are currently pending — never overwrite
    // explicit cancelled / rescheduled / no_show statuses set elsewhere.
    const matchedAppointmentIds = upserts
      .filter(u => u.matched && u.appointment_id)
      .map(u => u.appointment_id as string);
    let autoSatCount = 0;
    if (matchedAppointmentIds.length > 0) {
      const { data: updated, error: satErr } = await supabase
        .from('meetings')
        .update({ attendance_status: 'sat' })
        .in('id', matchedAppointmentIds)
        .or('attendance_status.is.null,attendance_status.eq.pending')
        .select('id');
      if (satErr) {
        console.error('[sync-meeting-scores] auto-sat update error:', satErr);
      } else {
        autoSatCount = updated?.length || 0;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total: upserts.length,
      matched: matchedCount,
      unmatched: upserts.length - matchedCount,
      auto_sat: autoSatCount,
      upsert_errors: upsertErrors,
      synced_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[sync-meeting-scores]', e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
