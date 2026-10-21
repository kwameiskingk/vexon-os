import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // ========== CSM REMINDERS (existing) ==========

    // 1. Find meetings happening in ~1 hour that haven't had reminder sent
    const { data: upcomingMeetings } = await supabase
      .from('meetings')
      .select('id, company_name, meeting_date, meeting_time, client_profile_id')
      .eq('client_accepted', true)
      .eq('csm_one_hour_reminder_sent', false)
      .neq('attendance_status', 'sat')
      .neq('attendance_status', 'cancelled');

    for (const meeting of upcomingMeetings || []) {
      const meetingDateTime = new Date(`${meeting.meeting_date}T${meeting.meeting_time}`);
      const timeDiff = meetingDateTime.getTime() - now.getTime();
      
      if (timeDiff > 50 * 60 * 1000 && timeDiff < 70 * 60 * 1000) {
        await supabase.from('notifications').insert({
          recipient_role: 'csm',
          title: 'Meeting Reminder - 1 Hour',
          message: `Reminder: ${meeting.company_name}'s meeting is in 1 hour at ${meeting.meeting_time?.slice(0, 5)}. Confirm they're attending.`,
          category: 'meeting',
          link_url: '/csm/dashboard'
        });

        await supabase.from('meetings').update({ csm_one_hour_reminder_sent: true }).eq('id', meeting.id);
      }
    }

    // 2. Find meetings that started ~10 minutes ago and need sat confirmation
    const { data: pastMeetings } = await supabase
      .from('meetings')
      .select('id, company_name, meeting_date, meeting_time')
      .eq('client_accepted', true)
      .eq('csm_sat_reminder_sent', false)
      .is('attendance_status', null);

    for (const meeting of pastMeetings || []) {
      const meetingDateTime = new Date(`${meeting.meeting_date}T${meeting.meeting_time}`);
      const timeSinceMeeting = now.getTime() - meetingDateTime.getTime();
      
      if (timeSinceMeeting > 8 * 60 * 1000 && timeSinceMeeting < 15 * 60 * 1000) {
        await supabase.from('notifications').insert({
          recipient_role: 'csm',
          title: 'Confirm Meeting Attendance',
          message: `Did ${meeting.company_name}'s meeting happen? Please confirm if it was sat.`,
          category: 'meeting',
          link_url: '/csm/dashboard'
        });

        await supabase.from('meetings').update({ csm_sat_reminder_sent: true }).eq('id', meeting.id);
      }
    }

    // ========== AE DISCOVERY CALL REMINDERS ==========

    // 3. Morning notification: Acquisition meetings booked for today that AE hasn't been notified about yet
    const { data: todayDiscoveryCalls } = await supabase
      .from('meetings')
      .select('id, company_name, meeting_time, prospect_name')
      .eq('department', 'acquisition')
      .eq('meeting_date', todayStr)
      .eq('ae_today_reminder_sent', false)
      .is('attendance_status', null);

    for (const meeting of todayDiscoveryCalls || []) {
      const timeStr = meeting.meeting_time?.slice(0, 5) || 'TBD';
      
      await supabase.from('notifications').insert({
        recipient_role: 'account_executive',
        title: '📞 Discovery Call Today',
        message: `You have a discovery call with ${meeting.prospect_name || meeting.company_name} today at ${timeStr}. Prepare and be ready.`,
        category: 'meeting',
        link_url: '/ae/discovery-calls'
      });

      await supabase.from('meetings').update({ ae_today_reminder_sent: true }).eq('id', meeting.id);
    }

    // 4. Post-meeting reminder: Acquisition meetings whose time has passed but outcome not recorded
    const { data: pendingOutcomeMeetings } = await supabase
      .from('meetings')
      .select('id, company_name, meeting_date, meeting_time, prospect_name')
      .eq('department', 'acquisition')
      .eq('ae_outcome_reminder_sent', false)
      .is('attendance_status', null);

    for (const meeting of pendingOutcomeMeetings || []) {
      const meetingDateTime = new Date(`${meeting.meeting_date}T${meeting.meeting_time}`);
      const timeSinceMeeting = now.getTime() - meetingDateTime.getTime();
      
      // Send reminder 15 minutes after the meeting time
      if (timeSinceMeeting > 15 * 60 * 1000) {
        await supabase.from('notifications').insert({
          recipient_role: 'account_executive',
          title: '⚠️ Complete Discovery Call Outcome',
          message: `Your call with ${meeting.prospect_name || meeting.company_name} has passed. Please mark the outcome (Sat, No Show, Rescheduled, or Cancelled) now.`,
          category: 'meeting',
          link_url: '/ae/discovery-calls'
        });

        await supabase.from('meetings').update({ ae_outcome_reminder_sent: true }).eq('id', meeting.id);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
