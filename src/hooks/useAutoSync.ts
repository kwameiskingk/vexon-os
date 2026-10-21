/**
 * Google Sheets auto-sync has been disabled.
 * Setter metrics now flow into the database via the n8n → /setter-metrics edge function (every 5 min).
 * This hook is kept as a no-op so existing call sites continue to compile.
 */
export const useAutoSync = (_onSyncComplete?: () => void) => {
  // Intentionally empty.
};
