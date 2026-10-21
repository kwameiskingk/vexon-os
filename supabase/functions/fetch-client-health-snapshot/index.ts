// Live read of the "Dashboard" tab from the Client Health Google Sheet.
// One-way fetch, no DB writes. Returns normalized snapshot rows + a fetched-at timestamp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SPREADSHEET_ID = "1yVfe7Von85n7FHcysLMOhBHQsVqrgu66CDeW6UybnyI";
const SHEET_NAME = "Dashboard";

// Allowed roles for this view.
const ALLOWED_ROLES = new Set([
  "admin",
  "dev",
  "ops",
  "csm",
  "sdr_manager",
]);

interface SnapshotRow {
  clientName: string;
  status: string | null;
  campaignEndDate: string | null;
  daysRemaining: number | null;
  revenueGenerated: number | null;
  opportunities: number | null;
  vacancies: number | null;
  meetingsBooked: number | null;
  meetingsSat: number | null;
  showUpRate: number | null; // 0-1
  avgMeetingQuality: number | null; // 1-5
  qualityMeetings: number | null;
  healthStatus: "green" | "amber" | "red" | null;
  notes: string | null;
  matched: boolean;
  clientProfileId: string | null;
}

// Used only for header-column normalization (keeps original behavior).
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");

// Suffix tokens we may strip from the END of a normalized client name.
// Intentionally conservative — stripping is only applied as a fallback,
// and only when the resulting key resolves to exactly one client_profile.
const STRIPPABLE_SUFFIXES = [
  "ltd",
  "limited",
  "llc",
  "inc",
  "plc",
  "co",
  "group",
  "search",
  "consultants",
  "partnership",
  "associates",
  "recruitment",
];

// Normalize a client/company name for matching.
// - lowercase + trim
// - collapse internal whitespace
// - strip trailing parenthetical group: "Foo Bar (FB)" -> "foo bar"
// - normalize "&" <-> "and"
// - remove punctuation (commas, periods, apostrophes)
const normalizeName = (raw: string): string => {
  if (!raw) return "";
  let s = String(raw).toLowerCase().trim();
  // strip trailing parenthetical e.g. "(GRB)"
  s = s.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  // & -> and
  s = s.replace(/&/g, " and ");
  // remove punctuation
  s = s.replace(/[.,'`"]/g, "");
  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
};

// Return the suffix-stripped form, but only if at least one word remains.
// Returns null when stripping would empty the string or no suffix matched.
const stripSuffix = (normalized: string): string | null => {
  if (!normalized) return null;
  const parts = normalized.split(" ");
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  if (!STRIPPABLE_SUFFIXES.includes(last)) return null;
  const rest = parts.slice(0, -1).join(" ").trim();
  return rest.length > 0 ? rest : null;
};

// Extract a trailing parenthetical acronym, lowercased, e.g. "Foo Bar (GRB)" -> "grb"
const extractAcronym = (raw: string): string | null => {
  if (!raw) return null;
  const m = String(raw).match(/\(([^)]+)\)\s*$/);
  if (!m) return null;
  const inner = m[1].trim().toLowerCase();
  if (!inner) return null;
  return inner;
};

const parseNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  // strip $, commas, %
  const cleaned = s.replace(/[$,%\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const parsePct = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.includes("%")) {
    const n = Number(s.replace(/[%\s]/g, ""));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // If it's already a fraction (<= 1), keep; if it's > 1, treat as percent.
  return n > 1 ? n / 100 : n;
};

const parseHealth = (v: unknown): "green" | "amber" | "red" | null => {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s.includes("🟢") || s.includes("green") || s.includes("healthy")) return "green";
  if (
    s.includes("🟡") ||
    s.includes("amber") ||
    s.includes("yellow") ||
    s.includes("attention") ||
    s.includes("watch")
  ) return "amber";
  if (s.includes("🔴") || s.includes("red") || s.includes("risk")) return "red";
  return null;
};

const parseStatus = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  return s || null;
};

const parseDateString = (v: unknown): string | null => {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Try DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  return s;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);

    const roleSet = new Set((roles || []).map((r: any) => r.role));
    const allowed = [...ALLOWED_ROLES].some((r) => roleSet.has(r));
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Fetch sheet ----
    const apiKey = Deno.env.get("GOOGLE_SHEETS_KEY");
    if (!apiKey) throw new Error("GOOGLE_SHEETS_KEY not configured");

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
      SHEET_NAME
    )}?key=${apiKey}`;
    const sheetRes = await fetch(url);
    if (!sheetRes.ok) {
      const txt = await sheetRes.text();
      throw new Error(`Sheets API ${sheetRes.status}: ${txt}`);
    }
    const sheetJson = await sheetRes.json();
    const allRows: string[][] = sheetJson.values || [];

    // ---- Find header row dynamically ----
    // Look for a row containing "client name" (case-insensitive).
    let headerIdx = -1;
    for (let i = 0; i < Math.min(allRows.length, 10); i++) {
      const joined = (allRows[i] || []).map((c) => normalize(c || "")).join("|");
      if (joined.includes("client_name") || joined.includes("clientname") || joined.includes("client")) {
        // Make sure it actually has multiple columns so we don't grab a title
        if ((allRows[i] || []).filter((c) => c && c.trim()).length >= 5) {
          headerIdx = i;
          break;
        }
      }
    }
    if (headerIdx === -1) {
      return new Response(
        JSON.stringify({ error: "Could not locate header row in Dashboard tab", preview: allRows.slice(0, 5) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers = (allRows[headerIdx] || []).map((h) => normalize(h || ""));
    const dataRows = allRows.slice(headerIdx + 1);

    // ---- Column aliases ----
    const aliases: Record<keyof Omit<SnapshotRow, "matched" | "clientProfileId">, string[]> = {
      clientName: ["client_name", "client", "company", "company_name"],
      status: ["status", "client_status"],
      campaignEndDate: ["campaign_end_date", "end_date", "campaign_end"],
      daysRemaining: ["days_remaining", "days_left", "days"],
      revenueGenerated: ["revenue_generated", "revenue_generated_", "revenue", "revenue_"],
      opportunities: ["opportunities", "opps"],
      vacancies: ["vacancies", "vacancy"],
      meetingsBooked: ["meetings_booked", "booked"],
      meetingsSat: ["meetings_sat", "sat", "satmeetings"],
      showUpRate: ["showup_rate", "show_up_rate", "show_rate"],
      avgMeetingQuality: ["avg_meeting_quality_15", "avg_meeting_quality", "average_quality", "avg_quality"],
      qualityMeetings: ["quality_meetings_4", "quality_meetings", "quality"],
      healthStatus: ["health_status", "health"],
      notes: ["notes", "note", "comments"],
    };

    const colIdx: Record<string, number> = {};
    for (const [canonical, alts] of Object.entries(aliases)) {
      const i = headers.findIndex((h) =>
        alts.some((a) => h === a || h.startsWith(a) || h.includes(a))
      );
      if (i !== -1) colIdx[canonical] = i;
    }

    if (colIdx.clientName === undefined) {
      return new Response(
        JSON.stringify({ error: "Client Name column not found", headers }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Pull client_profiles for matching ----
    const { data: profiles } = await admin
      .from("client_profiles")
      .select("id, company_name");

    // Persisted aliases (sheet name -> client_profile_id), authored via "Add as client"
    // or manual admin entries. These take precedence over fuzzy fallbacks.
    const { data: aliasRows } = await admin
      .from("client_name_aliases")
      .select("sheet_name, client_profile_id");

    // exactKey -> client_profile_id (normalized, suffix kept)
    const exactMap = new Map<string, string>();
    // suffixStrippedKey -> Set<client_profile_id> (ambiguous-aware fallback)
    const suffixMap = new Map<string, Set<string>>();
    // acronymKey -> Set<client_profile_id> (e.g. "grb")
    const acronymMap = new Map<string, Set<string>>();

    const addToSetMap = (m: Map<string, Set<string>>, key: string, id: string) => {
      if (!key) return;
      let s = m.get(key);
      if (!s) { s = new Set(); m.set(key, s); }
      s.add(id);
    };

    (profiles || []).forEach((p: any) => {
      if (!p.company_name) return;
      const id = p.id as string;
      const norm = normalizeName(p.company_name);
      if (norm) {
        if (!exactMap.has(norm)) exactMap.set(norm, id);
        const stripped = stripSuffix(norm);
        if (stripped) addToSetMap(suffixMap, stripped, id);
      }
      const acronym = extractAcronym(p.company_name);
      if (acronym) addToSetMap(acronymMap, acronym, id);
    });

    const aliasMap = new Map<string, string>();
    (aliasRows || []).forEach((a: any) => {
      if (a.sheet_name && a.client_profile_id) {
        aliasMap.set(String(a.sheet_name).toLowerCase().trim(), a.client_profile_id);
      }
    });

    const resolveProfileId = (rawName: string): string | null => {
      const aliasKey = rawName.toLowerCase().trim();
      const norm = normalizeName(rawName);
      // (1) Exact normalized match (suffix preserved)
      if (norm && exactMap.has(norm)) return exactMap.get(norm)!;
      // (2) Acronym match — unique only
      const sheetAcronym = extractAcronym(rawName);
      if (sheetAcronym) {
        const s = acronymMap.get(sheetAcronym);
        if (s && s.size === 1) return [...s][0];
      }
      if (norm && !norm.includes(" ")) {
        const s = acronymMap.get(norm);
        if (s && s.size === 1) return [...s][0];
      }
      // (3) Alias lookup
      if (aliasMap.has(aliasKey)) return aliasMap.get(aliasKey)!;
      // (4) Suffix-stripped fallback — unique only; never guess.
      const sheetStripped = stripSuffix(norm);
      if (sheetStripped) {
        if (exactMap.has(sheetStripped)) return exactMap.get(sheetStripped)!;
        const s = suffixMap.get(sheetStripped);
        if (s && s.size === 1) return [...s][0];
      }
      if (norm) {
        const s = suffixMap.get(norm);
        if (s && s.size === 1) return [...s][0];
      }
      return null;
    };

    const get = (row: string[], key: string) => {
      const idx = colIdx[key];
      if (idx === undefined) return null;
      return row[idx] ?? null;
    };

    const snapshots: SnapshotRow[] = [];
    const unmatchedDebug: any[] = [];
    for (const row of dataRows) {
      const rawName = (get(row, "clientName") || "").toString().trim();
      if (!rawName) continue;
      if (/^total/i.test(rawName)) continue;

      // Filter at source: when the sheet has a Status column, only include Active rows.
      const status = parseStatus(get(row, "status"));
      if (status !== null && status !== "active") continue;

      const matchedId = resolveProfileId(rawName);

      if (!matchedId) {
        const norm = normalizeName(rawName);
        const stripped = stripSuffix(norm);
        const acronym = extractAcronym(rawName);
        unmatchedDebug.push({
          raw: rawName,
          normalized: norm,
          stripped,
          acronym,
        });
        console.log(
          `[health-match] UNMATCHED raw="${rawName}" norm="${norm}" stripped="${stripped}" acronym="${acronym}"`
        );
      }

      snapshots.push({
        clientName: rawName,
        status,
        campaignEndDate: parseDateString(get(row, "campaignEndDate")),
        daysRemaining: parseNum(get(row, "daysRemaining")),
        revenueGenerated: parseNum(get(row, "revenueGenerated")),
        opportunities: parseNum(get(row, "opportunities")),
        vacancies: parseNum(get(row, "vacancies")),
        meetingsBooked: parseNum(get(row, "meetingsBooked")),
        meetingsSat: parseNum(get(row, "meetingsSat")),
        showUpRate: parsePct(get(row, "showUpRate")),
        avgMeetingQuality: parseNum(get(row, "avgMeetingQuality")),
        qualityMeetings: parseNum(get(row, "qualityMeetings")),
        healthStatus: parseHealth(get(row, "healthStatus")),
        notes: ((get(row, "notes") || "") as string).toString().trim() || null,
        matched: matchedId !== null,
        clientProfileId: matchedId,
      });
    }

    if (unmatchedDebug.length) {
      const exactKeys = [...exactMap.keys()].sort();
      const suffixKeys = [...suffixMap.keys()].sort();
      const acronymKeys = [...acronymMap.keys()].sort();
      console.log(
        `[health-match] ${unmatchedDebug.length} unmatched rows. exactMap keys (${exactKeys.length}):`,
        JSON.stringify(exactKeys)
      );
      console.log(
        `[health-match] suffixMap keys (${suffixKeys.length}):`,
        JSON.stringify(suffixKeys)
      );
      console.log(
        `[health-match] acronymMap keys (${acronymKeys.length}):`,
        JSON.stringify(acronymKeys)
      );
    }

    return new Response(
      JSON.stringify({
        rows: snapshots,
        fetchedAt: new Date().toISOString(),
        sheetName: SHEET_NAME,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fetch-client-health-snapshot]", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
