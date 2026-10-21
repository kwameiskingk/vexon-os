import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, KeyRound, MailQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import bookingsLogo from "@/assets/vexon-mark-tile.svg";

/**
 * /welcome — where the onboarding invite email's "Set your password" button
 * lands. Public route (the token IS the authentication): reads the one-shot
 * token_hash from the URL FRAGMENT (never sent to any server), exchanges it
 * via verifyOtp(type "recovery"), then lets the starter set their own
 * password. Clearing must_change_password here means the root-mounted
 * ForcePasswordChangeGate won't ask them a second time; the full-page
 * navigate to "/" then lets ProtectedRoute's onboarding-mode check funnel
 * them straight into /onboarding.
 */

// Same rules as ForcePasswordChangeGate.validatePassword.
const FORBIDDEN_PASSWORDS = new Set(["test123", "dev123", "temppassword123!"]);

function validatePassword(pw: string, confirm: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (FORBIDDEN_PASSWORDS.has(pw.toLowerCase())) return "Choose a password that isn't the shared default.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must contain at least one letter and one number.";
  if (pw !== confirm) return "Passwords do not match.";
  return null;
}

export default function WelcomePage() {
  // Capture the fragment once, before anything can change it. The token is
  // one-shot, so it must never be parsed twice.
  const [params] = useState(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const p = new URLSearchParams(hash);
    return { tokenHash: p.get("token_hash"), email: p.get("email") };
  });
  // "ready" is a deliberate gate before the one-shot token is consumed:
  // corporate email scanners (Outlook SafeLinks, Mimecast, Proofpoint)
  // pre-open links in headless browsers and would burn the token before the
  // real starter clicks. verifyOtp only fires on their button press.
  const [state, setState] = useState<"ready" | "verifying" | "form" | "invalid">(
    params.tokenHash ? "ready" : "invalid",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const verifyStarted = useRef(false);

  // Scrub the token from the address bar/history immediately (kept in memory
  // via `params`), but do not consume it until the user acts.
  useEffect(() => {
    if (params.tokenHash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [params.tokenHash]);

  const beginVerify = async () => {
    if (!params.tokenHash || verifyStarted.current) return;
    verifyStarted.current = true; // one-shot token — never verify twice
    setState("verifying");
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.tokenHash,
      type: "recovery",
    });
    setState(error ? "invalid" : "form");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validatePassword(password, confirm);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) throw pwError;
      // Clear the first-sign-in flag so the app-root gate doesn't ask again
      // (self-update RLS allows this). Non-fatal: worst case the gate shows.
      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user) {
        await supabase
          .from("profiles")
          .update({ must_change_password: false })
          .eq("id", auth.user.id);
      }
      // Full navigation so the app boots with the fresh session. Clients go
      // straight to their onboarding journey — "/" is the TEAM login and would
      // strand them there (bug found in the owner's first live test, 26 Aug).
      // Staff/new starters keep the old root landing (ProtectedRoute funnels
      // onboarding-mode starters to /onboarding).
      let destination = "/";
      if (auth?.user) {
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", auth.user.id);
        const roles = (roleRows ?? []).map((r) => r.role as string);
        if (roles.length > 0 && roles.every((r) => r === "client")) {
          destination = "/client/onboarding";
        }
      }
      window.location.assign(destination);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Couldn't set your password. Please try again.",
      );
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen px-4 py-10 flex flex-col items-center"
      style={{
        colorScheme: "light",
        background:
          "radial-gradient(900px 500px at 15% -5%, #ededf0 0%, transparent 60%)," +
          "radial-gradient(800px 480px at 90% 0%, #e8ecf1 0%, transparent 55%), #f7f7f8",
      }}
    >
      <div className="flex items-center gap-2.5 mb-8">
        <img src={bookingsLogo} alt="Vexon OS" className="w-9 h-9 rounded-xl shadow-sm" />
        <span className="text-[11px] font-bold tracking-[0.22em]" style={{ color: "#111113" }}>
          VEXON <span className="rr-gradient-text">VEXON OS</span>
        </span>
      </div>
      <div
        className="bg-white rounded-3xl p-10 max-w-lg w-full"
        style={{ border: "1px solid #e3e3e6", boxShadow: "0 20px 60px rgba(154,86,208,.14)" }}
      >
        {state === "ready" && (
          <div className="text-center space-y-4">
            <KeyRound className="h-9 w-9 mx-auto" style={{ color: "#4a5d73" }} />
            <h1 className="text-2xl font-bold" style={{ color: "#111113" }}>
              Welcome to Vexon OS
            </h1>
            <p className="text-sm" style={{ color: "#5f5f66" }}>
              {params.email ? (
                <>Your account <strong style={{ color: "#3d5a80" }}>{params.email}</strong> is ready. Continue to set the password you'll sign in with.</>
              ) : (
                <>Your account is ready. Continue to set the password you'll sign in with.</>
              )}
            </p>
            <Button
              type="button"
              onClick={beginVerify}
              className="w-full text-white"
              style={{ background: "linear-gradient(135deg,#8c8c8c,#5a5a5a,#3d5a80)" }}
            >
              Continue to set your password →
            </Button>
          </div>
        )}

        {state === "verifying" && (
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto" style={{ color: "#4a5d73" }} />
            <p style={{ color: "#5f5f66" }}>Checking your invite…</p>
          </div>
        )}

        {state === "invalid" && (
          <div className="text-center space-y-3">
            <MailQuestion className="h-9 w-9 mx-auto" style={{ color: "#9e9e9e" }} />
            <p className="font-semibold text-lg" style={{ color: "#111113" }}>
              This invite link isn't valid any more
            </p>
            <p className="text-sm" style={{ color: "#5f5f66" }}>
              Invite links only work once and expire after a short while. Ask the person
              onboarding you to resend your invite and use the newest email.
            </p>
          </div>
        )}

        {state === "form" && (
          <form onSubmit={submit} className="space-y-5">
            <div className="text-center space-y-2">
              <KeyRound className="h-9 w-9 mx-auto" style={{ color: "#4a5d73" }} />
              <h1 className="text-2xl font-bold" style={{ color: "#111113" }}>
                Welcome to Vexon OS
              </h1>
              <p className="text-sm" style={{ color: "#5f5f66" }}>
                {params.email ? (
                  <>
                    Your account <strong style={{ color: "#3d5a80" }}>{params.email}</strong> is
                    ready — choose the password you'll sign in with.
                  </>
                ) : (
                  <>Your account is ready — choose the password you'll sign in with.</>
                )}
              </p>
            </div>
            <div className="space-y-2 text-left">
              <Label htmlFor="new-password" style={{ color: "#111113" }}>
                New password
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <div className="space-y-2 text-left">
              <Label htmlFor="confirm-password" style={{ color: "#111113" }}>
                Confirm password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={saving}
              />
            </div>
            <p className="text-xs" style={{ color: "#5f5f66" }}>
              At least 8 characters, including a letter and a number.
            </p>
            {formError && (
              <p className="text-sm font-medium" style={{ color: "#be185d" }}>
                {formError}
              </p>
            )}
            <Button
              type="submit"
              disabled={saving}
              className="w-full text-white"
              style={{ background: "linear-gradient(135deg,#8c8c8c,#5a5a5a,#3d5a80)" }}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Setting up your account…" : "Set password & get started"}
            </Button>
          </form>
        )}
      </div>
      <p className="text-center text-[11px] mt-6" style={{ color: "#8e8e96" }}>
        Powered by <span className="font-semibold" style={{ color: "#5f5f66" }}>Vexon OS</span>
      </p>
    </div>
  );
}
