import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LogIn, Search, UserCog } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  IMPERSONATION_ACTIVE_KEY,
  IMPERSONATION_DEV_SESSION_KEY,
} from "@/lib/impersonation";

interface ManagedUser {
  id: string;
  full_name: string;
  email: string;
  roles: string[];
  primary_role: string;
}

// supabase.functions.invoke reports non-2xx responses as a generic
// "Edge Function returned a non-2xx status code". The real message is in the
// JSON body on error.context (a Response) — pull it out for a useful toast.
async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return body.error as string;
    } catch {
      /* body wasn't JSON — fall through */
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export function ImpersonationModule() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("admin-users", { method: "GET" });
        if (error) throw error;
        setUsers(data?.users ?? []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        toast.error("Failed to load users: " + message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.roles?.some((r) => r.toLowerCase().includes(q)),
    );
  }, [users, search]);

  const startImpersonation = async (target: ManagedUser) => {
    setStartingId(target.id);
    try {
      // Stash the dev's own session so the banner's Exit can restore it.
      const { data: sessionData } = await supabase.auth.getSession();
      const devSession = sessionData?.session;
      if (!devSession) {
        toast.error("No active session found. Please sign in again.");
        return;
      }
      sessionStorage.setItem(
        IMPERSONATION_DEV_SESSION_KEY,
        JSON.stringify({
          access_token: devSession.access_token,
          refresh_token: devSession.refresh_token,
          email: devSession.user?.email ?? null,
        }),
      );

      const { data, error } = await supabase.functions.invoke("impersonate-user", {
        method: "POST",
        body: { userId: target.id },
      });
      if (error) {
        sessionStorage.removeItem(IMPERSONATION_DEV_SESSION_KEY);
        toast.error(await functionErrorMessage(error, "Could not impersonate"));
        return;
      }
      if (!data?.token_hash || !data?.email) throw new Error("Impersonation token not returned");

      // The per-tab flag goes on BEFORE the session is exchanged, so the
      // impersonated session is written to this tab's sessionStorage and the
      // dev's own session in the shared store is left exactly as it was.
      sessionStorage.setItem(
        IMPERSONATION_ACTIVE_KEY,
        JSON.stringify({
          targetEmail: target.email,
          targetName: target.full_name,
          devEmail: devSession.user?.email ?? null,
        }),
      );

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "magiclink",
      });
      if (verifyError) {
        sessionStorage.removeItem(IMPERSONATION_ACTIVE_KEY);
        throw verifyError;
      }

      // Reload as the target user; the global banner picks up the active flag.
      window.location.assign("/");
    } catch (err) {
      sessionStorage.removeItem(IMPERSONATION_DEV_SESSION_KEY);
      const message = err instanceof Error ? err.message : "unknown error";
      toast.error("Could not impersonate: " + message);
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="dc-embed space-y-4">
      <div className="flex items-start gap-3">
        <UserCog className="h-5 w-5 mt-0.5 text-[var(--dc-cyan)]" />
        <div>
          <h2 className="text-lg font-medium text-[var(--dc-text)]">Impersonate a user</h2>
          <p className="text-sm text-[var(--dc-text-dim)] max-w-2xl">
            Sign in as any user to see exactly what they see. This starts a real session as them —
            every impersonation is recorded in the audit log. Use the banner at the top to exit and
            return to your dev account.
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, email, or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-[var(--dc-text-dim)]">Loading users…</p>
      ) : (
        <div className="border border-[var(--dc-border)] rounded-md divide-y divide-[var(--dc-border)] max-h-[520px] overflow-auto">
          {filtered.length === 0 && (
            <p className="p-4 text-sm text-[var(--dc-text-dim)]">No users match “{search}”.</p>
          )}
          {filtered.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-4 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--dc-text)] truncate">
                  {u.full_name || u.email}
                </p>
                <p className="text-xs text-[var(--dc-text-dim)] truncate">
                  {u.email}
                  {u.roles?.length ? ` · ${u.roles.join(", ")}` : ""}
                </p>
              </div>
              {u.id === user?.id ? (
                <span className="text-xs uppercase tracking-wide text-[var(--dc-text-dim)] shrink-0">
                  You
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={startingId !== null}
                  onClick={() => startImpersonation(u)}
                >
                  <LogIn className="h-4 w-4 mr-1.5" />
                  {startingId === u.id ? "Starting…" : "Log in as"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
