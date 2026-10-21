import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("🏆 Starting achievement progress calculation...");

    // 1. Read achievement data source setting
    const { data: settings } = await supabase
      .from("system_settings")
      .select("achievement_data_source")
      .limit(1)
      .single();

    const dataSource = settings?.achievement_data_source || "auto";
    console.log(`📊 Data source: ${dataSource}`);

    // 2. Fetch active achievement definitions (setter only for now)
    const { data: definitions, error: defErr } = await supabase
      .from("achievement_definitions")
      .select("*")
      .eq("is_active", true);

    if (defErr) throw defErr;
    if (!definitions?.length) {
      return new Response(JSON.stringify({ success: true, message: "No active definitions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Fetch active setters. department='sales' rows are AE telemetry
    // profiles (Close-ID keying only) — never achievement subjects.
    const { data: setters, error: setErr } = await supabase
      .from("setters_profiles")
      .select("id, user_id, email, full_name, department, weekly_meetings_target, daily_dials_target")
      .eq("active", true)
      .neq("department", "sales");

    if (setErr) throw setErr;
    if (!setters?.length) {
      return new Response(JSON.stringify({ success: true, message: "No active setters" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Determine date ranges
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const weekStart = getWeekStart(now).toISOString().split("T")[0];
    const today = now.toISOString().split("T")[0];

    // 5. Fetch performance data (always needed for dials, talk_time)
    const { data: perfData, error: perfErr } = await supabase
      .from("performance")
      .select("*")
      .gte("date", monthStart);

    if (perfErr) throw perfErr;

    // 6. Fetch meetings data (for manual mode)
    let meetingsData: any[] = [];
    if (dataSource === "manual") {
      const { data: mtgs, error: mtgErr } = await supabase
        .from("meetings")
        .select("id, setter_id, logged_by_setter_id, meeting_date, attendance_status, setter_profile_id")
        .gte("meeting_date", monthStart);

      if (mtgErr) throw mtgErr;
      meetingsData = mtgs || [];
    }

    // 7. Build per-setter aggregated data
    const setterMetrics: Record<string, SetterMetrics> = {};

    for (const setter of setters) {
      const email = setter.email?.toLowerCase();
      if (!email || !setter.user_id) continue;

      const metrics: SetterMetrics = {
        user_id: setter.user_id,
        email,
        department: setter.department || "fulfilment",
        meetings_target: setter.weekly_meetings_target || 2,
        daily_dials_target: setter.daily_dials_target || 150,
        // Monthly aggregates
        monthly_dials: 0,
        monthly_meetings_booked: 0,
        monthly_sat_meetings: 0,
        monthly_conversations: 0,
        monthly_talk_time: 0,
        // Weekly aggregates
        weekly_dials: 0,
        weekly_meetings_booked: 0,
        // Daily data for streaks
        daily: {} as Record<string, DailyData>,
        // Previous week for improvement
        prev_week_meetings: 0,
      };

      // Performance table data (dials, talk_time, conversations - always from perf)
      const setterPerf = (perfData || []).filter(
        (r: any) => r.email?.toLowerCase() === email || r.setter_id === setter.user_id
      );

      for (const row of setterPerf) {
        const date = row.date;
        const dials = row.dials_made || 0;
        const meetings = row.meetings_booked || 0;
        const sat = row.sat_meetings || 0;
        const convos = row.conversations || 0;
        const talkTime = row.talk_time || row.call_duration_seconds || 0;

        metrics.monthly_dials += dials;
        metrics.monthly_conversations += convos;
        metrics.monthly_talk_time += talkTime;

        if (date >= weekStart) {
          metrics.weekly_dials += dials;
        }

        if (!metrics.daily[date]) {
          metrics.daily[date] = { dials: 0, meetings_booked: 0, sat_meetings: 0 };
        }
        metrics.daily[date].dials += dials;

        // For auto mode, meetings come from performance table
        if (dataSource === "auto") {
          metrics.monthly_meetings_booked += meetings;
          metrics.monthly_sat_meetings += sat;
          if (date >= weekStart) {
            metrics.weekly_meetings_booked += meetings;
          }
          metrics.daily[date].meetings_booked += meetings;
          metrics.daily[date].sat_meetings += sat;
        }
      }

      // For manual mode, meetings come from meetings table
      if (dataSource === "manual") {
        const setterMeetings = meetingsData.filter(
          (m: any) => m.setter_id === setter.user_id || m.logged_by_setter_id === setter.user_id
        );

        for (const mtg of setterMeetings) {
          const date = mtg.meeting_date;
          metrics.monthly_meetings_booked += 1;
          if (mtg.attendance_status === "sat") {
            metrics.monthly_sat_meetings += 1;
          }
          if (date >= weekStart) {
            metrics.weekly_meetings_booked += 1;
          }
          if (!metrics.daily[date]) {
            metrics.daily[date] = { dials: 0, meetings_booked: 0, sat_meetings: 0 };
          }
          metrics.daily[date].meetings_booked += 1;
          if (mtg.attendance_status === "sat") {
            metrics.daily[date].sat_meetings += 1;
          }
        }
      }

      // Previous week meetings for improvement calc
      const prevWeekStart = getPrevWeekStart(now).toISOString().split("T")[0];
      const prevWeekEnd = getWeekStart(now);
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
      const prevWeekEndStr = prevWeekEnd.toISOString().split("T")[0];

      if (dataSource === "auto") {
        metrics.prev_week_meetings = setterPerf
          .filter((r: any) => r.date >= prevWeekStart && r.date <= prevWeekEndStr)
          .reduce((sum: number, r: any) => sum + (r.meetings_booked || 0), 0);
      } else {
        metrics.prev_week_meetings = meetingsData.filter(
          (m: any) =>
            (m.setter_id === setter.user_id || m.logged_by_setter_id === setter.user_id) &&
            m.meeting_date >= prevWeekStart &&
            m.meeting_date <= prevWeekEndStr
        ).length;
      }

      setterMetrics[email] = metrics;
    }

    // 8. Calculate progress for each setter × definition
    const upserts: any[] = [];
    const newAwards: any[] = [];

    // Get existing awards this month to avoid duplicates
    const { data: existingAwards } = await supabase
      .from("leaderboard_achievements")
      .select("email, achievement_key, achievement_definition_id")
      .gte("date_awarded", monthStart);

    const awardedSet = new Set(
      (existingAwards || []).map((a: any) => `${a.email?.toLowerCase()}|${a.achievement_definition_id || a.achievement_key}`)
    );

    for (const setter of Object.values(setterMetrics)) {
      for (const def of definitions) {
        // Check role match
        if (def.target_role !== "setter" && def.target_role !== "all") continue;

        // Check department match
        if (def.target_department && def.target_department !== setter.department) continue;

        const criteria = def.criteria as any;
        if (!criteria || !criteria.type) continue;

        let currentProgress = 0;
        let targetValue = 0;

        switch (criteria.type) {
          case "cumulative": {
            const metric = criteria.metric;
            const period = criteria.period || "month";
            targetValue = criteria.threshold || criteria.threshold_pct || 0;

            // If threshold_pct, it's a percentage of the setter's target
            if (criteria.threshold_pct && metric === "meetings_booked") {
              targetValue = Math.ceil((setter.meetings_target * criteria.threshold_pct) / 100);
            }

            if (period === "week") {
              currentProgress = getMetricValue(setter, metric, "week");
            } else {
              currentProgress = getMetricValue(setter, metric, "month");
            }
            break;
          }

          case "streak": {
            const metric = criteria.metric;
            targetValue = criteria.threshold || 3;
            const minValue = criteria.min_value || 1;
            const compareToTarget = criteria.compare_to_target || false;

            // Calculate streak from daily data
            const dates = Object.keys(setter.daily).sort();
            let maxStreak = 0;
            let currentStreak = 0;

            for (const date of dates) {
              const dayData = setter.daily[date];
              let metricVal = 0;

              if (metric === "meetings_booked") metricVal = dayData.meetings_booked;
              else if (metric === "dials_made") metricVal = dayData.dials;
              else if (metric === "sat_meetings") metricVal = dayData.sat_meetings;

              let threshold = minValue;
              if (compareToTarget && metric === "dials_made") {
                threshold = setter.daily_dials_target || 150;
              }

              if (metricVal >= threshold) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
              } else {
                currentStreak = 0;
              }
            }

            currentProgress = maxStreak;
            break;
          }

          case "rate": {
            const metric = criteria.metric;
            targetValue = criteria.threshold || 70;
            const minMeetings = criteria.min_meetings || 3;

            if (metric === "show_rate") {
              if (setter.monthly_meetings_booked >= minMeetings) {
                currentProgress =
                  setter.monthly_meetings_booked > 0
                    ? Math.round((setter.monthly_sat_meetings / setter.monthly_meetings_booked) * 100)
                    : 0;
              }
            }
            break;
          }

          case "improvement": {
            targetValue = criteria.improvement_pct || 25;
            const metric = criteria.metric;

            if (metric === "meetings_booked" && setter.prev_week_meetings > 0) {
              const weeklyMeetings = setter.weekly_meetings_booked;
              const improvementPct = Math.round(
                ((weeklyMeetings - setter.prev_week_meetings) / setter.prev_week_meetings) * 100
              );
              currentProgress = Math.max(0, improvementPct);
            }
            break;
          }
        }

        if (targetValue <= 0) continue;

        const progressPct = Math.min(100, Math.round((currentProgress / targetValue) * 100));

        upserts.push({
          user_id: setter.user_id,
          email: setter.email,
          achievement_definition_id: def.id,
          current_progress: currentProgress,
          target_value: targetValue,
          last_updated: new Date().toISOString(),
        });

        // Auto-award if 100%
        if (progressPct >= 100) {
          const awardKey = `${setter.email}|${def.id}`;
          if (!awardedSet.has(awardKey)) {
            newAwards.push({
              email: setter.email,
              achievement_key: def.key,
              achievement_definition_id: def.id,
              date_awarded: today,
            });
            awardedSet.add(awardKey);
          }
        }
      }
    }

    // 9. Upsert progress
    let progressUpdated = 0;
    if (upserts.length > 0) {
      // Batch upsert in chunks of 50
      for (let i = 0; i < upserts.length; i += 50) {
        const chunk = upserts.slice(i, i + 50);
        const { error: upsertErr } = await supabase
          .from("user_achievement_progress")
          .upsert(chunk, { onConflict: "user_id,achievement_definition_id" });

        if (upsertErr) {
          console.error("Upsert error:", upsertErr);
        } else {
          progressUpdated += chunk.length;
        }
      }
    }

    // 10. Insert new awards
    let awardsInserted = 0;
    if (newAwards.length > 0) {
      const { error: awardErr } = await supabase
        .from("leaderboard_achievements")
        .insert(newAwards);

      if (awardErr) {
        console.error("Award insert error:", awardErr);
      } else {
        awardsInserted = newAwards.length;
      }
    }

    console.log(`✅ Done: ${progressUpdated} progress records, ${awardsInserted} new awards`);

    return new Response(
      JSON.stringify({
        success: true,
        data_source: dataSource,
        setters_processed: Object.keys(setterMetrics).length,
        progress_updated: progressUpdated,
        awards_inserted: awardsInserted,
        definitions_evaluated: definitions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- Helper types and functions ---

interface DailyData {
  dials: number;
  meetings_booked: number;
  sat_meetings: number;
}

interface SetterMetrics {
  user_id: string;
  email: string;
  department: string;
  meetings_target: number;
  daily_dials_target: number;
  monthly_dials: number;
  monthly_meetings_booked: number;
  monthly_sat_meetings: number;
  monthly_conversations: number;
  monthly_talk_time: number;
  weekly_dials: number;
  weekly_meetings_booked: number;
  daily: Record<string, DailyData>;
  prev_week_meetings: number;
}

function getMetricValue(setter: SetterMetrics, metric: string, period: string): number {
  switch (metric) {
    case "dials_made":
      return period === "week" ? setter.weekly_dials : setter.monthly_dials;
    case "meetings_booked":
      return period === "week" ? setter.weekly_meetings_booked : setter.monthly_meetings_booked;
    case "sat_meetings":
      return setter.monthly_sat_meetings;
    case "conversations":
      return setter.monthly_conversations;
    case "talk_time":
      return setter.monthly_talk_time;
    default:
      return 0;
  }
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPrevWeekStart(date: Date): Date {
  const ws = getWeekStart(date);
  ws.setDate(ws.getDate() - 7);
  return ws;
}
