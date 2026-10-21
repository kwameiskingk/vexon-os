import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiGatewayKey = Deno.env.get("AI_GATEWAY_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { record_id } = await req.json();

    if (!record_id) {
      return new Response(
        JSON.stringify({ error: "record_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: record, error: fetchError } = await supabase
      .from("pre_disco_research")
      .select("*")
      .eq("id", record_id)
      .single();

    if (fetchError || !record) {
      return new Response(
        JSON.stringify({ error: "Record not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await supabase
      .from("pre_disco_research")
      .update({ status: "generating" })
      .eq("id", record_id);

    try {
      const companyContext = record.company_name
        ? `Company: ${record.company_name}. Website: ${record.company_website}.`
        : `Website: ${record.company_website}.`;

      const aiResponse = await fetch(
        (Deno.env.get("AI_GATEWAY_URL") || "https://api.openai.com/v1/chat/completions"),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${aiGatewayKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-5.2",
            messages: [
              {
                role: "system",
                content:
                  'You are a B2B sales research assistant specializing in recruitment industry analysis. Use the provided company website (and name if given) to generate research. If no company name is provided, infer it from the website. Return ONLY valid JSON with no markdown formatting, no code blocks, no extra text. The JSON must have these exact keys: "company_name" (string - the company name you identified), "company_summary" (string - 2-3 sentence overview), "products_services" (array of strings), "industry" (string), "target_audience" (string), "likely_pain_points" (array of strings), "discovery_questions" (array of 8 strings - tailored to their business), "personalization_angles" (array of strings).',
              },
              {
                role: "user",
                content: `${companyContext} Generate structured JSON research for a pre-discovery sales call. Include: company name (infer from website if not provided), company summary, products/services offered, industry classification, target audience, likely pain points they face, 8 tailored discovery questions, and personalization angles for the call.`,
              },
            ],
            reasoning: { effort: "medium" },
          }),
        }
      );

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        throw new Error(`AI API error: ${aiResponse.status} - ${errorText}`);
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("No content in AI response");
      }

      let researchJson;
      try {
        researchJson = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          researchJson = JSON.parse(jsonMatch[1].trim());
        } else {
          const objectMatch = content.match(/\{[\s\S]*\}/);
          if (objectMatch) {
            researchJson = JSON.parse(objectMatch[0]);
          } else {
            throw new Error("Could not parse JSON from AI response");
          }
        }
      }

      // If company name was not provided, update it from AI response
      const updateData: Record<string, unknown> = {
        research_json: researchJson,
        status: "complete",
      };
      if (!record.company_name && researchJson.company_name) {
        updateData.company_name = researchJson.company_name;
      }

      await supabase
        .from("pre_disco_research")
        .update(updateData)
        .eq("id", record_id);

      return new Response(
        JSON.stringify({ success: true, research: researchJson }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (aiError: any) {
      await supabase
        .from("pre_disco_research")
        .update({
          status: "failed",
          error_message: aiError.message || "Unknown error",
        })
        .eq("id", record_id);

      return new Response(
        JSON.stringify({ error: aiError.message || "Research generation failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
