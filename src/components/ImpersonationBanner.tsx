import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  clearImpersonation,
  readActiveImpersonation,
  readStashedDevSession,
} from "@/lib/impersonation";

/**
 * Persistent warning bar shown while a dev is impersonating another user.
 * Reads the per-tab sessionStorage flag set when impersonation started, and
 * restores the dev's own session on exit. Mounted once at the app root.
 */
export function ImpersonationBanner() {
  const active = readActiveImpersonation();
  const [exiting, setExiting] = useState(false);

  if (!active) return null;

  const exit = async () => {
    setExiting(true);
    try {
      // The impersonated session lived in this tab only (sessionStorage), so
      // dropping the flag is enough: the dev's own session is still in the
      // shared store untouched. The stash is a fallback for a tab whose shared
      // session has since been signed out elsewhere.
      await supabase.auth.signOut({ scope: "local" });
      clearImpersonation();
      const dev = readStashedDevSession();
      if (dev?.access_token && dev?.refresh_token) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { error } = await supabase.auth.setSession({ access_token: dev.access_token, refresh_token: dev.refresh_token });
          if (error) throw error;
        }
      }
      window.location.assign("/dev");
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      toast.error("Could not exit impersonation: " + message);
      setExiting(false);
    }
  };

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-amber-950 shadow-md">
      <div className="flex items-center justify-center gap-3 px-4 py-1.5 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Impersonating {active.targetName || active.targetEmail}
          {active.devEmail ? ` — signed in as ${active.devEmail}` : ""}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 border-amber-900/40 bg-amber-100 hover:bg-amber-50 text-amber-950"
          onClick={exit}
          disabled={exiting}
        >
          {exiting ? "Exiting…" : "Exit impersonation"}
        </Button>
      </div>
    </div>
  );
}
