// @auth: none
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get("call_id");
    if (!callId) {
      return new Response("Missing call_id", { status: 400, headers: corsHeaders });
    }

    // 1. Try the recording_url already stored on call_scores (populated by n8n).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: row } = await supabase
      .from("call_scores")
      .select("recording_url, department")
      .eq("call_id", callId)
      .maybeSingle();

    // 2. Build cascade of candidate Close API keys. Department tag in our DB
    // doesn't always match the Close org the call actually lives in, so we try
    // dept-preferred first, then the other workspace, then generic.
    const dept = (row?.department || "").toLowerCase();
    const ful = Deno.env.get("CLOSE_API_KEY_FULFILMENT");
    const acq = Deno.env.get("CLOSE_API_KEY_ACQUISITION");
    const generic = Deno.env.get("CLOSE_API_KEY");
    const candidateKeys: Array<{ label: string; key: string }> = [];
    if (dept === "acquisition") {
      if (acq) candidateKeys.push({ label: "CLOSE_API_KEY_ACQUISITION", key: acq });
      if (ful) candidateKeys.push({ label: "CLOSE_API_KEY_FULFILMENT", key: ful });
    } else {
      if (ful) candidateKeys.push({ label: "CLOSE_API_KEY_FULFILMENT", key: ful });
      if (acq) candidateKeys.push({ label: "CLOSE_API_KEY_ACQUISITION", key: acq });
    }
    if (generic) candidateKeys.push({ label: "CLOSE_API_KEY", key: generic });

    if (candidateKeys.length === 0) {
      return new Response("No Close API key configured", { status: 500, headers: corsHeaders });
    }

    const recordingEndpoint = row?.recording_url || `https://api.close.com/call/${callId}/recording/`;
    const failures: Array<{ label: string; status: number; body: string }> = [];

    for (const cand of candidateKeys) {
      const authHeaders = { Authorization: `Basic ${btoa(cand.key + ":")}` };

      // Try the recording endpoint first
      const recordingRes = await fetch(recordingEndpoint, { headers: authHeaders, redirect: "manual" });

      if ([301, 302, 303, 307, 308].includes(recordingRes.status)) {
        const location = recordingRes.headers.get("location");
        if (location) {
          return new Response(null, { status: 302, headers: { ...corsHeaders, Location: location } });
        }
      }

      if (recordingRes.ok) {
        return new Response(recordingRes.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": recordingRes.headers.get("content-type") || "audio/mpeg",
            "Content-Disposition": `inline; filename="${callId}.mp3"`,
          },
        });
      }

      // Fall back to activity endpoint for a signed URL
      const callRes = await fetch(`https://api.close.com/api/v1/activity/call/${callId}/`, { headers: authHeaders });
      if (callRes.ok) {
        const call = await callRes.json();
        const recordingUrl: string | null = call.recording_url || null;
        if (recordingUrl) {
          return new Response(null, { status: 302, headers: { ...corsHeaders, Location: recordingUrl } });
        }
        // The key works but no recording exists for this call
        return new Response("No recording available for this call", { status: 404, headers: corsHeaders });
      }

      // Drain bodies and remember why this key didn't work, then try the next
      const recTxt = await recordingRes.text().catch(() => "");
      const callTxt = await callRes.text().catch(() => "");
      failures.push({ label: cand.label, status: callRes.status, body: callTxt || recTxt });
      console.warn(`[close-recording] key=${cand.label} failed rec=${recordingRes.status} call=${callRes.status}`);
    }

    const summary = failures.map(f => `${f.label}:${f.status}`).join(" / ");
    console.error(`[close-recording] all keys failed for ${callId}: ${summary}`);
    return new Response(
      `Close recording unavailable. Tried ${failures.length} API key(s): ${summary}. The call may belong to a Close workspace this app isn't connected to.`,
      { status: 502, headers: corsHeaders },
    );
  } catch (e) {
    console.error("[close-recording] error", e);
    return new Response(e instanceof Error ? e.message : "Unknown", { status: 500, headers: corsHeaders });
  }
});

