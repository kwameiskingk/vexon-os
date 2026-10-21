// Dev impersonation session storage (12 Oct 2026).
//
// Supabase keeps one session per site in localStorage, shared by every tab.
// While a dev is impersonating a setter in one tab, any other Vexon OS tab
// (the dev as themselves, or a second impersonation) refreshing its token
// overwrote that session, and the impersonating tab fell to "No access" and
// then the login page mid-recording. While the per-tab impersonation flag is
// set, auth reads and writes go to sessionStorage instead, so the impersonated
// session belongs to its tab alone and the dev's own session in the shared
// store is never touched. With no flag set, the wrapped storage is used as is.

import { IMPERSONATION_ACTIVE_KEY } from "@/lib/impersonation";

type AuthStorage = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

const impersonating = () => {
  try {
    return typeof window !== "undefined" && !!sessionStorage.getItem(IMPERSONATION_ACTIVE_KEY);
  } catch {
    return false;
  }
};

export function impersonationAwareStorage(inner: AuthStorage | Storage | undefined): AuthStorage | undefined {
  if (!inner || typeof window === "undefined") return inner as AuthStorage | undefined;
  return {
    getItem: (key) => (impersonating() ? sessionStorage.getItem(key) : inner.getItem(key)),
    setItem: (key, value) => (impersonating() ? sessionStorage.setItem(key, value) : inner.setItem(key, value)),
    removeItem: (key) => (impersonating() ? sessionStorage.removeItem(key) : inner.removeItem(key)),
  };
}
