// deno-lint-ignore-file no-explicit-any
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, channel } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ sentiment: "unclassified" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const trimmed = text.replace(/<[^>]+>/g, " ").trim().slice(0, 1200);
    if (!trimmed) {
      return new Response(JSON.stringify({ sentiment: "unclassified" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
    if (!apiKey) throw new Error("AI_GATEWAY_API_KEY missing");

    const prompt = `Classify the following ${channel || "cold outbound"} reply into EXACTLY one of:
positive, interested, more_info, not_interested, ooo.
Return ONLY the label, no punctuation, no extra words.

Reply:
"""${trimmed}"""`;

    const aiRes = await fetch((Deno.env.get("AI_GATEWAY_URL") || "https://api.openai.com/v1/chat/completions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a strict classifier. Output exactly one label from the allowed list, lowercase, no punctuation." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ sentiment: "unclassified", error: t }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const aiData = await aiRes.json();
    const raw = (aiData?.choices?.[0]?.message?.content || "").toLowerCase().trim();
    const allowed = ["positive", "interested", "more_info", "not_interested", "ooo"];
    const match = allowed.find((a) => raw.includes(a)) || "unclassified";

    return new Response(JSON.stringify({ sentiment: match }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ sentiment: "unclassified", error: e.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
