// AI Call Review agent v2 — funnel-based:
//  1. paginate ALL Close calls for setter in window
//  2. free filters (duration >= 90s) drop voicemail/no-pickup
//  3. reuse cached call_scores instead of re-classifying
//  4. Haiku in batches classifies survivors (real_prospect vs ai_screener/voicemail/...)
//  5. rank by (duration desc, !booked_nearby, low_qa) → top 80 to Sonnet
//  6. Sonnet brief grounded in Fulfilment Master Doc + 6-section scorecard rubric
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const HAIKU_MODEL = "claude-haiku-4-5";
const SONNET_MODEL = "claude-opus-4-5";

const MIN_DURATION_SEC = 90;        // free pre-filter
const HAIKU_BATCH_SIZE = 25;
const SONNET_TOP_N = 80;             // top-ranked real_prospect calls sent to Sonnet
const CLOSE_PAGE_SIZE = 100;
const CLOSE_MAX_PAGES = 50;          // safety: 5,000 raw calls

/* ────────────────────── EMBEDDED PLAYBOOK ──────────────────────
   This is the Fulfilment Setting Master Doc + 6-section QA scorecard
   condensed. Sonnet is REQUIRED to ground its feedback in these
   exact section names, paths, and gates. */
const PLAYBOOK = `FULFILMENT SDR PLAYBOOK — reference framework

DISCOVERY DECISION TREE
  Opening question: "Have you ever used an external recruitment agency to help with hiring?"
  Path 1 (YES) → "How has your experience with them been?"
    Path 1A (Positive) → "What qualities do you look for in an agency partner?" → prompt for known issues (irrelevant CVs / low volume / hiring taking too long) → if YES → Problem Discovery → Book Meeting; if NO → credibility statement + "is this worth exploring further?"
    Path 1B (Mixed/Negative) → "What problems are you experiencing?" → Problem Discovery → Book Meeting
  Path 2 (NO) → "What back-up plan do you have when your internal team struggles to find talent?"
    Path 2A (We do partner with agencies sometimes) → fall back to Path 1 logic
    Path 2B (No back-ups) → "Some of our best placements were with companies that weren't actively hiring. If a really good candidate came along, you wouldn't turn down a conversation, would you?"

PROBLEM DISCOVERY — 4 required questions
  1. What is the problem?
  2. How long has it been a problem?
  3. What is causing the problem?
  4. What are the impacts of the problem?

OBJECTION MATRIX (correct responses)
  "Send me an email" → before sending, ask the agency question
  "Where did you get my number" → "LinkedIn data tool" + agency question
  "Not interested" → "May I ask why not?"
  "I don't take cold calls" → empathise + agency question
  "I'm busy" → "What time can I call you today?"
  "We're not hiring" → "Some of our best placements were with companies that weren't actively hiring..."
  "Yeah book me in" → "Can I just ask what's sparked your interest so quickly?"
  "I don't handle hiring" → clarify: never look at candidates OR HR handles it but you have final say?
  "We're super niche" → "We're a specialist agency, companies use us BECAUSE they need niche candidates"
  "We're happy with our current process" → "Has the process ever included recruitment agencies?"
  After ANY objection → revert to the qualifying question + correct path

SCORECARD — 6 sections (weights as %, mandatory gates marked *)
  1. Opening (5%) — name, client company, reason for call
  2. Discovery (30%) — agency question + correct path + problem-discovery questions
  3. Objection Handling (20%) — matrix responses + return to qualifier
  4. Qualification (25%):
       * Currently hiring (or within 3 months)         [MANDATORY GATE]
       * Identified roles being hired                   [MANDATORY GATE]
         Hiring frequency, priority, valid work email
  5. Closing (5%) — summarise pain, frame as structured meeting, live calendar accept,
       * confirm date/time/attendees                    [MANDATORY GATE]
       explain next steps, asked "any reason you can't make it?"
  6. Compliance (10%) — call duration appropriate, prospect talk-ratio > 60%

QUALIFIED WARM LEAD requires ALL mandatory gates marked Yes.

PERFORMANCE BANDS: 90-100 Excellent · 75-89 Good · 60-74 Developing · <60 Needs Work.

When coaching, ALWAYS cite the section name, path letter, or gate number above. Generic advice is not acceptable.`;

type CloseCall = {
  id: string;
  date_created: string;
  duration: number;
  direction?: string;
  recording_url?: string | null;
  lead_id?: string | null;
  contact_name?: string | null;
};

type CallRow = {
  call_id: string;
  call_date: string;
  duration_s: number;
  direction?: string;
  recording_url?: string | null;
  lead_id?: string | null;
  contact_name?: string | null;
  transcript_text?: string;
  classification?: string;
  booked_nearby?: boolean;
  score?: {
    rating: string;
    weighted_total: number;
    mandatory_gates_passed: boolean;
    notes?: string | null;
  } | null;
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callAnthropic(model: string, system: string, user: string, maxTokens = 1024): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${model} ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") throw new Error(`Anthropic ${model}: no text in response`);
  return text;
}

function flattenTranscript(t: unknown): string {
  if (!t) return "";
  if (typeof t === "string") return t;
  const arr = Array.isArray((t as any)?.transcript)
    ? (t as any).transcript
    : Array.isArray(t)
    ? (t as any[])
    : null;
  if (arr) {
    return arr
      .map((seg: any) => {
        const who = seg.speaker || seg.user || seg.role || "speaker";
        const text = seg.text || seg.content || seg.utterance || "";
        return `${who}: ${text}`;
      })
      .filter((l: string) => l.trim().length > 5)
      .join("\n");
  }
  try {
    return JSON.stringify(t).slice(0, 8000);
  } catch {
    return "";
  }
}

async function fetchCloseTranscript(callId: string, apiKey: string): Promise<unknown | null> {
  const authHeaders = { Authorization: `Basic ${btoa(apiKey + ":")}` };
  const res = await fetch(`https://api.close.com/api/v1/activity/call/${callId}/`, { headers: authHeaders });
  if (!res.ok) return null;
  const call = await res.json();
  return call.transcript ?? call.note ?? null;
}

async function listCloseCallsForUser(
  closeUserId: string,
  apiKey: string,
  dateFromISO: string,
  dateToISO: string,
): Promise<CloseCall[]> {
  const authHeaders = { Authorization: `Basic ${btoa(apiKey + ":")}` };
  const out: CloseCall[] = [];
  for (let page = 0; page < CLOSE_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      user_id: closeUserId,
      date_created__gte: dateFromISO,
      date_created__lte: dateToISO,
      _limit: String(CLOSE_PAGE_SIZE),
      _skip: String(page * CLOSE_PAGE_SIZE),
    });
    const res = await fetch(`https://api.close.com/api/v1/activity/call/?${params.toString()}`, {
      headers: authHeaders,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Close list calls ${res.status}: ${t.slice(0, 300)}`);
    }
    const data = await res.json();
    const rows: CloseCall[] = data.data || [];
    out.push(...rows);
    if (!data.has_more || rows.length === 0) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "POST only" }, 405);

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return jsonResp({ error: "Missing bearer token" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const userRes = await supabase.auth.getUser(auth.replace(/^bearer\s+/i, ""));
  const userId = userRes.data.user?.id;
  if (!userId) return jsonResp({ error: "Invalid token" }, 401);

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const userRoles = new Set((roles || []).map((r: any) => r.role));
  const allowed = ["admin", "dev", "sdr_manager"].some((r) => userRoles.has(r));
  if (!allowed) return jsonResp({ error: "Forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: "Invalid JSON" }, 400); }
  const { setter_profile_id, date_from, date_to } = body || {};
  if (!setter_profile_id || !date_from || !date_to) {
    return jsonResp({ error: "Missing setter_profile_id, date_from, date_to" }, 400);
  }

  const { data: setter, error: setterErr } = await supabase
    .from("setters_profiles")
    .select("id, full_name, email, department, close_user_id, user_id")
    .eq("id", setter_profile_id)
    .maybeSingle();
  if (setterErr || !setter) return jsonResp({ error: "Setter not found" }, 404);

  const department = (setter.department || "fulfilment").toLowerCase();
  const candidateKeys: Array<{ label: string; key: string }> = [];
  const ful = Deno.env.get("CLOSE_API_KEY_FULFILMENT");
  const acq = Deno.env.get("CLOSE_API_KEY_ACQUISITION");
  const generic = Deno.env.get("CLOSE_API_KEY");
  if (department === "acquisition") {
    if (acq) candidateKeys.push({ label: "acquisition", key: acq });
    if (ful) candidateKeys.push({ label: "fulfilment", key: ful });
  } else {
    if (ful) candidateKeys.push({ label: "fulfilment", key: ful });
    if (acq) candidateKeys.push({ label: "acquisition", key: acq });
  }
  if (candidateKeys.length === 0 && generic) candidateKeys.push({ label: "generic", key: generic });
  if (candidateKeys.length === 0) return jsonResp({ error: `No Close API key configured` }, 500);
  if (!setter.close_user_id) return jsonResp({ error: "Setter has no close_user_id mapped" }, 400);

  const { data: brief, error: insertErr } = await supabase
    .from("call_review_briefs")
    .insert({
      setter_profile_id,
      manager_user_id: userId,
      date_from,
      date_to,
      department,
      status: "running",
    })
    .select()
    .single();
  if (insertErr || !brief) return jsonResp({ error: `Could not create brief: ${insertErr?.message}` }, 500);

  const runJob = async () => {
    const finish = async (patch: any) => {
      await supabase
        .from("call_review_briefs")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", brief.id);
    };

    try {
      const dateFromISO = new Date(`${date_from}T00:00:00Z`).toISOString();
      const dateToISO = new Date(`${date_to}T23:59:59Z`).toISOString();

      /* ──── STEP 1: paginate ALL Close calls, picking the right workspace ──── */
      let allCalls: CloseCall[] = [];
      let apiKey = candidateKeys[0].key;
      let usedLabel = candidateKeys[0].label;
      for (const cand of candidateKeys) {
        try {
          const found = await listCloseCallsForUser(setter.close_user_id!, cand.key, dateFromISO, dateToISO);
          console.log(`[call-review-agent] workspace=${cand.label} found ${found.length} calls`);
          if (found.length > 0) {
            allCalls = found;
            apiKey = cand.key;
            usedLabel = cand.label;
            break;
          }
        } catch (e) {
          console.warn(`[call-review-agent] workspace=${cand.label} list failed`, e);
        }
      }
      const totalRaw = allCalls.length;

      if (totalRaw === 0) {
        await finish({
          status: "done",
          call_count: 0,
          brief: {
            verdict: `No calls found in Close in this window (checked ${candidateKeys.map(c => c.label).join(", ")}).`,
            funnel: { raw: 0, too_short: 0, qualifying: 0, analysed: 0 },
            patterns: [], recommended_listens: [], excluded_calls: [], coaching_brief: [],
          },
        });
        return;
      }

      /* ──── STEP 2: free pre-filter on duration ──── */
      const longEnough = allCalls.filter(c => (c.duration ?? 0) >= MIN_DURATION_SEC);
      const tooShort = totalRaw - longEnough.length;
      console.log(`[call-review-agent] workspace=${usedLabel} total=${totalRaw} long_enough=${longEnough.length} too_short=${tooShort}`);

      if (longEnough.length === 0) {
        await finish({
          status: "done",
          call_count: 0,
          brief: {
            verdict: `${totalRaw} calls in window but all were under ${MIN_DURATION_SEC}s (voicemail / no-pickup / IVR). Nothing to coach on.`,
            funnel: { raw: totalRaw, too_short: tooShort, qualifying: 0, analysed: 0 },
            patterns: [], recommended_listens: [], excluded_calls: [], coaching_brief: [],
          },
        });
        return;
      }

      /* ──── STEP 3: join existing call_scores + nearby meetings ──── */
      const callIds = longEnough.map(c => c.id);
      const [scoreRowsRes, meetingsRes] = await Promise.all([
        supabase.from("call_scores")
          .select("call_id, performance_rating, weighted_total, mandatory_gates_passed, overall_reviewer_notes")
          .in("call_id", callIds),
        supabase.from("meetings")
          .select("created_at, setter_profile_id")
          .eq("setter_profile_id", setter_profile_id)
          .gte("created_at", dateFromISO)
          .lte("created_at", dateToISO),
      ]);

      const scoreByCallId = new Map(
        (scoreRowsRes.data || []).map((r: any) => [r.call_id, {
          rating: r.performance_rating,
          weighted_total: r.weighted_total,
          mandatory_gates_passed: r.mandatory_gates_passed,
          notes: r.overall_reviewer_notes,
        }]),
      );
      const meetingTimestamps = (meetingsRes.data || []).map((m: any) => new Date(m.created_at).getTime());
      const isBookedNearby = (callIso: string) => {
        const t = new Date(callIso).getTime();
        // 2h window after the call
        return meetingTimestamps.some(mt => mt >= t && mt - t <= 2 * 60 * 60 * 1000);
      };

      /* ──── STEP 4: build rows + load transcripts (cached) ──── */
      const { data: cachedRows } = await supabase
        .from("call_transcripts")
        .select("call_id, transcript")
        .in("call_id", callIds);
      const transcriptByCallId = new Map<string, unknown>(
        (cachedRows || []).map((r: any) => [r.call_id, r.transcript]),
      );

      const rows: CallRow[] = longEnough.map(c => ({
        call_id: c.id,
        call_date: c.date_created,
        duration_s: c.duration,
        direction: c.direction,
        recording_url: c.recording_url ?? null,
        lead_id: c.lead_id ?? null,
        contact_name: c.contact_name ?? null,
        booked_nearby: isBookedNearby(c.date_created),
        score: scoreByCallId.get(c.id) ?? null,
      }));

      // Fetch transcripts for survivors that don't have one cached. Cap fetches
      // to avoid 5-minute Close hammering — prioritise longer calls first.
      const sortedForTranscript = [...rows].sort((a, b) => b.duration_s - a.duration_s);
      const TRANSCRIPT_FETCH_CAP = 200;
      let transcriptFetches = 0;
      for (const r of sortedForTranscript) {
        if (transcriptByCallId.has(r.call_id)) continue;
        if (transcriptFetches >= TRANSCRIPT_FETCH_CAP) break;
        transcriptFetches++;
        const t = await fetchCloseTranscript(r.call_id, apiKey!);
        if (t) {
          transcriptByCallId.set(r.call_id, t);
          await supabase.from("call_transcripts").upsert({
            call_id: r.call_id,
            department,
            transcript: t,
          });
        } else {
          transcriptByCallId.set(r.call_id, null);
        }
      }
      for (const r of rows) {
        r.transcript_text = flattenTranscript(transcriptByCallId.get(r.call_id)).slice(0, 6000);
      }

      /* ──── STEP 4.5: hard-promote obviously-real calls BEFORE Haiku ──── */
      // Any of these signals = definitely a real prospect conversation;
      // skip classification entirely so we never accidentally exclude them.
      const promoteReal = (r: CallRow): boolean => {
        if (r.booked_nearby) return true;                        // booked a meeting within 2h
        if (r.score) return true;                                 // n8n QA already scored it
        if ((r.duration_s || 0) >= 240 && r.direction === "outbound") return true; // 4+ min outbound
        return false;
      };
      for (const r of rows) {
        if (promoteReal(r)) r.classification = "real_prospect";
      }

      /* ──── STEP 5: Haiku classifies the remainder in batches ──── */
      const toClassify = rows.filter(r => !r.classification && !!r.transcript_text);
      const batches: CallRow[][] = [];
      for (let i = 0; i < toClassify.length; i += HAIKU_BATCH_SIZE) {
        batches.push(toClassify.slice(i, i + HAIKU_BATCH_SIZE));
      }
      const prePromoted = rows.filter(r => r.classification === "real_prospect").length;
      console.log(`[call-review-agent] classify batches=${batches.length} pre_promoted=${prePromoted}`);

      const classifySystem = `You triage outbound sales call transcripts for a recruitment SDR team. Reply with JSON only, no prose.

BUCKET DEFINITIONS (be strict — only use the exclusion buckets when the transcript clearly supports them):
- real_prospect: An actual two-way conversation took place with a decision-maker or potential decision-maker. ANY genuine discovery, qualifying question, objection handling, or pitch attempt counts — even if the prospect declined. THIS IS THE DEFAULT when uncertain.
- voicemail: No human ever spoke back. Only the SDR's voice, a beep, or an automated "please leave a message" prompt.
- gatekeeper: The ONLY person who answered was a receptionist/PA/assistant and the SDR never reached a decision-maker. If the SDR got transferred and then had a real conversation, it's real_prospect.
- ai_screener: An automated AI/IVR screening system answered ("press 1 for sales"). No human conversation.
- rebook: The ENTIRE call was just rescheduling a previously booked meeting. No new discovery or qualifying took place.
- too_short: The transcript shows the call ended within seconds of connecting with no meaningful exchange.
- other: Genuinely doesn't fit any bucket above.

DEFAULT RULE: If uncertain, classify as real_prospect. False exclusions are much worse than false inclusions — a manager can skip a borderline call, but cannot coach one we hid.`;

      for (const batch of batches) {
        const classifyUser = `Classify each call below.

Return ONLY a JSON object: {"classifications":[{"call_id":"...","class":"..."}, ...]}.

Calls:
${batch.map(r => {
  const t = r.transcript_text || "";
  // Send first 1200 chars + last 800 chars — booking/closing language lives at the end.
  const head = t.slice(0, 1200);
  const tail = t.length > 2000 ? "\n…[middle omitted]…\n" + t.slice(-800) : "";
  return `---
call_id: ${r.call_id}
duration_s: ${r.duration_s}
direction: ${r.direction || "unknown"}
booked_nearby: ${r.booked_nearby ? "yes" : "no"}
has_prior_qa_score: ${r.score ? "yes" : "no"}
transcript:
${head}${tail}`;
}).join("\n")}`;

        try {
          const classifyText = await callAnthropic(
            HAIKU_MODEL,
            classifySystem,
            classifyUser,
            2048,
          );
          const m = classifyText.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            for (const c of parsed.classifications || []) {
              const row = rows.find(r => r.call_id === c.call_id);
              if (row && !row.classification) row.classification = c.class;
            }
          }
        } catch (e) {
          console.warn("[call-review-agent] haiku batch failed", e);
        }
      }

      // Safety net: override Haiku verdicts back to real_prospect when hard signals say so.
      // Also fill missing classifications.
      for (const r of rows) {
        if (!r.classification) {
          r.classification = r.transcript_text ? "other" : "no_transcript";
          continue;
        }
        if (r.classification !== "real_prospect" && promoteReal(r)) {
          r.classification = "real_prospect";
        }
      }

      /* ──── STEP 6: rank survivors and trim to top-N for Sonnet ──── */
      const qualifying = rows.filter(r => r.classification === "real_prospect");
      const excluded = rows
        .filter(r => r.classification !== "real_prospect")
        .map(r => ({
          call_id: r.call_id,
          reason: r.classification!,
          duration_s: r.duration_s,
        }));

      // rank: long calls that DIDN'T convert + have low QA score = highest signal
      const rankScore = (r: CallRow) => {
        let s = r.duration_s;
        if (!r.booked_nearby) s += 600;             // big boost for non-converters
        if (r.score && r.score.weighted_total < 75) s += 300;
        if (r.score && !r.score.mandatory_gates_passed) s += 200;
        return s;
      };
      qualifying.sort((a, b) => rankScore(b) - rankScore(a));
      const forSonnet = qualifying.slice(0, SONNET_TOP_N);

      const funnel = {
        raw: totalRaw,
        too_short: tooShort,
        non_prospect: rows.length - qualifying.length,
        qualifying: qualifying.length,
        analysed: forSonnet.length,
        already_scored: rows.filter(r => r.score).length,
      };

      if (forSonnet.length === 0) {
        await finish({
          status: "done",
          call_count: 0,
          brief: {
            verdict: `Pulled ${totalRaw} calls. ${tooShort} were under ${MIN_DURATION_SEC}s and the rest classified as voicemail / AI screener / gatekeeper. No real prospect conversations to review.`,
            funnel,
            patterns: [], recommended_listens: [], excluded_calls: excluded.slice(0, 50), coaching_brief: [],
          },
        });
        return;
      }

      /* ──── STEP 7: Sonnet reasoning brief, grounded in PLAYBOOK ──── */
      const briefSystem = `${PLAYBOOK}

You are a senior SDR coach reviewing a fulfilment setter's outbound discovery calls.
Use the playbook above as the ONLY reference framework. Every pattern and every coaching item MUST cite a specific scorecard section, path letter (1A/1B/2A/2B), problem-discovery question #, objection from the matrix, or mandatory gate.

WRITING STYLE — STRICTLY ENFORCED:
- Write in clean, plain English. Short, complete sentences. No jargon dumps.
- DO NOT use the section symbol "§" anywhere. Write "Section 2" or "the Discovery section", never "§2".
- DO NOT include raw Close activity IDs (anything starting with "acti_") inside verdict, patterns, reasons, what_to_listen_for, behaviour, why, or example_phrase prose. Call IDs only belong in the "call_id" field of recommended_listens.
- Avoid parenthetical citation tags like "(cite playbook)" or "(Discovery §2, Closing §5)". If you need to reference a section, fold it into a normal sentence: "This is a Discovery breakdown — he skipped the agency question."
- Keep each field readable on its own. Verdict is one tight paragraph. Pattern detail is 1–2 sentences. Coaching "why" is one sentence.

You must reply with ONLY valid JSON matching this exact shape:
{
  "verdict": "one-paragraph plain-English summary of the main issue this week (max 80 words). Mention the section or path that's the biggest leak in natural language.",
  "patterns": [{"title":"short label","detail":"what's happening, with an example phrase the setter actually said. Reference the scorecard section or path in plain English.","frequency":"e.g. 4 of 11 calls"}],
  "recommended_listens": [{"call_id":"...","reason":"why this call has the highest learning value — plain English, no call IDs in this text","what_to_listen_for":"specific moment to coach on — plain English"}],
  "coaching_brief": [{"behaviour":"what to do differently","why":"which gate or section this fixes, in plain English","example_phrase":"a literal sentence to teach"}]
}

Pick AT MOST 3 patterns, 3 recommended_listens, 5 coaching_brief items. Recommended_listens MUST be call_ids from the list below. Be specific, not generic.`;


      const briefUser = `Setter: ${setter.full_name || setter.email}
Department: ${department}
Window: ${date_from} → ${date_to}

Funnel for context (not for output): raw=${funnel.raw}, dropped_too_short=${funnel.too_short}, non_prospect=${funnel.non_prospect}, real_prospect_total=${funnel.qualifying}, analysed_now=${funnel.analysed}.

Calls below are ranked by coaching value: longest first, with priority on calls that did NOT result in a booked meeting. QA scores from a prior automated reviewer are included where available — treat them as a signal, not as truth. "booked_nearby=true" means a meeting was created within 2h of this call.

Calls:
${forSonnet.map(r => `---
call_id: ${r.call_id}
date: ${r.call_date}
duration_s: ${r.duration_s}
direction: ${r.direction}
booked_nearby: ${r.booked_nearby}
qa_score: ${r.score ? `${r.score.rating} (${r.score.weighted_total}/100, gates_passed=${r.score.mandatory_gates_passed})` : "not scored"}
transcript:
${r.transcript_text || "(no transcript available)"}`).join("\n")}`;

      const sonnetText = await callAnthropic(SONNET_MODEL, briefSystem, briefUser, 3072);
      const m = sonnetText.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Sonnet returned no JSON object");
      const briefJson = JSON.parse(m[0]);
      briefJson.excluded_calls = excluded.slice(0, 50);
      briefJson.funnel = funnel;

      await finish({ status: "done", call_count: forSonnet.length, brief: briefJson });
    } catch (e) {
      console.error("[call-review-agent] job error", e);
      await finish({ status: "error", error: e instanceof Error ? e.message : "Unknown error" });
    }
  };

  // @ts-ignore EdgeRuntime
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(runJob());
  } else {
    runJob();
  }

  return jsonResp({ brief_id: brief.id, status: "running" });
});
