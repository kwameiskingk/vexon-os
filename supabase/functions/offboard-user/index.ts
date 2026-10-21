import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Who may run HR offboarding — mirrors HR_ROLES in App.tsx.
// 14 Oct 2026: sdr_manager added, limited to setter targets (see the POST gate).
const OFFBOARDING_ROLES = ["admin", "dev", "ops", "hr", "csm", "sdr_manager"];
const SETTER_ONLY_ROLES = ["sdr_manager"];
// Reinstating (undoing an offboard) is deliberately narrower.
const REINSTATE_ROLES = ["admin", "dev"];
const BAN_DURATION = "876000h"; // ~100 years — effectively permanent

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// The HR offboarding flow, all service-role so it works for any
// offboarding-permitted role (the platform-wide admin-users function is
// dev-only and its list excludes HR):
//   GET  -> { users, former }: current internal staff (pickable) and
//           already-offboarded internal staff (Former Employees table)
//   POST -> { userId, reason? }: offboard — ban login, stamp
//           profiles.offboarded_at (the platform-wide flag every roster/picker
//           filters on), sync the setter bench flag, log history + audit
//   POST -> { userId, action: "reinstate" }: undo a mistaken offboard
//           (dev/admin only) — unban, clear the flag, reactivate setter row
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Gate: caller must hold an offboarding-permitted role.
    const { data: callerRoleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (roleError) throw roleError;
    const callerRoles = (callerRoleRows ?? []).map((r) => r.role);
    if (!callerRoles.some((r) => OFFBOARDING_ROLES.includes(r))) {
      return json({ error: "Access denied. HR offboarding role required." }, 403);
    }

    if (req.method === "GET") {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, offboarded_at")
        .order("full_name");
      if (profilesError) throw profilesError;

      const { data: roleRows, error: rolesError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role");
      if (rolesError) throw rolesError;

      const rolesByUser = new Map<string, string[]>();
      for (const r of roleRows ?? []) {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push(r.role);
        rolesByUser.set(r.user_id, list);
      }

      // Internal staff only: drop external client-portal logins.
      const internal = (profiles ?? [])
        .map((p) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          offboarded_at: p.offboarded_at,
          roles: rolesByUser.get(p.id) ?? [],
        }))
        .filter((u) => !u.roles.includes("client"));

      // Current staff only in the picker — no re-offboarding the same person.
      const users = internal.filter((u) => !u.offboarded_at);
      // Former employees, newest departure first.
      const former = internal
        .filter((u) => u.offboarded_at)
        .sort((a, b) => (a.offboarded_at! < b.offboarded_at! ? 1 : -1));

      return json({ users, former });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const targetUserId: string | undefined = body?.userId;
      if (!targetUserId) {
        return json({ error: "Missing userId" }, 400);
      }
      if (targetUserId === callerId) {
        return json({ error: "You cannot offboard your own account." }, 400);
      }

      const { data: targetProfile, error: targetError } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, offboarded_at")
        .eq("id", targetUserId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!targetProfile) {
        return json({ error: "User not found" }, 404);
      }

      // A caller whose only offboarding power comes from sdr_manager may only
      // offboard setters. (The UI also scopes the list to their department.)
      const setterOnly = callerRoles.every((r) => !OFFBOARDING_ROLES.includes(r) || SETTER_ONLY_ROLES.includes(r));
      if (setterOnly) {
        const { data: targetRoleRows, error: targetRolesError } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", targetUserId);
        if (targetRolesError) throw targetRolesError;
        if (!(targetRoleRows ?? []).some((r) => r.role === "setter")) {
          return json({ error: "SDR managers can only offboard setters." }, 403);
        }
      }

      if (body?.action === "reinstate") {
        // Mistake insurance: undo an offboard. Dev/admin only.
        if (!callerRoles.some((r) => REINSTATE_ROLES.includes(r))) {
          return json({ error: "Access denied. Admin or dev role required to reinstate." }, 403);
        }
        if (!targetProfile.offboarded_at) {
          return json({ error: "User is not offboarded" }, 400);
        }

        const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          ban_duration: "none",
        });
        if (unbanError) throw unbanError;

        const { error: clearError } = await supabaseAdmin
          .from("profiles")
          .update({ offboarded_at: null })
          .eq("id", targetUserId);
        if (clearError) throw clearError;

        // Put a setter back on the bench when they have a setter profile.
        await supabaseAdmin
          .from("setters_profiles")
          .update({ active: true })
          .eq("user_id", targetUserId);

        await supabaseAdmin.from("audit_logs").insert({
          user_id: callerId,
          action_type: "USER_REINSTATED",
          description: "User reinstated via HR offboarding",
          metadata: { target_user_id: targetUserId, source: "offboarding" },
        });

        return json({ success: true });
      }

      // Guard: never offboard the same person twice.
      if (targetProfile.offboarded_at) {
        return json({ error: "Already offboarded" }, 400);
      }

      // Block login: ban the auth account (reversible via reinstate).
      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        ban_duration: BAN_DURATION,
      });
      if (banError) throw banError;

      // The platform-wide former-employee flag: every roster, picker,
      // leaderboard and metric surface filters on this from now on.
      const { error: flagError } = await supabaseAdmin
        .from("profiles")
        .update({ offboarded_at: new Date().toISOString() })
        .eq("id", targetUserId);
      if (flagError) throw flagError;

      // Keep the setter bench flag in sync when the user has a setter profile.
      await supabaseAdmin
        .from("setters_profiles")
        .update({ active: false })
        .eq("user_id", targetUserId);

      // History log row (the Offboarding tab's Former Employees table reads
      // the latest row per person for the departure reason).
      const { error: historyError } = await supabaseAdmin.from("employee_offboarding").insert({
        employee_user_id: targetUserId,
        employee_name: targetProfile.full_name ?? targetProfile.email ?? "Unknown",
        employee_email: targetProfile.email,
        reason: body?.reason ?? null,
        stage: "completed",
        initiated_by: callerId,
      });
      if (historyError) throw historyError;

      await supabaseAdmin.from("audit_logs").insert({
        user_id: callerId,
        action_type: "USER_DEACTIVATED",
        description: "User deactivated via HR offboarding",
        metadata: { target_user_id: targetUserId, source: "offboarding" },
      });

      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("offboard-user error:", err);
    return json({ error: (err as Error).message ?? "Internal error" }, 500);
  }
});
