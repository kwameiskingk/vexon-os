import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

    console.log('Checking for payment reminders...', { today, tomorrow })

    // Get payments due tomorrow (1-day reminder)
    const { data: dueTomorrow, error: tomorrowError } = await supabase
      .from('client_payments')
      .select(`
        *,
        clients!client_id (
          company_name,
          email,
          contact_name
        )
      `)
      .eq('next_payment_date', tomorrow)
      .eq('status', 'pending')

    if (tomorrowError) {
      console.error('Error fetching tomorrow payments:', tomorrowError)
      throw tomorrowError
    }

    // Get payments due today
    const { data: dueToday, error: todayError } = await supabase
      .from('client_payments')
      .select(`
        *,
        clients!client_id (
          company_name,
          email,
          contact_name
        )
      `)
      .eq('next_payment_date', today)
      .eq('status', 'pending')

    if (todayError) {
      console.error('Error fetching today payments:', todayError)
      throw todayError
    }

    console.log('Found payments:', {
      dueTomorrow: dueTomorrow?.length || 0,
      dueToday: dueToday?.length || 0
    })

    // Get all admin users to notify
    const { data: adminRoles, error: adminError } = await supabase
      .from('user_roles')
      .select('user_id, profiles!user_id(email)')
      .eq('role', 'admin')

    if (adminError) {
      console.error('Error fetching admins:', adminError)
      throw adminError
    }

    const notifications = []

    // Create notifications for tomorrow's due payments
    if (dueTomorrow && dueTomorrow.length > 0) {
      for (const payment of dueTomorrow) {
        for (const admin of adminRoles || []) {
          notifications.push({
            type: 'payment_reminder_1day',
            client_id: payment.client_id,
            payment_id: payment.id,
            admin_user_id: admin.user_id,
            message: `Payment due tomorrow for ${payment.clients.company_name} - Amount: $${payment.amount}`,
            created_at: new Date().toISOString()
          })
        }
      }
    }

    // Create notifications for today's due payments
    if (dueToday && dueToday.length > 0) {
      for (const payment of dueToday) {
        for (const admin of adminRoles || []) {
          notifications.push({
            type: 'payment_due_today',
            client_id: payment.client_id,
            payment_id: payment.id,
            admin_user_id: admin.user_id,
            message: `Payment DUE TODAY for ${payment.clients.company_name} - Amount: $${payment.amount}`,
            created_at: new Date().toISOString()
          })
        }
      }
    }

    console.log('Created notifications:', notifications.length)

    return new Response(
      JSON.stringify({
        success: true,
        reminders_1day: dueTomorrow?.length || 0,
        reminders_today: dueToday?.length || 0,
        notifications_created: notifications.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error: any) {
    console.error('Error in payment-reminders function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})