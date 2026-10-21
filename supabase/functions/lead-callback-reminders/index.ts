import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today's date and tomorrow's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Find leads with callback dates today or tomorrow
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select(`
        id,
        company_name,
        contact_name,
        callback_date,
        callback_time,
        setter_id,
        setters_profiles!leads_setter_id_fkey(full_name, email)
      `)
      .in('callback_date', [todayStr, tomorrowStr])
      .eq('status', 'new');

    if (leadsError) throw leadsError;

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No callbacks scheduled for today or tomorrow' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create notifications for each lead
    const notifications = leads.map(lead => {
      const isToday = lead.callback_date === todayStr;
      const timeStr = lead.callback_time ? ` at ${lead.callback_time}` : '';
      
      return {
        recipient_role: 'setter',
        recipient_id: lead.setter_id,
        title: isToday ? 'Callback Due Today!' : 'Callback Due Tomorrow',
        message: `Follow up with ${lead.contact_name} from ${lead.company_name}${timeStr}`,
        category: 'warm_lead',
        link_url: '/setter/warm-leads',
        triggered_by: lead.setter_id
      };
    });

    const { error: notificationError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (notificationError) throw notificationError;

    return new Response(
      JSON.stringify({ 
        message: `Created ${notifications.length} callback reminders`,
        count: notifications.length 
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in lead-callback-reminders:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});