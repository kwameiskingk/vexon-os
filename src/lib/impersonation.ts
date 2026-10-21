// Shared keys + helpers for dev impersonation state, kept in sessionStorage
// so it is scoped to the single browser tab doing the impersonation.

export const IMPERSONATION_DEV_SESSION_KEY = "impersonation.devSession";
export const IMPERSONATION_ACTIVE_KEY = "impersonation.active";

export interface ImpersonationActive {
  targetEmail: string;
  targetName: string;
  devEmail: string | null;
}

export interface StashedDevSession {
  access_token: string;
  refresh_token: string;
  email: string | null;
}

export function readActiveImpersonation(): ImpersonationActive | null {
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as ImpersonationActive) : null;
  } catch {
    return null;
  }
}

export function readStashedDevSession(): StashedDevSession | null {
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_DEV_SESSION_KEY);
    return raw ? (JSON.parse(raw) as StashedDevSession) : null;
  } catch {
    return null;
  }
}

export function clearImpersonation() {
  sessionStorage.removeItem(IMPERSONATION_ACTIVE_KEY);
  sessionStorage.removeItem(IMPERSONATION_DEV_SESSION_KEY);
}
