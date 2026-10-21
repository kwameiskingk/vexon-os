import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_VIEW_ROLES = new Set([
  "dev",
  "admin",
  "ops",
  "csm",
  "finance",
  "account_executive",
]);

const jsonResponse = (payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ success: false, error: "No authorization header" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user: requestingUser },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !requestingUser) {
      return jsonResponse({ success: false, error: "Unauthorized" });
    }

    let requestedClientProfileId: string | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.clientProfileId === "string" && body.clientProfileId.trim()) {
        requestedClientProfileId = body.clientProfileId.trim();
      }
    }

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id);

    const callerRoles = (roleData || []).map((r: any) => r.role);
    const isAdminViewer = callerRoles.some((role) => ADMIN_VIEW_ROLES.has(role));

    let clientProfileId = requestedClientProfileId;

    if (!clientProfileId) {
      const { data: linkedProfile } = await adminClient
        .from("client_profile_users")
        .select("client_profile_id")
        .eq("user_id", requestingUser.id)
        .limit(1)
        .maybeSingle();

      if (linkedProfile?.client_profile_id) {
        clientProfileId = linkedProfile.client_profile_id;
      } else {
        const { data: directProfile } = await adminClient
          .from("client_profiles")
          .select("id")
          .eq("user_id", requestingUser.id)
          .maybeSingle();

        clientProfileId = directProfile?.id ?? null;
      }
    } else if (!isAdminViewer) {
      const { data: membership } = await adminClient
        .from("client_profile_users")
        .select("id")
        .eq("client_profile_id", clientProfileId)
        .eq("user_id", requestingUser.id)
        .maybeSingle();

      const { data: ownerMatch } = await adminClient
        .from("client_profiles")
        .select("id")
        .eq("id", clientProfileId)
        .eq("user_id", requestingUser.id)
        .maybeSingle();

      if (!membership && !ownerMatch) {
        return jsonResponse({ success: false, error: "Access denied" });
      }
    }

    if (!clientProfileId) {
      return jsonResponse({ success: true, secondaryUsers: [], secondaryCount: 0, maxSecondaryUsers: 3 });
    }

    const { data: linkedUsers, error: linkedUsersError } = await adminClient
      .from("client_profile_users")
      .select("user_id, role, created_at")
      .eq("client_profile_id", clientProfileId)
      .eq("role", "secondary_user")
      .order("created_at", { ascending: true });

    if (linkedUsersError) throw linkedUsersError;

    if (!linkedUsers || linkedUsers.length === 0) {
      return jsonResponse({ success: true, secondaryUsers: [], secondaryCount: 0, maxSecondaryUsers: 3 });
    }

    const userIds = linkedUsers.map((user: any) => user.user_id);

    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, email, full_name, phone")
      .in("id", userIds);

    const secondaryUsers = linkedUsers.map((linkedUser: any) => {
      const profile = profiles?.find((p: any) => p.id === linkedUser.user_id);

      return {
        user_id: linkedUser.user_id,
        role: linkedUser.role,
        created_at: linkedUser.created_at,
        email: profile?.email || "",
        full_name: profile?.full_name || "",
        phone: profile?.phone || null,
      };
    });

    return jsonResponse({
      success: true,
      clientProfileId,
      secondaryUsers,
      secondaryCount: secondaryUsers.length,
      maxSecondaryUsers: 3,
    });
  } catch (error: any) {
    console.error("Error fetching secondary users:", error);
    return jsonResponse({ success: false, error: error?.message || "Internal error" });
  }
});
