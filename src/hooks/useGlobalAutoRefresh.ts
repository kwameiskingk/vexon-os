import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Mounts a global 5-minute interval that invalidates all React Query caches.
 * Keeps every dashboard in sync with the n8n → /setter-metrics push (5-min cadence)
 * without requiring a page reload. Also re-syncs when the tab regains focus.
 */
const FIVE_MIN_MS = 5 * 60 * 1000;

export function useGlobalAutoRefresh() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const tick = () => queryClient.invalidateQueries();

    const interval = setInterval(tick, FIVE_MIN_MS);

    const onFocus = () => {
      const last = Number(sessionStorage.getItem("lastGlobalRefresh") || 0);
      if (Date.now() - last > 60_000) {
        tick();
        sessionStorage.setItem("lastGlobalRefresh", String(Date.now()));
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [queryClient]);
}
