import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("🔍 Starting automatic badge detection...");

    // Get current month's performance data
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    
    const { data: performanceData, error: perfError } = await supabase
      .from("performance")
      .select("*")
      .gte("date", monthStart);

    if (perfError) throw perfError;

    // Get setter profiles for department info
    const { data: settersProfiles, error: profilesError } = await supabase
      .from("setters_profiles")
      .select("*")
      .eq("active", true);

    if (profilesError) throw profilesError;

    // Get existing achievements to avoid duplicates
    const { data: existingAchievements, error: achError } = await supabase
      .from("leaderboard_achievements")
      .select("email, achievement_key")
      .gte("date_awarded", monthStart);

    if (achError) throw achError;

    // department='sales' rows are AE telemetry profiles (Close-ID keying
    // only) — never badge candidates, even if performance rows exist for them.
    const salesEmails = new Set(
      (settersProfiles || [])
        .filter((sp) => sp.department === 'sales')
        .map((sp) => sp.email?.toLowerCase())
        .filter(Boolean),
    );

    // Aggregate performance by email
    const aggregated: Record<string, any> = {};
    performanceData?.forEach((row) => {
      const email = row.email?.toLowerCase();
      if (!email) return;
      if (salesEmails.has(email)) return;

      if (!aggregated[email]) {
        const profile = settersProfiles?.find(sp => sp.email?.toLowerCase() === email);
        aggregated[email] = {
          email,
          name: profile?.full_name || email,
          department: profile?.department || 'fulfillment',
          meetings_booked: 0,
          dials_made: 0,
          conversations: 0,
          talk_time_seconds: 0,
        };
      }

      aggregated[email].meetings_booked += row.meetings_booked || 0;
      aggregated[email].dials_made += row.dials_made || 0;
      aggregated[email].conversations += row.conversations || 0;
      aggregated[email].talk_time_seconds += row.call_duration_seconds || 0;
    });

    // Sort by meetings to get rankings
    const sorted = Object.values(aggregated).sort((a: any, b: any) => {
      if (b.meetings_booked !== a.meetings_booked) return b.meetings_booked - a.meetings_booked;
      if (b.dials_made !== a.dials_made) return b.dials_made - a.dials_made;
      return 0;
    });

    const proposals: any[] = [];

    // Badge criteria
    sorted.forEach((setter: any, index: number) => {
      const rank = index + 1;
      const hasExisting = (key: string) => 
        existingAchievements?.some(a => 
          a.email?.toLowerCase() === setter.email && a.achievement_key === key
        );

      // Power Booker: Top 3 in meetings (10+ meetings)
      if (rank <= 3 && setter.meetings_booked >= 10 && !hasExisting('power_booker')) {
        proposals.push({
          email: setter.email,
          achievement_key: 'power_booker',
          reason: `Ranked #${rank} this month with ${setter.meetings_booked} meetings booked`,
          criteria_met: { rank, meetings_booked: setter.meetings_booked }
        });
      }

      // Elite Closer: High conversion rate (5%+ conversion with 100+ calls)
      const conversionRate = setter.dials_made > 0 ? (setter.meetings_booked / setter.dials_made) * 100 : 0;
      if (conversionRate >= 5 && setter.dials_made >= 100 && !hasExisting('elite_closer')) {
        proposals.push({
          email: setter.email,
          achievement_key: 'elite_closer',
          reason: `${conversionRate.toFixed(1)}% conversion rate with ${setter.dials_made} calls`,
          criteria_met: { conversion_rate: conversionRate, dials_made: setter.dials_made }
        });
      }

      // Machine Mode: 500+ calls this month
      if (setter.dials_made >= 500 && !hasExisting('machine_mode')) {
        proposals.push({
          email: setter.email,
          achievement_key: 'machine_mode',
          reason: `Made ${setter.dials_made} calls this month`,
          criteria_met: { dials_made: setter.dials_made }
        });
      }

      // Lead Magnet: Most conversations (20+ conversations)
      if (setter.conversations >= 20 && !hasExisting('lead_magnet')) {
        const isTopInConversations = sorted.every((other: any) => 
          other.email === setter.email || other.conversations <= setter.conversations
        );
        if (isTopInConversations) {
          proposals.push({
            email: setter.email,
            achievement_key: 'lead_magnet',
            reason: `Generated ${setter.conversations} warm leads this month`,
            criteria_met: { conversations: setter.conversations }
          });
        }
      }

      // Rising Star: Rank 4-10 with 5+ meetings
      if (rank >= 4 && rank <= 10 && setter.meetings_booked >= 5 && !hasExisting('rising_star')) {
        proposals.push({
          email: setter.email,
          achievement_key: 'rising_star',
          reason: `Ranked #${rank} with ${setter.meetings_booked} meetings - showing strong potential`,
          criteria_met: { rank, meetings_booked: setter.meetings_booked }
        });
      }
    });

    console.log(`📋 Found ${proposals.length} badge proposals`);

    // Check for existing pending proposals to avoid duplicates
    const { data: existingPending, error: pendingError } = await supabase
      .from("pending_badge_proposals")
      .select("email, achievement_key")
      .eq("status", "pending");

    if (pendingError) throw pendingError;

    // Filter out proposals that are already pending
    const newProposals = proposals.filter(p => 
      !existingPending?.some(ep => 
        ep.email?.toLowerCase() === p.email && ep.achievement_key === p.achievement_key
      )
    );

    if (newProposals.length > 0) {
      const { error: insertError } = await supabase
        .from("pending_badge_proposals")
        .insert(newProposals);

      if (insertError) throw insertError;
      console.log(`✅ Inserted ${newProposals.length} new badge proposals`);
    } else {
      console.log("ℹ️ No new proposals to insert");
    }

    return new Response(
      JSON.stringify({
        success: true,
        proposals_generated: proposals.length,
        new_proposals: newProposals.length,
        message: `Badge detection complete. ${newProposals.length} new proposals created.`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Error in badge detection:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
