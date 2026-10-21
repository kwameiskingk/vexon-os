import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find meetings that:
    // 1. Are approved by admin (approved_by_admin = true)
    // 2. Client hasn't accepted or rejected
    // 3. Meeting date + time has passed by more than 24 hours
    // 4. Not sat or cancelled

    const { data: meetings, error: fetchError } = await supabase
      .from("meetings")
      .select("id, company_name, prospect_name, meeting_date, meeting_time, department")
      .eq("approved_by_admin", true)
      .is("client_accepted", null)
      .not("status", "eq", "client_accepted")
      .not("status", "eq", "client_rejected")
      .not("status", "eq", "rejected")
      .not("status", "eq", "cancelled")
      .not("status", "eq", "declined")
      .is("attendance_status", null)
      .neq("department", "sales");

    if (fetchError) {
      console.error("Error fetching meetings:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!meetings || meetings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No meetings to auto-accept", count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let acceptedCount = 0;
    const now = new Date();

    for (const meeting of meetings) {
      // Calculate meeting datetime + 24 hours
      const meetingDateTime = new Date(`${meeting.meeting_date}T${meeting.meeting_time || '00:00:00'}`);
      const deadline = new Date(meetingDateTime.getTime() + 24 * 60 * 60 * 1000);
      
      if (now < deadline) {
        continue; // Not yet 24 hours after the meeting date/time
      }

      const { error: updateError } = await supabase
        .from("meetings")
        .update({
          client_accepted: true,
          accepted_by_client: true,
          status: "client_accepted",
        })
        .eq("id", meeting.id);

      if (updateError) {
        console.error(`Failed to auto-accept meeting ${meeting.id}:`, updateError);
      } else {
        acceptedCount++;
        console.log(`Auto-accepted meeting ${meeting.id} (${meeting.company_name}) - 24h after meeting date passed without client response`);

        await supabase.from("admin_activity_log").insert({
          action: "meeting_auto_accepted",
          details: {
            meeting_id: meeting.id,
            company_name: meeting.company_name,
            reason: "Client did not accept or decline within 24 hours after the meeting date/time",
          },
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, count: acceptedCount, total: meetings.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in auto-accept-pending:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
