import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ShieldCheck, CheckCircle2 } from "lucide-react";

// Passwords we ship as shared seeds — a "new" password may not be one of these.
const FORBIDDEN_PASSWORDS = new Set(["test123", "dev123", "temppassword123!"]);

function validatePassword(pw: string, confirm: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (FORBIDDEN_PASSWORDS.has(pw.toLowerCase())) return "Choose a password that isn't the shared default.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must contain at least one letter and one number.";
  if (pw !== confirm) return "Passwords do not match.";
  return null;
}

/**
 * Blocks the entire app behind a non-dismissible modal whenever the signed-in
 * user's `profiles.must_change_password` flag is set. Mounted once at the app
 * root so it covers every route (internal dashboards and external portals).
 */
export function ForcePasswordChangeGate() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const { data: mustChange } = useQuery({
    queryKey: ["must-change-password", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.must_change_password ?? false;
    },
    enabled: !!user,
    staleTime: Infinity,
  });

  // The /welcome invite page IS a set-password flow (it signs the starter in
  // via the emailed token, then collects their password and clears the flag
  // itself) — popping this modal over it would make them set a password twice.
  if (pathname === "/welcome") return null;

  if (!user || !mustChange) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validatePassword(newPassword, confirmPassword);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
      if (pwError) throw pwError;

      const { error: flagError } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", user.id);
      if (flagError) throw flagError;

      setDone(true);
    } catch (err: any) {
      toast.error(err.message ?? "Could not update your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = () => {
    // Refresh the flag query so the gate unmounts and the app becomes usable.
    queryClient.invalidateQueries({ queryKey: ["must-change-password", user.id] });
  };

  return (
    <Dialog open>
      <DialogContent
        // Hide only the built-in close (X) button — the sole direct child
        // with the `absolute` class — so the modal can't be dismissed without
        // setting a password. A bare `[&>button]` would also hide the
        // confirmation step's Continue button, trapping the user.
        className="sm:max-w-md [&>button.absolute]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        {done ? (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-2">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
              <DialogTitle className="text-center">Password updated</DialogTitle>
              <DialogDescription className="text-center">
                This is your password going forward. Use it every time you sign in from now on.
              </DialogDescription>
            </DialogHeader>
            <Button className="w-full mt-2" onClick={handleContinue}>
              Continue
            </Button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <div className="flex justify-center mb-2">
                <ShieldCheck className="h-10 w-10 text-primary" />
              </div>
              <DialogTitle className="text-center">Set your new password</DialogTitle>
              <DialogDescription className="text-center">
                For security, you need to set your own password before continuing. This replaces the
                shared default and will be your password from now on.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                At least 8 characters, including a letter and a number.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Saving…" : "Set password"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
