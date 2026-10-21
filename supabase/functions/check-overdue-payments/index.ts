import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting overdue payment check on accounting_records...');

    const today = new Date().toISOString().split('T')[0];
    
    // Query accounting_records where:
    // - next_payment_due is in the past
    // - status is NOT already paid, written_off, or overdue
    const { data: overdueRecords, error: fetchError } = await supabase
      .from('accounting_records')
      .select('id, client_profile_id, next_payment_due, status, amount, invoice_number')
      .lt('next_payment_due', today)
      .not('status', 'in', '(paid,written_off,overdue)');

    if (fetchError) {
      console.error('Error fetching overdue records:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${overdueRecords?.length || 0} records to mark as overdue`);

    if (!overdueRecords || overdueRecords.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No overdue payments found', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to 'overdue' for each record
    const updatePromises = overdueRecords.map(record => 
      supabase
        .from('accounting_records')
        .update({ status: 'overdue' })
        .eq('id', record.id)
    );

    await Promise.all(updatePromises);
    console.log(`Updated ${overdueRecords.length} records to overdue status`);

    // Write to payment_history for each overdue record
    const historyPromises = overdueRecords.map(record =>
      supabase
        .from('payment_history')
        .insert({
          accounting_record_id: record.id,
          action: 'overdue',
          admin_user_id: null, // System action
          notes: `Automatically marked overdue - payment was due ${record.next_payment_due}`
        })
    );

    await Promise.all(historyPromises);
    console.log(`Logged ${overdueRecords.length} entries to payment_history`);

    // Get admin users for notifications
    const { data: adminRoles, error: adminError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (adminError) {
      console.error('Error fetching admin users:', adminError);
      throw adminError;
    }

    // Create notifications for each overdue payment
    const notificationPromises = overdueRecords.flatMap(record =>
      adminRoles?.map(admin =>
        supabase.from('notifications').insert({
          recipient_role: 'admin',
          recipient_id: admin.user_id,
          title: 'Payment Overdue',
          message: `Invoice ${record.invoice_number} is overdue. Amount: £${record.amount?.toLocaleString() || 'N/A'}`,
          category: 'payment',
          link_url: '/admin/operations/accounting',
        })
      ) || []
    );

    await Promise.all(notificationPromises);

    console.log(`Sent ${notificationPromises.length} admin notifications`);

    return new Response(
      JSON.stringify({
        message: 'Overdue payments processed successfully',
        recordsUpdated: overdueRecords.length,
        historyEntriesCreated: overdueRecords.length,
        notificationsSent: notificationPromises.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in check-overdue-payments:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
