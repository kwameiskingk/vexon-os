import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Dev-only impersonation. Verifies the CALLER is a dev (by their real JWT,
// not a shared password), records the action in impersonation_log, then mints
// a one-time magic-link token for the target user. The caller's browser
// exchanges that token via verifyOtp to become the target for that session.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "No authorization header" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = claimsData.claims.sub as string;
    const callerEmail = (claimsData.claims.email as string) ?? null;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Gate: caller must hold the `dev` role. This is the entire authorization
    // for impersonation — identity-based, no shared secret.
    const { data: devRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "dev")
      .maybeSingle();

    if (roleError) throw roleError;
    if (!devRole) {
      console.log("Impersonation denied — caller is not a dev:", callerId);
      return json({ error: "Access denied. Dev role required." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId: string | undefined = body?.userId;
    if (!targetUserId) {
      return json({ error: "Missing userId" }, 400);
    }
    if (targetUserId === callerId) {
      return json({ error: "You are already signed in as yourself." }, 400);
    }

    // Resolve the target's email (magic links are keyed by email).
    const { data: targetUser, error: targetError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
    if (targetError || !targetUser?.user?.email) {
      return json({ error: "Target user not found." }, 404);
    }
    const targetEmail = targetUser.user.email;

    // Audit BEFORE handing out the token, so an attempt is always recorded.
    const { error: logError } = await supabaseAdmin.from("impersonation_log").insert({
      impersonator_id: callerId,
      impersonator_email: callerEmail,
      target_user_id: targetUserId,
      target_email: targetEmail,
    });
    if (logError) throw logError;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      throw linkError ?? new Error("Failed to generate impersonation token");
    }

    return json({
      email: targetEmail,
      token_hash: linkData.properties.hashed_token,
    });
  } catch (err) {
    console.error("impersonate-user error:", err);
    return json({ error: (err as Error).message ?? "Internal error" }, 500);
  }
});
