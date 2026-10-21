import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the requesting user is an admin or dev
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Client to verify the requesting user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client for user creation
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get the requesting user
    const { data: { user: requestingUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !requestingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve the caller's roles. Deliberately NOT .single(): a caller can
    // hold several roles (admin+dev etc.) and .single() errors on multi-row.
    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id);
    if (roleError) {
      return new Response(JSON.stringify({ error: "Could not verify permissions" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerRoles = (roleRows ?? []).map((r) => r.role);
    const isAdminOrDev = callerRoles.includes("admin") || callerRoles.includes("dev");

    // Non-admin callers may hold the TA capability, which unlocks ONLY the
    // restricted onboarding-provisioning path below — never the general path.
    let canScreenCandidates = false;
    if (!isAdminOrDev) {
      const { data: capData } = await adminClient.rpc("has_capability", {
        _user_id: requestingUser.id,
        _cap: "can_screen_candidates",
      });
      canScreenCandidates = capData === true;
    }

    if (!isAdminOrDev && !canScreenCandidates) {
      return new Response(JSON.stringify({ error: "Insufficient permissions. Only admin and dev roles can create users." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();

    // ── Trialist path (15 Sep 2026, Trial Day) ─────────────────────────────
    // Admin/dev or the TA capability may make a trialist login: the account is
    // forced into trial mode, holds exactly the 'trialist' role, and is linked
    // to its candidate. Same delete-on-failure rule as onboarding provisioning:
    // if containment cannot be guaranteed, the account must not exist.
    if (body.trialist === true) {
      const candidateId = typeof body.candidateId === "string" ? body.candidateId : "";
      const email = typeof body.email === "string" ? body.email.trim() : "";
      if (!email || !candidateId) {
        return new Response(
          JSON.stringify({ error: "A trialist login needs email and candidateId." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: candidate, error: candErr } = await adminClient
        .from("candidates")
        .select("id, trialist_user_id")
        .eq("id", candidateId)
        .maybeSingle();
      if (candErr || !candidate) {
        return new Response(
          JSON.stringify({ error: "Candidate not found." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (candidate.trialist_user_id) {
        return new Response(
          JSON.stringify({ error: "This candidate already has a trialist login." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const tempPassword = Math.random().toString(36).slice(-8) + "A1!" + Math.random().toString(36).slice(-4);
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: (body.displayName ?? "").trim() },
      });
      if (createError || !createData.user) {
        return new Response(
          JSON.stringify({ success: false, error: createError?.message ?? "Failed to create user" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const newUser = createData.user;

      const { error: flagError } = await adminClient
        .from("profiles")
        .update({ in_trial_mode: true })
        .eq("id", newUser.id);
      if (flagError) {
        await adminClient.auth.admin.deleteUser(newUser.id);
        return new Response(
          JSON.stringify({ error: "Could not place the account in trial mode (has migration 20260915120000 been run?); nothing was created." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { error: roleInsertError } = await adminClient
        .from("user_roles")
        .insert({ user_id: newUser.id, role: "trialist" });
      if (roleInsertError) {
        await adminClient.auth.admin.deleteUser(newUser.id);
        return new Response(
          JSON.stringify({ error: "Could not assign the trialist role; nothing was created." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { error: linkError } = await adminClient
        .from("candidates")
        .update({ trialist_user_id: newUser.id })
        .eq("id", candidateId);
      if (linkError) console.error("Error linking trialist to candidate:", linkError);

      await adminClient.from("admin_activity_log").insert({
        admin_user_id: requestingUser.id,
        action: "trialist_user_created",
        details: { created_user_id: newUser.id, email, candidate_id: candidateId },
      });

      return new Response(
        JSON.stringify({
          success: true,
          user: { id: newUser.id, email: newUser.email },
          tempPassword,
          message: "Trialist login created.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── TA path: onboarding accounts only ──────────────────────────────────
    // Server-side guarantees (AUDIT_ONBOARDING.md §7.4): the caller-supplied
    // `role` field is never read on this path; the assigned role comes from a
    // closed map over the four allowed target roles; in_onboarding_mode is
    // forced true (with delete-on-failure, so a TA-created account can never
    // exist outside onboarding mode); and none of the dependent-row branches
    // (setters_profiles, client_profiles, partners, sdr assignments,
    // department access) are reachable — those belong to activation, not
    // provisioning.
    if (!isAdminOrDev) {
      const ONBOARDING_TARGET_TO_ROLE: Record<string, string> = {
        setter_fulfilment: "setter",
        setter_acquisition: "setter",
        account_executive: "account_executive",
        operations: "ops",
      };

      const targetRole = body.onboardingTargetRole;
      const mappedRole = typeof targetRole === "string" ? ONBOARDING_TARGET_TO_ROLE[targetRole] : undefined;
      if (!body.email || !mappedRole) {
        return new Response(
          JSON.stringify({
            error:
              "Onboarding provisioning requires email and onboardingTargetRole (setter_fulfilment, setter_acquisition, account_executive, or operations).",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const tempPassword = Math.random().toString(36).slice(-8) + "A1!" + Math.random().toString(36).slice(-4);

      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email: String(body.email).trim(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: (body.displayName ?? "").trim() },
      });
      if (createError || !createData.user) {
        return new Response(
          JSON.stringify({ success: false, error: createError?.message ?? "Failed to create user" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const newUser = createData.user;

      // Force containment. If this cannot be guaranteed, the account must
      // not exist — delete it and fail loudly rather than leave an
      // unconstrained login.
      const { error: flagError } = await adminClient
        .from("profiles")
        .update({ in_onboarding_mode: true })
        .eq("id", newUser.id);
      if (flagError) {
        await adminClient.auth.admin.deleteUser(newUser.id);
        return new Response(
          JSON.stringify({ error: "Could not place the account in onboarding mode; nothing was created." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Exactly one role, from the closed map. Same delete-on-failure rule.
      const { error: roleInsertError } = await adminClient
        .from("user_roles")
        .insert({ user_id: newUser.id, role: mappedRole });
      if (roleInsertError) {
        await adminClient.auth.admin.deleteUser(newUser.id);
        return new Response(
          JSON.stringify({ error: "Could not assign the starter role; nothing was created." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Link the onboarding record so the tracking view and the starter's
      // stepper both resolve. Non-fatal: the TA can relink via RLS.
      if (body.onboardingId) {
        const { error: linkError } = await adminClient
          .from("employee_onboarding")
          .update({
            user_id: newUser.id,
            onboarding_state: "in_onboarding",
            started_at: new Date().toISOString(),
          })
          .eq("id", body.onboardingId);
        if (linkError) console.error("Error linking onboarding record:", linkError);
      }

      await adminClient.from("admin_activity_log").insert({
        admin_user_id: requestingUser.id,
        action: "onboarding_user_created",
        details: {
          created_user_id: newUser.id,
          email: String(body.email).trim(),
          onboarding_target_role: targetRole,
          assigned_role: mappedRole,
          onboarding_id: body.onboardingId ?? null,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          user: { id: newUser.id, email: newUser.email },
          tempPassword,
          message: "Onboarding account created.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // ── end TA path; everything below is the unchanged admin/dev path ──────
    const { email, displayName, role, setterDepartment, sdrManagerScope, departmentAccess, closeUserId, partnerCompanyName, isTestAccount } = body;

    if (!email || !role) {
      return new Response(JSON.stringify({ error: "Email and role are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + "A1!" + Math.random().toString(36).slice(-4);

    // Create user using admin API (won't affect requesting user's session)
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: displayName?.trim() || "",
        // Partners get the portal's forced first-login password change
        ...(role === "partner" ? { requires_password_change: true } : {}),
      },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(JSON.stringify({ success: false, error: createError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUser = createData.user;
    if (!newUser) {
      return new Response(JSON.stringify({ error: "Failed to create user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign role
    const { error: roleInsertError } = await adminClient.from("user_roles").insert({
      user_id: newUser.id,
      role: role,
    });

    if (roleInsertError) {
      console.error("Error assigning role:", roleInsertError);
      // Don't fail completely, user is created
    }

    // Assign department access if provided
    if (departmentAccess && departmentAccess.length > 0) {
      const deptInserts = departmentAccess.map((dept: string) => ({
        user_id: newUser.id,
        department: dept,
      }));
      const { error: deptError } = await adminClient.from("user_department_access").insert(deptInserts);
      if (deptError) {
        console.error("Error assigning department access:", deptError);
      }
    }

    // Get profile data (created by trigger)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("email, full_name")
      .eq("id", newUser.id)
      .single();

    // Create dependent records based on role
    if (role === "client" && profile) {
      // The user_roles trigger (handle_client_role_assignment) usually creates
      // this login's profile already — a second blind insert here is what bred
      // the duplicate "Unspecified" rows polluting client health and pickers.
      // Top up the existing row instead; insert only when none exists.
      const { data: existingProfile } = await adminClient
        .from("client_profiles")
        .select("id, email")
        .eq("user_id", newUser.id)
        .maybeSingle();
      if (existingProfile) {
        if (!existingProfile.email) {
          await adminClient.from("client_profiles")
            .update({ email: profile.email })
            .eq("id", existingProfile.id);
        }
      } else {
        await adminClient.from("client_profiles").insert({
          user_id: newUser.id,
          email: profile.email,
          company_name: "Unspecified",
          status: "active",
        });
      }
    } else if ((role === "setter" || role === "account_executive") && profile) {
      await adminClient.from("setters_profiles").insert({
        user_id: newUser.id,
        email: profile.email,
        full_name: profile.full_name || displayName?.trim() || "",
        active: true,
        // AE profile rows are ALWAYS 'sales' (telemetry keying only) —
        // enforced server-side regardless of what the client sends.
        department: role === "account_executive" ? "sales" : (setterDepartment || "fulfilment"),
        status: role === "setter" ? "trainee" : "active",
        close_user_id: closeUserId?.trim() || null,
        // 2 Sep audit fix: throwaway test setters used to land as REAL,
        // counted setters (no toggle existed anywhere in the create path) —
        // ~25 aggregate surfaces filter on this flag.
        is_test_account: isTestAccount === true,
      });
    } else if (role === "partner" && profile) {
      const { error: partnerError } = await adminClient.from("partners").insert({
        user_id: newUser.id,
        full_name: profile.full_name || displayName?.trim() || "",
        email: profile.email || email.trim(),
        company_name: partnerCompanyName?.trim() || null,
        created_by: requestingUser.id,
      });
      if (partnerError) {
        console.error("Error creating partner record:", partnerError);
      }
    } else if (role === "sdr_manager") {
      // Auto-assign all setters from the manager's departments
      const managerDepartments = departmentAccess || [];
      
      // Map UI department names to DB values
      const dbDepartments = managerDepartments.map((dept: string) => {
        if (dept === 'operations') return 'fulfilment';
        if (dept === 'sales') return 'acquisition';
        return dept;
      });
      
      if (dbDepartments.length > 0) {
        // Fetch all setters from these departments
        const { data: settersToAssign } = await adminClient
          .from("setters_profiles")
          .select("id, department")
          .in("department", dbDepartments)
          .eq("active", true);
        
        if (settersToAssign && settersToAssign.length > 0) {
          // Create assignments for each setter
          const assignments = settersToAssign.map((setter) => ({
            manager_user_id: newUser.id,
            setter_profile_id: setter.id,
            department: setter.department,
            assigned_by: requestingUser.id,
          }));
          
          const { error: assignError } = await adminClient
            .from("sdr_manager_assignments")
            .insert(assignments);
          
          if (assignError) {
            console.error("Error auto-assigning setters:", assignError);
          } else {
            console.log(`Auto-assigned ${settersToAssign.length} setters to new SDR manager`);
          }
        }
      }
    }

    // Log activity
    await adminClient.from("admin_activity_log").insert({
      admin_user_id: requestingUser.id,
      action: "user_created",
      details: {
        created_user_id: newUser.id,
        email: email.trim(),
        role,
        department_access: departmentAccess,
        ...(role === "setter" && { setter_department: setterDepartment }),
        ...(role === "sdr_manager" && { sdr_manager_scope: sdrManagerScope }),
        ...(role === "partner" && { partner_company_name: partnerCompanyName || null }),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
        },
        tempPassword,
        message: `User created successfully. Temporary password: ${tempPassword}`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
