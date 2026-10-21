import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const VALID_ROLES = ['dev', 'admin', 'ops', 'finance', 'csm', 'setter', 'account_executive', 'gtm_engineer', 'client'];

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

    // Check if user has admin-level role (dev, admin, ops, finance, csm, account_executive).
    // A user can hold several roles — fetch them all; .maybeSingle() here used to
    // error out for any caller with two admin-tier roles.
    const ADMIN_ROLES = ['dev', 'admin', 'ops', 'finance', 'csm', 'account_executive'];
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const callerRoles = (roleRows ?? []).map((r) => r.role as string);

    if (roleError || !callerRoles.some((r) => ADMIN_ROLES.includes(r))) {
      console.log('Access denied - user does not have admin role:', user.id);
      return new Response(JSON.stringify({ error: 'Access denied. Admin role required.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user has dev role (needed for mutation operations)
    const hasDevRole = callerRoles.includes('dev');

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Path inside function: /admin-users/{userId}/{action}
    // Index:                    0          1        2
    const userId = pathParts.length > 1 ? pathParts[1] : null;
    const action = pathParts.length > 2 ? pathParts[2] : null;
    
    console.log('Path parts:', pathParts, 'userId:', userId, 'action:', action);

    // Handle different HTTP methods
    if (req.method === 'GET') {
      // List all users with their roles
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, created_at, offboarded_at, in_trial_mode, in_onboarding_mode');

      if (profilesError) throw profilesError;

      // Get roles for all users
      const { data: roles, error: rolesError } = await supabaseAdmin
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Get auth users to check active status
      const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
      const { data: setterRows } = await supabaseAdmin.from('setters_profiles').select('user_id, active');
      const benchByUser = new Map((setterRows ?? []).map((r: { user_id: string | null; active: boolean | null }) => [r.user_id, r.active]));
      
      // Combine data
      const users = profiles?.map(profile => {
        const userRoles = roles?.filter(r => r.user_id === profile.id).map(r => r.role) || [];
        const authUser = authUsers?.users?.find(u => u.id === profile.id) as any;
        // Check if user is banned by looking at banned_until property
        const isBanned = authUser?.banned_until ? new Date(authUser.banned_until) > new Date() : false;
        return {
          ...profile,
          roles: userRoles,
          primary_role: userRoles[0] || null,
          is_active: !isBanned,
          setter_active: benchByUser.has(profile.id) ? benchByUser.get(profile.id) : null,
        };
      }) || [];

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      if (action === 'reset-password' && userId) {
        // Require dev role for mutations
        if (!hasDevRole) {
          return new Response(JSON.stringify({ error: 'Access denied. Dev role required for this action.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Trigger password reset
        const { data: targetUser } = await supabaseAdmin
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .single();

        if (!targetUser?.email) {
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Directly set password to test123
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: 'test123',
        });

        if (error) throw error;

        // Log the action
        await supabaseAdmin.from('audit_logs').insert({
          user_id: user.id,
          action_type: 'PASSWORD_RESET',
          description: `Password reset to default for ${targetUser.email}`,
          metadata: { target_user_id: userId, target_email: targetUser.email },
        });

        return new Response(JSON.stringify({ success: true, message: 'Password reset to test123' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if this is a list request (POST without body or with empty body)
      let body: any = null;
      const contentType = req.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        try {
          const text = await req.text();
          if (text && text.trim()) {
            body = JSON.parse(text);
          }
        } catch {
          // Empty body is okay for listing
        }
      }
      
      // If no body, treat as list request (same as GET)
      if (!body || Object.keys(body).length === 0) {
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name, email, created_at, offboarded_at, in_trial_mode, in_onboarding_mode');

        if (profilesError) throw profilesError;

        const { data: roles, error: rolesError } = await supabaseAdmin
          .from('user_roles')
          .select('user_id, role');

        if (rolesError) throw rolesError;

        const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
        const { data: setterRows } = await supabaseAdmin.from('setters_profiles').select('user_id, active');
        const benchByUser = new Map((setterRows ?? []).map((r: { user_id: string | null; active: boolean | null }) => [r.user_id, r.active]));
        
        const users = profiles?.map(profile => {
          const userRoles = roles?.filter(r => r.user_id === profile.id).map(r => r.role) || [];
          const authUser = authUsers?.users?.find(u => u.id === profile.id) as any;
          const isBanned = authUser?.banned_until ? new Date(authUser.banned_until) > new Date() : false;
          return {
            ...profile,
            roles: userRoles,
            primary_role: userRoles[0] || null,
            is_active: !isBanned,
            setter_active: benchByUser.has(profile.id) ? benchByUser.get(profile.id) : null,
          };
        }) || [];

        return new Response(JSON.stringify({ users }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Require dev role for creating users
      if (!hasDevRole) {
        return new Response(JSON.stringify({ error: 'Access denied. Dev role required for this action.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create new user
      const { email, full_name, role } = body;

      if (!email || !full_name || !role) {
        return new Response(JSON.stringify({ error: 'Missing required fields: email, full_name, role' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!VALID_ROLES.includes(role)) {
        return new Response(JSON.stringify({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create auth user with default password
      const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: 'TempPassword123!',
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) throw createError;

      // Profile should be created by trigger, but let's ensure it exists
      await supabaseAdmin.from('profiles').upsert({
        id: newAuthUser.user.id,
        email,
        full_name,
      });

      // Assign role
      await supabaseAdmin.from('user_roles').insert({
        user_id: newAuthUser.user.id,
        role,
      });

      // Log the action
      await supabaseAdmin.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'USER_CREATED',
        description: `Created user ${email} with role ${role}`,
        metadata: { new_user_id: newAuthUser.user.id, email, role },
      });

      return new Response(JSON.stringify({ success: true, user: { id: newAuthUser.user.id, email, full_name, role } }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'PATCH' && userId) {
      // Require dev role for mutations
      if (!hasDevRole) {
        return new Response(JSON.stringify({ error: 'Access denied. Dev role required for this action.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const body = await req.json();
      const { role, is_active } = body;

      // Handle role change
      if (role !== undefined) {
        if (!VALID_ROLES.includes(role)) {
          return new Response(JSON.stringify({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Prevent removing dev from self (lockout protection)
        if (userId === user.id && role !== 'dev') {
          return new Response(JSON.stringify({ error: 'Cannot remove dev role from yourself' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get current role
        const { data: currentRoleData } = await supabaseAdmin
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle();

        const oldRole = currentRoleData?.role || 'none';

        // Delete existing role and insert new one
        await supabaseAdmin.from('user_roles').delete().eq('user_id', userId);
        await supabaseAdmin.from('user_roles').insert({ user_id: userId, role });

        // Log the action
        await supabaseAdmin.from('audit_logs').insert({
          user_id: user.id,
          action_type: 'ROLE_CHANGED',
          description: `Changed role from ${oldRole} to ${role}`,
          metadata: { target_user_id: userId, old_role: oldRole, new_role: role },
        });
      }

      // Handle active status change
      if (is_active !== undefined) {
        if (is_active) {
          // Unban user
          await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
        } else {
          // Ban user indefinitely
          await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: '876000h' }); // ~100 years
        }

        // 13 Oct (the owner): deactivating here means they have LEFT — stamp the
        // platform-wide leaver flag (profiles.offboarded_at); the DB trigger
        // benches the setter row. Re-activating clears the flag and unbenches.
        const { error: flagError } = await supabaseAdmin
          .from('profiles')
          .update({ offboarded_at: is_active ? null : new Date().toISOString() })
          .eq('id', userId);
        if (flagError) throw flagError;

        // Sync setter profile active status if user has a setter profile
        const { error: setterUpdateError } = await supabaseAdmin
          .from('setters_profiles')
          .update({ active: is_active })
          .eq('user_id', userId);
        
        if (setterUpdateError) {
          console.log('Note: User may not have a setter profile:', setterUpdateError.message);
        }

        // Log the action
        await supabaseAdmin.from('audit_logs').insert({
          user_id: user.id,
          action_type: is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          description: `User ${is_active ? 'activated' : 'deactivated'}`,
          metadata: { target_user_id: userId, is_active },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE - Purge auth user
    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      const userId = url.searchParams.get('userId');
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in admin-users function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
