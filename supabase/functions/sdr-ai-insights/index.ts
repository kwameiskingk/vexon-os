import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { setterMetrics: rawSetterMetrics, timeRange, analysisType, leaveData: rawLeaveData } = await req.json();
    const AI_GATEWAY_API_KEY = Deno.env.get("AI_GATEWAY_API_KEY");
    if (!AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not configured");

    // Filter out test accounts that should never be considered by AI
    const isTestAccount = (name: string | undefined | null) => {
      if (!name) return false;
      const n = name.toLowerCase().trim();
      return n.includes("tommy test") || n === "tommy test";
    };
    const setterMetrics = (rawSetterMetrics || []).filter((s: any) => !isTestAccount(s?.name));
    const leaveData = (rawLeaveData || []).filter((l: any) => !isTestAccount(l?.full_name));

    let systemPrompt = "";
    let userPrompt = "";

    // Build leave context (shared across analysis types)
    const leaveContext = leaveData && leaveData.length > 0
      ? `\n\nEmployee Leave Status:\n${leaveData.map((l: any) => 
          `${l.full_name}: ON LEAVE (${l.reason}, ${l.status}) from ${l.leave_start_date} to ${l.return_date} (${l.leave_days_amount} days)`
        ).join('\n')}`
      : '';

    if (analysisType === "team_overview") {
      systemPrompt = `You are an expert SDR performance analyst for a recruitment company. Analyze the team's LIVE Close.io metrics (synced every 15 minutes) and provide concise, actionable insights. Keep under 150 words. Use bullet points. Focus on:
1. Who needs immediate attention and why
2. Top performers to recognize
3. One specific coaching recommendation referencing the live Close data (e.g. connect rate, quality conversations >3 min, dials, talk time)
4. If anyone is on leave, mention it and factor their absence into your analysis
Be direct and data-driven. Don't repeat raw numbers — interpret them.
IMPORTANT: Always use gender-neutral language (they/them/their).`;

      userPrompt = `Analyze this SDR team's performance for ${timeRange} using LIVE Close.io data:

${setterMetrics.map((s: any) =>
  `${s.name}: ${s.meetings} meetings (${s.meetingTrend > 0 ? '+' : ''}${Math.round(s.meetingTrend)}%), ${s.dials} dials (${s.dialsTrend > 0 ? '+' : ''}${Math.round(s.dialsTrend)}%), ${Math.round(s.talk_time)}min talk time (${s.talkTimeTrend > 0 ? '+' : ''}${Math.round(s.talkTimeTrend)}%), ${s.connects ?? 0} connects, ${s.connect_rate ?? 0}% connect rate, ${s.quality_convos ?? 0} convos >3min, Overall: ${s.compositeScore > 0 ? '+' : ''}${Math.round(s.compositeScore)}%`
).join('\n')}${leaveContext}

Provide a brief team health summary and specific action items.`;
    } else if (analysisType === "setter_detail") {
      systemPrompt = `You are an expert SDR coach analyzing individual setter performance from LIVE Close.io data. Provide a brief, personalized coaching insight in 2-3 sentences. Reference their actual numbers (dials, connect rate, quality conversations >3min, talk time, meetings). Be specific about what they should focus on next. If on leave, acknowledge it. IMPORTANT: Always use gender-neutral language (they/them/their).`;

      const s = setterMetrics[0];
      userPrompt = `Analyze this setter's LIVE Close.io performance over ${timeRange}:
Name: ${s.name}
Meetings: ${s.meetings} (${s.meetingTrend > 0 ? '+' : ''}${Math.round(s.meetingTrend)}%)
Dials: ${s.dials} (${s.dialsTrend > 0 ? '+' : ''}${Math.round(s.dialsTrend)}%)
Talk Time: ${Math.round(s.talk_time)} min (${s.talkTimeTrend > 0 ? '+' : ''}${Math.round(s.talkTimeTrend)}%)
Connects: ${s.connects ?? 0}
Connect Rate: ${s.connect_rate ?? 0}%
Quality Conversations (>3min): ${s.quality_convos ?? 0}
Overall composite: ${s.compositeScore > 0 ? '+' : ''}${Math.round(s.compositeScore)}%${leaveContext}

What should their manager focus on in their next 1-to-1?`;
    } else if (analysisType === "today_focus") {
      systemPrompt = `You are an SDR manager's AI assistant. Based on the team's LIVE Close.io daily metrics (synced every 15 minutes) and employee leave data, generate 2-3 prioritized action items for the manager. Each should be one sentence, actionable, and specific. Reference the live Close metrics (dials, connect rate, quality conversations >3min, talk time, meetings). Format as a JSON array of objects with "priority" (high/medium/low), "message", and "setter_name" fields. If anyone is on leave (approved or pending), ALWAYS include a focus item about it. IMPORTANT: Always use gender-neutral language (they/them/their).`;

      const todayLeaveContext = leaveContext || '\n\nEmployee Leave Status: No one is currently on leave.';

      userPrompt = `Today's LIVE Close.io team metrics:
${setterMetrics.map((s: any) =>
  `${s.name}: ${s.meetings_booked ?? s.meetings ?? 0} meetings, ${s.dials_made ?? s.dials ?? 0} dials, ${s.talk_time ?? 0}min talk time, ${s.connects ?? 0} connects, ${s.connect_rate ?? 0}% connect rate, ${s.quality_convos ?? 0} convos >3min, health: ${s.kpi_health ?? 'n/a'}`
).join('\n')}${todayLeaveContext}

Generate prioritized focus items for the manager.`;
    }

    const response = await fetch((Deno.env.get("AI_GATEWAY_URL") || "https://api.openai.com/v1/chat/completions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_GATEWAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI analysis unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "No insights available.";

    return new Response(JSON.stringify({ insight: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sdr-ai-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
