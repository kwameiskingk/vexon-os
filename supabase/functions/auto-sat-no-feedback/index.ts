// Auto-mark a meeting as sat when the client has given no feedback within
// 12 hours of the meeting time (the client contract, Marcus, 8 Sep).
//
// Until 11 Sep this sweep lived in the client portal's Meetings page and only
// ran when a client opened it, so a client who never logged in never
// triggered it. It now runs on the server every hour (pg_cron, migration
// 20260911130000) with exactly the same rule and wording.
//
// meeting_date / meeting_time are London wall-clock (booking-flow writes
// them with utcToZonedParts(…, "Europe/London")), so the 12-hour clock is
// measured from that instant, whatever the client's own timezone.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { zonedTimeToUtc } from "../_shared/google-calendar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUSINESS_TZ = "Europe/London";
const GRACE_MS = 12 * 60 * 60 * 1000;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Anything the client could still give feedback on: approved, dated on or
    // before today, no outcome yet, not declined, no feedback submitted.
    const today = new Date().toISOString().slice(0, 10);
    const { data: meetings, error } = await supabase
      .from("meetings")
      .select("id, company_name, meeting_date, meeting_time, attendance_status, status, client_feedback_submitted_at")
      .eq("approved_by_admin", true)
      .lte("meeting_date", today)
      .is("client_feedback_submitted_at", null)
      .or("attendance_status.is.null,attendance_status.not.in.(sat,cancelled)")
      .or("status.is.null,status.neq.client_rejected");

    if (error) {
      console.error("[auto-sat-no-feedback] fetch:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    const due: string[] = [];
    for (const m of meetings ?? []) {
      if (!m.meeting_date) continue;
      const time = String(m.meeting_time || "00:00:00").slice(0, 5);
      const at = zonedTimeToUtc(m.meeting_date, time, BUSINESS_TZ).getTime();
      if (now - at >= GRACE_MS) due.push(m.id);
    }

    let updated = 0;
    if (due.length > 0) {
      const { error: upErr, count } = await supabase
        .from("meetings")
        .update({
          attendance_status: "sat",
          client_feedback_sat: true,
          client_feedback_submitted_at: new Date().toISOString(),
          client_feedback_comments: "Auto-marked as sat (no feedback within 12 hours)",
        }, { count: "exact" })
        .in("id", due);
      if (upErr) {
        console.error("[auto-sat-no-feedback] update:", upErr);
        return new Response(JSON.stringify({ error: upErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      updated = count ?? due.length;
      console.log(`[auto-sat-no-feedback] marked ${updated} meeting(s) as sat`);
    }

    return new Response(JSON.stringify({ success: true, checked: meetings?.length ?? 0, marked_sat: updated }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[auto-sat-no-feedback]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
