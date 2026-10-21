import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_ROLES = [
  "dev",
  "admin",
  "ops",
  "finance",
  "csm",
  "account_executive",
] as const;

type ReqBody = {
  clientProfileId: string;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", [...ADMIN_ROLES])
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { clientProfileId }: ReqBody = await req.json();

    const { data: clientProfile, error: clientError } = await supabaseAdmin
      .from("client_profiles")
      .select("id, email, user_id")
      .eq("id", clientProfileId)
      .maybeSingle();

    if (clientError || !clientProfile) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candidateUserIds = new Set<string>();

    if (clientProfile.user_id) {
      candidateUserIds.add(clientProfile.user_id);
    }

    // Join table (preferred)
    const { data: links } = await supabaseAdmin
      .from("client_profile_users")
      .select("user_id")
      .eq("client_profile_id", clientProfileId);

    (links || []).forEach((l) => {
      if (l?.user_id) candidateUserIds.add(l.user_id);
    });

    // Fallback: find auth user by client email (covers legacy / missing linkage)
    if (candidateUserIds.size === 0 && clientProfile.email) {
      const { data: usersData, error: listErr } =
        await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });

      if (!listErr) {
        const match = usersData?.users?.find(
          (u) => u.email?.toLowerCase() === clientProfile.email?.toLowerCase()
        );
        if (match?.id) candidateUserIds.add(match.id);
      }
    }

    let hasAccount = false;
    let onboarded = false;

    for (const uid of candidateUserIds) {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(uid);
      if (error || !data?.user) continue;

      hasAccount = true;

      const requiresPasswordChange =
        (data.user.user_metadata as any)?.requires_password_change === true;
      const hasSignedIn = !!(data.user as any)?.last_sign_in_at;

      if (hasSignedIn && !requiresPasswordChange) {
        onboarded = true;
        break;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        hasAccount,
        onboarded,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in client-account-status:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
