import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type SdrManagerDepartment = "fulfilment" | "acquisition";

/* ------------------------------------------------------------------ */
/* Shared activeScope store                                            */
/*                                                                     */
/* This MUST be a single store shared by every hook instance, not      */
/* per-component useState (the PR #116 defect): the pill lives in      */
/* AppSidebar while the dashboard, metrics page etc. hold their own    */
/* useSdrManagerScope() calls. With usePersistedState each instance    */
/* kept its own mount-time copy, so clicking the pill re-rendered the  */
/* sidebar only — every already-mounted surface silently stayed on its */
/* stale scope even though the diff "showed" activeScope threaded in.  */
/* useSyncExternalStore re-renders every subscribed component on       */
/* setActiveScope, which invalidates their query keys at runtime.      */
/* ------------------------------------------------------------------ */

const SCOPE_STORAGE_KEY = "sdr-manager-active-scope";

const readStoredScope = (): SdrManagerDepartment | null => {
  try {
    const raw = localStorage.getItem(SCOPE_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return parsed === "fulfilment" || parsed === "acquisition" ? parsed : null;
  } catch {
    return null;
  }
};

let storedScope: SdrManagerDepartment | null = readStoredScope();
const scopeListeners = new Set<() => void>();

const setStoredScope = (d: SdrManagerDepartment) => {
  storedScope = d;
  try {
    localStorage.setItem(SCOPE_STORAGE_KEY, JSON.stringify(d));
  } catch (error) {
    console.warn(`Failed to write localStorage key "${SCOPE_STORAGE_KEY}":`, error);
  }
  scopeListeners.forEach((l) => l());
};

const subscribeToScope = (listener: () => void) => {
  scopeListeners.add(listener);
  // Cross-tab sync: another tab's pill click updates this tab too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === SCOPE_STORAGE_KEY) {
      storedScope = readStoredScope();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    scopeListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
};

const getStoredScope = () => storedScope;

/** Fulfilment first — matches the legacy scalar hook's resolution order, so a
 *  dual-department manager's default activeScope is what they resolved to
 *  before the array conversion. */
const DEPARTMENT_ORDER: SdrManagerDepartment[] = ["fulfilment", "acquisition"];

const FALLBACK_DEPARTMENTS: SdrManagerDepartment[] = ["fulfilment"];

/**
 * Every setter department the logged-in SDR manager runs, derived from
 * user_department_access with the same mapping the Leaderboard and the
 * auto_assign_setter_to_managers trigger use (operations → fulfilment,
 * sales → acquisition). Returns ALL held departments — this replaces
 * useSdrManagerDepartment's "fulfilment wins" scalar collapse, which made
 * granting a second department HIDE surfaces instead of adding them.
 *
 * activeScope is the persisted department-aggregate view selection (morning
 * meeting, metrics, RAG, targets, team strip). It defaults to departments[0]
 * and is validated against departments on read, so a stale persisted value
 * can never strand the UI on a department the manager no longer holds.
 * Person-level surfaces should union over `departments` instead.
 *
 * Fallback semantics (deliberate, carried over from the scalar hook):
 * - Query genuinely succeeded with no department rows → ["fulfilment"]
 *   (legacy default; a console.warn flags the missing row).
 * - Query FAILED → the error is thrown to React Query (isError/error are
 *   exposed) and logged via console.error. `departments` still reads
 *   ["fulfilment"] so department-gated surfaces fail closed rather than
 *   crash, but callers can tell an error apart from a real fulfilment
 *   manager.
 */
export function useSdrManagerScope(): {
  departments: SdrManagerDepartment[];
  activeScope: SdrManagerDepartment;
  setActiveScope: (d: SdrManagerDepartment) => void;
  isMultiDepartment: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
} {
  const { user, userRoles } = useAuth();
  const isSdrManager = Array.isArray(userRoles) && userRoles.includes("sdr_manager");
  // 2 Sep ruling: an admin/dev on SDR-manager surfaces (Marcus acting as the
  // SDR manager after both real managers left) runs the WHOLE company — both
  // departments at once, filterable via activeScope. No department-access
  // query, no assignment rows; RLS already lets admin read everything.
  const isAdminTier =
    !isSdrManager &&
    Array.isArray(userRoles) &&
    (userRoles.includes("admin") || userRoles.includes("dev"));

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["sdr-manager-departments", user?.id],
    queryFn: async (): Promise<SdrManagerDepartment[]> => {
      const { data: deptAccess, error: queryError } = await supabase
        .from("user_department_access")
        .select("department")
        .eq("user_id", user!.id);
      if (queryError) {
        console.error(
          "useSdrManagerScope: user_department_access query failed for user",
          user!.id,
          queryError,
        );
        throw queryError;
      }
      const access = (deptAccess || []).map((d) => d.department);
      const departments = DEPARTMENT_ORDER.filter((dept) =>
        access.includes(dept === "fulfilment" ? "operations" : "sales"),
      );
      if (departments.length === 0) {
        console.warn(
          "useSdrManagerScope: sdr_manager has no user_department_access rows; defaulting to fulfilment",
          user!.id,
        );
        return FALLBACK_DEPARTMENTS;
      }
      return departments;
    },
    enabled: !!user?.id && isSdrManager,
    staleTime: 5 * 60 * 1000,
  });

  const departments = useMemo(
    () => (isAdminTier ? DEPARTMENT_ORDER : data ?? FALLBACK_DEPARTMENTS),
    [isAdminTier, data],
  );

  const persistedScope = useSyncExternalStore(subscribeToScope, getStoredScope);
  const setActiveScope = useCallback((d: SdrManagerDepartment) => setStoredScope(d), []);
  // Validated on read: a persisted scope for a department the manager doesn't
  // hold (revoked grant, different user on this browser) falls back to
  // departments[0] instead of stranding every scoped surface.
  const activeScope =
    persistedScope !== null && departments.includes(persistedScope)
      ? persistedScope
      : departments[0];

  return {
    departments,
    activeScope,
    setActiveScope,
    isMultiDepartment: departments.length > 1,
    isLoading: isSdrManager ? isLoading : false,
    isError: isSdrManager ? isError : false,
    error: isSdrManager ? (error ?? null) : null,
  };
}
