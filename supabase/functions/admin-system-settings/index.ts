import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: claimsData, error: userError } = await supabaseAuth.auth.getClaims(token);
    if (userError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = { id: claimsData.claims.sub as string };

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user has 'dev' role
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'dev')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Access denied. Dev role required.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('system_settings')
        .select('*')
        .limit(1)
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ settings: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'PUT') {
      const body = await req.json();
      const { 
        company_name, 
        default_timezone, 
        default_currency, 
        branding_logo_url, 
        branding_primary_color, 
        email_sender_name,
        csm_name,
        csm_email,
        csm_phone,
        csm_calendly_url
      } = body;

      // Get the current settings row
      const { data: currentSettings } = await supabaseAdmin
        .from('system_settings')
        .select('id')
        .limit(1)
        .single();

      if (!currentSettings) {
        return new Response(JSON.stringify({ error: 'No settings found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const updateData: Record<string, string | null> = {};
      if (company_name !== undefined) updateData.company_name = company_name;
      if (default_timezone !== undefined) updateData.default_timezone = default_timezone;
      if (default_currency !== undefined) updateData.default_currency = default_currency;
      if (branding_logo_url !== undefined) updateData.branding_logo_url = branding_logo_url;
      if (branding_primary_color !== undefined) updateData.branding_primary_color = branding_primary_color;
      if (email_sender_name !== undefined) updateData.email_sender_name = email_sender_name;
      if (csm_name !== undefined) updateData.csm_name = csm_name;
      if (csm_email !== undefined) updateData.csm_email = csm_email;
      if (csm_phone !== undefined) updateData.csm_phone = csm_phone;
      if (csm_calendly_url !== undefined) updateData.csm_calendly_url = csm_calendly_url;

      const { data, error } = await supabaseAdmin
        .from('system_settings')
        .update(updateData)
        .eq('id', currentSettings.id)
        .select()
        .single();

      if (error) throw error;

      // Log the action
      await supabaseAdmin.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'SYSTEM_SETTINGS_UPDATED',
        description: 'System settings updated',
        metadata: { changes: updateData },
      });

      return new Response(JSON.stringify({ success: true, settings: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in admin-system-settings function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
