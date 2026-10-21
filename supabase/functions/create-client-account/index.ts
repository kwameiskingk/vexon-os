import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { sendResendEmail } from "../_shared/booking-flow.ts";
import { clientWelcomeEmailHtml, clientWelcomeEmailText } from "../_shared/client-onboarding-emails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateClientAccountRequest {
  clientProfileId: string;
}

// Staff tiers allowed to provision client logins. This function previously had
// NO caller gate and a shared "client123" password — both closed 2026-08-26.
const ALLOWED_ROLES = ["dev", "admin", "ops", "csm"];

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "Rd" + btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 22) + "9!";
}

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://vexon-os.example";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Caller gate: signed-in staff in an allowed tier only.
    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } }
    );
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }
    const { data: callerRoles } = await supabase
      .from("user_roles").select("role").eq("user_id", caller.id);
    if (!(callerRoles ?? []).some((r: any) => ALLOWED_ROLES.includes(r.role))) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403,
      });
    }

    const { clientProfileId }: CreateClientAccountRequest = await req.json();

    // Fetch client profile record
    const { data: clientProfile, error: clientFetchError } = await supabase
      .from("client_profiles")
      .select("*")
      .eq("id", clientProfileId)
      .single();

    if (clientFetchError || !clientProfile?.email) {
      console.error("Error fetching client profile:", clientFetchError);
      return new Response(
        JSON.stringify({ error: "Client profile not found" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const email = clientProfile.email;
    console.log(`Linking client account for email: ${email}, client profile ID: ${clientProfileId}`);

    let userId: string;
    let userAlreadyExisted = false;

    // Check if Auth user already exists
    console.log("Checking for existing Auth user...");
    const { data: { users: existingUsers }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error("Error listing users:", listError);
      return new Response(
        JSON.stringify({ error: "Failed to verify user status" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    const existingUser = existingUsers?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (existingUser) {
      userId = existingUser.id;
      userAlreadyExisted = true;
      console.log(`Found existing Auth user: ${userId}`);
    } else {
      // Create new Auth user
      console.log("Creating new Auth user...");
      
      // Random throwaway password, never surfaced anywhere — the set-password
      // email below is the real credential.
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: {
          full_name: clientProfile.contact_name || email.split('@')[0]
        }
      });

      if (createError) {
        console.error("Auth user creation failed:", createError);
        return new Response(
          JSON.stringify({ error: `Account creation failed: ${createError.message}` }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }

      if (!newUser?.user?.id) {
        console.error("No user ID returned from Auth");
        return new Response(
          JSON.stringify({ error: "Account creation failed" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }

      userId = newUser.user.id;
      console.log(`Created new Auth user: ${userId}`);
    }

    // Link user to client profile via join table — BEFORE the role grant.
    // ORDER MATTERS: handle_client_role_assignment (the user_roles trigger)
    // skips profile creation only when a client_profile_users row already
    // exists; granting the role first left a gap where it minted a stray
    // "Unspecified" client_profiles row for every account created here
    // (found via the Ali Recruitment test client, 27 Aug).
    console.log("Linking user to client profile via client_profile_users...");
    const { error: linkError } = await supabase
      .from("client_profile_users")
      .insert({
        client_profile_id: clientProfileId,
        user_id: userId,
        role: 'client_user'
      });

    if (linkError) {
      // Check if already linked (duplicate key error)
      if (linkError.code !== '23505') {
        console.error("Failed to link user to client profile:", linkError);
        return new Response(
          JSON.stringify({ error: "Failed to link account — please try again" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      } else {
        console.log("User already linked to this client profile");
      }
    }

    // Ensure user has client role (now that the link exists, the role
    // trigger sees the junction row and creates nothing).
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("*")
      .eq("user_id", userId)
      .eq("role", "client")
      .maybeSingle();

    if (!existingRole) {
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "client" });

      if (roleError) {
        console.error("Error assigning client role:", roleError);
        throw roleError;
      }
    }

    console.log(`Successfully ${userAlreadyExisted ? 'linked' : 'created and linked'} Auth user to client profile ${clientProfileId}`);

    // Send the branded set-password email so the client can actually get in.
    let inviteSent = false;
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (linkData?.properties?.hashed_token) {
      const inviteUrl =
        `${APP_ORIGIN}/welcome#token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
        `&email=${encodeURIComponent(email)}`;
      const send = await sendResendEmail(
        email,
        "Your Meridian client portal is ready: set your password",
        clientWelcomeEmailHtml({
          contactName: clientProfile.contact_name || "",
          companyName: clientProfile.company_name || "your company",
          loginEmail: email,
          inviteUrl,
        }),
        clientWelcomeEmailText({
          contactName: clientProfile.contact_name || "",
          companyName: clientProfile.company_name || "your company",
          loginEmail: email,
          inviteUrl,
        })
      );
      inviteSent = send.ok;
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        onboarded: true,
        invite_sent: inviteSent,
        message: userAlreadyExisted
          ? "Client account linked successfully"
          : "Client account created successfully"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in create-client-account:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
