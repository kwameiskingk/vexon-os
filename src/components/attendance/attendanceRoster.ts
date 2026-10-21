import { supabase } from "@/integrations/supabase/client";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";

/**
 * Shared roster sources for the attendance surfaces (single-day board and
 * the month-grid tracker). One implementation per population — the Ops
 * "all employees" roster is extracted verbatim from EmployeeAttendanceTracker,
 * and the fulfilment roster mirrors the is_active_genuine_fulfilment_setter
 * RLS gate (dept fulfilment + active + non-test + genuine setter role) so
 * the UI list and the server-side write scope can never disagree.
 */

export interface AttendanceEmployee {
  id: string; // auth user id (employee_attendance.employee_id)
  name: string;
  email: string;
}

/** Every internal employee (Ops/HR population), optionally role-filtered. */
export async function fetchAllEmployeesRoster(allowedRoles?: string[]): Promise<AttendanceEmployee[]> {
  const { data: setters } = await supabase
    .from("setters_profiles")
    .select("user_id, full_name, email")
    .eq("active", true)
    .eq("is_test_account", false);

  // Get user_ids of inactive / test setters so we can exclude them even if
  // they still have a role or profile row.
  const { data: excludedSetters } = await supabase
    .from("setters_profiles")
    .select("user_id")
    .or("active.eq.false,is_test_account.eq.true");
  const excludedUserIds = new Set(
    (excludedSetters || []).map((s: { user_id: string | null }) => s.user_id).filter(Boolean),
  );

  // Former employees are excluded too, whether or not they were ever setters
  // (their past attendance rows are retained and still readable).
  for (const id of await fetchOffboardedUserIds()) {
    excludedUserIds.add(id);
  }

  const rolesQuery =
    allowedRoles && allowedRoles.length > 0
      ? supabase.from("user_roles").select("user_id, role").in("role", allowedRoles as never[])
      : supabase.from("user_roles").select("user_id, role").neq("role", "client");
  const { data: internalRoles } = await rolesQuery;
  const internalUserIds = new Set((internalRoles || []).map((r: { user_id: string }) => r.user_id));

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");

  const employeeMap = new Map<string, AttendanceEmployee>();

  setters?.forEach((s) => {
    if (s.user_id && internalUserIds.has(s.user_id) && !excludedUserIds.has(s.user_id)) {
      employeeMap.set(s.user_id, {
        id: s.user_id,
        name: s.full_name || s.email || "Unknown",
        email: s.email || "",
      });
    }
  });

  profiles?.forEach((p) => {
    if (p.id && !employeeMap.has(p.id) && internalUserIds.has(p.id) && !excludedUserIds.has(p.id)) {
      employeeMap.set(p.id, {
        id: p.id,
        name: p.full_name || p.email || "Unknown",
        email: p.email || "",
      });
    }
  });

  return Array.from(employeeMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The people an SDR manager marks attendance for — the sdr_manager scope.
 * Fulfilment: active genuine setters of the department, mirroring the
 * is_active_genuine_setter_in_departments RLS gate exactly (defaulting to
 * fulfilment keeps every pre-existing caller identical).
 * Acquisition: additionally includes the AE bench — active, non-test
 * setters_profiles rows in the 'sales' department whose user holds the
 * account_executive role — mirroring the is_active_genuine_ae RLS gate
 * (migration 20260729120000): the acquisition SDR manager manages the
 * whole department, AEs included.
 */
export async function fetchManagedAttendanceRoster(
  department:
    | "fulfilment"
    | "acquisition"
    | Array<"fulfilment" | "acquisition"> = "fulfilment",
): Promise<AttendanceEmployee[]> {
  // A dual-department manager passes both departments and gets the union;
  // a scalar argument behaves exactly as before.
  const managed = Array.isArray(department) ? department : [department];
  const departments = managed.flatMap((d) => (d === "acquisition" ? [d, "sales"] : [d]));
  const { data, error } = await supabase
    .from("setters_profiles")
    .select("user_id, full_name, email, department")
    .in("department", departments)
    .eq("active", true)
    .eq("is_test_account", false)
    .order("full_name");
  if (error) throw error;
  const rows = (data || []).filter((s) => s.user_id);
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", rows.map((r) => r.user_id as string));
  const rolesByUser = new Map<string, Set<string>>();
  (roleRows || []).forEach((r) => {
    if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, new Set());
    rolesByUser.get(r.user_id)!.add(r.role as string);
  });
  return rows
    .filter((s) => {
      const roles = rolesByUser.get(s.user_id as string);
      if (!roles) return false;
      // 'sales' rows are the AE bench; department rows must be genuine setters.
      return s.department === "sales" ? roles.has("account_executive") : roles.has("setter");
    })
    .map((s) => ({
      id: s.user_id as string,
      name: s.full_name || s.email || "Unknown",
      email: s.email || "",
    }));
}
