// Auth storage adapter for the Supabase client.
// Vexon OS keeps the session in localStorage; this wrapper only guards
// against environments where storage is unavailable (SSR, blocked storage).
export function brokeredPreviewStorage() {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
