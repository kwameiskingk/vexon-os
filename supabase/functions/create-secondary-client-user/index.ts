import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type CredentialEntry = {
  account: string;
  login: string;
  password: string;
};

const MAX_SECONDARY_USERS = 3;
// Per-user random password (the shared "temppassword123!" is dead). The new
// user also gets a branded set-password email; the returned value is only a
// fallback for the in-app handover dialog.
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "Rd" + btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 22) + "9!";
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeCredentials = (raw: unknown): CredentialEntry[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry: any, index: number) => ({
      account: String(entry?.account ?? entry?.label ?? `Vexon OS User ${index + 1}`),
      login: String(entry?.login ?? entry?.username ?? ""),
      password: String(entry?.password ?? ""),
    }))
    .filter((entry) => entry.login);
};

const resolveClientProfileId = async (adminClient: any, userId: string): Promise<string | null> => {
  const { data: linkedProfile } = await adminClient
    .from("client_profile_users")
    .select("client_profile_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (linkedProfile?.client_profile_id) {
    return linkedProfile.client_profile_id;
  }

  const { data: directProfile } = await adminClient
    .from("client_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  return directProfile?.id ?? null;
};

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

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id);

    const isClient = roleData?.some((r: any) => r.role === "client");
    if (!isClient) {
      return jsonResponse({ success: false, error: "Only client users can add secondary users" });
    }

    const clientProfileId = await resolveClientProfileId(adminClient, requestingUser.id);

    if (!clientProfileId) {
      return jsonResponse({ success: false, error: "No client profile found" });
    }

    const { data: existingUsers } = await adminClient
      .from("client_profile_users")
      .select("id")
      .eq("client_profile_id", clientProfileId)
      .eq("role", "secondary_user");

    if ((existingUsers?.length ?? 0) >= MAX_SECONDARY_USERS) {
      return jsonResponse({ success: false, error: "Maximum of 3 secondary users reached" });
    }

    const { email } = await req.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return jsonResponse({ success: false, error: "Valid email is required" });
    }

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingProfile) {
      return jsonResponse({ success: false, error: "A user with this email already exists" });
    }

    const TEMP_PASSWORD = randomPassword();
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: "",
        requires_profile_completion: true,
        secondary_client_user: true,
      },
    });

    if (createError) {
      if (createError.message?.includes("already been registered")) {
        return jsonResponse({ success: false, error: "A user with this email already exists" });
      }

      throw createError;
    }

    if (!newUser.user) {
      return jsonResponse({ success: false, error: "Failed to create user" });
    }

    const { error: linkError } = await adminClient.from("client_profile_users").insert({
      client_profile_id: clientProfileId,
      user_id: newUser.user.id,
      role: "secondary_user",
    });

    if (linkError) {
      throw linkError;
    }

    const { error: roleInsertError } = await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role: "client",
    });

    if (roleInsertError) {
      throw roleInsertError;
    }

    const { data: cpInfo } = await adminClient
      .from("client_profiles")
      .select("company_name")
      .eq("id", clientProfileId)
      .single();

    const companyName = cpInfo?.company_name || "Unknown Client";

    let existingCreds: CredentialEntry[] = [];
    try {
      const { data: decrypted } = await adminClient.rpc("decrypt_credentials", {
        p_client_profile_id: clientProfileId,
      });

      if (decrypted) {
        existingCreds = normalizeCredentials(JSON.parse(decrypted));
      }
    } catch {
      existingCreds = [];
    }

    const userCount = existingCreds.length + 1;
    existingCreds.push({
      account: `Vexon OS User ${userCount}`,
      login: normalizedEmail,
      password: TEMP_PASSWORD,
    });

    await adminClient.rpc("encrypt_credentials", {
      p_client_profile_id: clientProfileId,
      p_credentials_json: JSON.stringify(existingCreds),
    });

    const rolesToNotify = ["admin", "dev", "csm"];
    for (const role of rolesToNotify) {
      await adminClient.from("notifications").insert({
        recipient_role: role,
        title: "New Secondary Client User Created",
        message: `${companyName} added a secondary user: ${normalizedEmail}`,
        category: "system",
        link_url: `/admin/operations/clients`,
        triggered_by: requestingUser.id,
      });
    }

    await adminClient.from("audit_logs").insert({
      user_id: requestingUser.id,
      action_type: "secondary_client_user_created",
      description: `Secondary client user created: ${normalizedEmail} for ${companyName}`,
      metadata: { email: normalizedEmail, client_profile_id: clientProfileId },
    });

    return jsonResponse({
      success: true,
      email: normalizedEmail,
      tempPassword: TEMP_PASSWORD,
      secondaryUsersCount: (existingUsers?.length ?? 0) + 1,
      maxSecondaryUsers: MAX_SECONDARY_USERS,
    });
  } catch (error: any) {
    console.error("Error creating secondary client user:", error);
    return jsonResponse({ success: false, error: error?.message || "Internal error" });
  }
});
