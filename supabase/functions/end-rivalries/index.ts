import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const today = new Date().toISOString().split('T')[0];

    // Find all rivalries that should end today
    const { data: endingRivalries, error: fetchError } = await supabaseClient
      .from('setters_profiles')
      .select('*')
      .eq('rivalry_end_date', today)
      .not('rival_email', 'is', null);

    if (fetchError) throw fetchError;

    if (!endingRivalries || endingRivalries.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No rivalries to end today' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // For each ending rivalry, determine the winner
    for (const rivalry of endingRivalries) {
      // Get the rival's profile for their user_id (for targeted notifications)
      const { data: rivalProfile } = await supabaseClient
        .from('setters_profiles')
        .select('user_id, full_name')
        .eq('email', rivalry.rival_email)
        .single();

      // Get performance data for both setters
      const { data: performanceData } = await supabaseClient
        .from('performance')
        .select('email, meetings_booked')
        .in('email', [rivalry.email, rivalry.rival_email])
        .gte('date', rivalry.rivalry_started_at?.split('T')[0] || today)
        .lte('date', today);

      // Calculate total meetings for each setter
      const userMeetings = performanceData
        ?.filter(p => p.email === rivalry.email)
        .reduce((sum, p) => sum + (p.meetings_booked || 0), 0) || 0;

      const rivalMeetings = performanceData
        ?.filter(p => p.email === rivalry.rival_email)
        .reduce((sum, p) => sum + (p.meetings_booked || 0), 0) || 0;

      const winnerEmail = userMeetings > rivalMeetings ? rivalry.email : 
                          rivalMeetings > userMeetings ? rivalry.rival_email : 
                          null; // Tie

      const clearRivalryData = {
        rival_email: null,
        rivalry_started_at: null,
        rivalry_end_pending: false,
        rivalry_end_date: null,
        rivalry_reward_amount: null,
        rivalry_reward_type: null,
        rivalry_reward_set_by: null,
        last_rivalry_winner_email: winnerEmail,
        last_rivalry_ended_at: new Date().toISOString()
      };

      // Update BOTH setters' profiles to clear rivalry
      await supabaseClient
        .from('setters_profiles')
        .update(clearRivalryData)
        .eq('email', rivalry.email);

      await supabaseClient
        .from('setters_profiles')
        .update(clearRivalryData)
        .eq('email', rivalry.rival_email);

      // Build targeted notifications with recipient_id
      const notifications: any[] = [];
      
      if (winnerEmail) {
        const winnerUserId = winnerEmail === rivalry.email ? rivalry.user_id : rivalProfile?.user_id;
        const loserUserId = winnerEmail === rivalry.email ? rivalProfile?.user_id : rivalry.user_id;
        const winnerMeetings = winnerEmail === rivalry.email ? userMeetings : rivalMeetings;
        const loserMeetings = winnerEmail === rivalry.email ? rivalMeetings : userMeetings;

        // Notify winner
        if (winnerUserId) {
          notifications.push({
            recipient_id: winnerUserId,
            recipient_role: 'setter',
            title: '🏆 Rivalry Won!',
            message: `Congratulations! You won the rivalry${rivalry.rivalry_reward_amount ? ` and $${rivalry.rivalry_reward_amount}` : ''}! You booked ${winnerMeetings} meetings vs ${loserMeetings}.`,
            category: 'system',
            link_url: '/setter'
          });
        }

        // Notify loser
        if (loserUserId) {
          notifications.push({
            recipient_id: loserUserId,
            recipient_role: 'setter',
            title: 'Rivalry Ended',
            message: `The rivalry has ended. Better luck next time! Your rival booked ${winnerMeetings} meetings vs your ${loserMeetings}.`,
            category: 'system',
            link_url: '/setter'
          });
        }
      } else {
        // Notify both about tie
        if (rivalry.user_id) {
          notifications.push({
            recipient_id: rivalry.user_id,
            recipient_role: 'setter',
            title: 'Rivalry Ended in a Tie',
            message: `The rivalry ended in a tie! Both of you booked ${userMeetings} meetings.`,
            category: 'system',
            link_url: '/setter'
          });
        }
        if (rivalProfile?.user_id) {
          notifications.push({
            recipient_id: rivalProfile.user_id,
            recipient_role: 'setter',
            title: 'Rivalry Ended in a Tie',
            message: `The rivalry ended in a tie! Both of you booked ${userMeetings} meetings.`,
            category: 'system',
            link_url: '/setter'
          });
        }
      }

      // Insert all notifications at once
      if (notifications.length > 0) {
        await supabaseClient.from('notifications').insert(notifications);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: `Processed ${endingRivalries.length} rivalry endings`,
        count: endingRivalries.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error ending rivalries:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
