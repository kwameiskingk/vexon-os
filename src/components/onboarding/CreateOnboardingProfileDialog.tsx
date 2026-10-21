// Create an onboarding profile for a candidate at the Onboarding stage —
// opened from the Candidate Tracking → Onboarding progress section (the
// candidate card panel no longer carries this action).
//
// One submit does three halves: the profile + seeded step list, the real
// login via the create-user edge function's onboarding path (which forces
// in_onboarding_mode server-side and restricts the role to the four allowed
// targets), then the branded invite email to the candidate's PERSONAL
// address via onboarding-invite. If provisioning fails — e.g. the updated
// function hasn't been Published yet — the profile still exists and the
// tracking row offers "Provision & send invite" as a retry. If only the
// invite email fails (no personal address / Resend down), the parent falls
// back to showing the one-time credentials as before.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ONBOARDING_TARGET_ROLES } from "@/lib/hiringPipeline";
import {
  useCreateOnboardingProfile,
  useProvisionOnboardingLogin,
  useSendOnboardingInvite,
} from "@/hooks/useEmployeeOnboarding";
import type { PipelineCandidateRow } from "@/hooks/useHiringPipeline";
import { useTrialistToOnboarding } from "@/hooks/useTrialDay";
import { Switch } from "@/components/ui/switch";

export interface ProvisionOutcome {
  name: string;
  /** Company email — their Vexon OS sign-in. */
  email: string;
  /** The candidate's personal address the invite went (or should go) to. */
  personalEmail: string | null;
  /** One-time password — shown only when the invite email couldn't be sent. */
  password: string;
  inviteSent: boolean;
  /** Why the invite wasn't sent, when it wasn't. */
  inviteError: string | null;
}

interface CreateOnboardingProfileDialogProps {
  candidate: PipelineCandidateRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when provisioning succeeds — invite sent, or credentials fallback. */
  onProvisioned: (outcome: ProvisionOutcome) => void;
}

export function CreateOnboardingProfileDialog({
  candidate,
  open,
  onOpenChange,
  onProvisioned,
}: CreateOnboardingProfileDialogProps) {
  const [companyEmail, setCompanyEmail] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [startDate, setStartDate] = useState("");
  const create = useCreateOnboardingProfile();
  const provision = useProvisionOnboardingLogin();
  const invite = useSendOnboardingInvite();
  // Trial Day (15 Sep): a passed trialist keeps the same login. No second
  // account, no invite — the flags flip and they land on /onboarding.
  const carryOver = useTrialistToOnboarding();
  const hasTrialLogin = !!candidate?.trialist_user_id;
  const [reuseTrialLogin, setReuseTrialLogin] = useState(true);

  useEffect(() => {
    if (open) {
      setCompanyEmail("");
      setTargetRole("");
      setStartDate("");
      setReuseTrialLogin(true);
    }
  }, [open, candidate?.id]);

  if (!candidate) return null;
  const fullName = `${candidate.first_name} ${candidate.last_name}`.trim();
  const reusing = hasTrialLogin && reuseTrialLogin;
  const busy = create.isPending || provision.isPending || invite.isPending || carryOver.isPending;

  const submit = async () => {
    if (reusing) {
      try {
        const outcome = await create.mutateAsync({
          candidateId: candidate.id,
          fullName,
          personalEmail: candidate.email ?? null,
          companyEmail: companyEmail.trim() || candidate.email || "",
          targetRole,
          cvScreeningId: candidate.cv_screening_id ?? null,
          startDate: startDate || null,
        });
        await carryOver.mutateAsync({ candidateId: candidate.id, onboardingId: outcome.onboardingId, targetRole });
        onOpenChange(false);
        toast.success(`${fullName} is in onboarding with their trialist login — no new account, no invite needed.`);
      } catch (err) {
        toast.error(`Couldn't carry the login over: ${err instanceof Error ? err.message : "unknown error"}`);
      }
      return;
    }
    let onboardingId: string;
    try {
      const outcome = await create.mutateAsync({
        candidateId: candidate.id,
        fullName,
        personalEmail: candidate.email ?? null,
        companyEmail: companyEmail.trim(),
        targetRole,
        cvScreeningId: candidate.cv_screening_id ?? null,
        startDate: startDate || null,
      });
      onboardingId = outcome.onboardingId;
      if (outcome.startDateDropped) {
        toast.warning("Profile created without the start date. Run the 3 Sep migration, then set it from their row.");
      }
      if (outcome.migrationPending) {
        toast.warning(
          "Steps were seeded untyped — run migration M7 (2026-08-17-onboarding-steps.sql).",
        );
      }
    } catch (err) {
      toast.error(
        `Couldn't create the profile: ${err instanceof Error ? err.message : "unknown error"}`,
      );
      return;
    }

    let password: string;
    try {
      password = await provision.mutateAsync({
        onboardingId,
        email: companyEmail.trim(),
        displayName: fullName,
        targetRole,
      });
    } catch (err) {
      onOpenChange(false);
      toast.error(
        `Profile created, but the login wasn't provisioned: ${err instanceof Error ? err.message : "unknown error"}. Use "Provision & send invite" on their row to retry.`,
      );
      return;
    }

    // Happy path: email the NEW COMPANY mailbox a set-password invite (11 Sep,
    // Marcus: the first email they ever receive there is the onboarding).
    // Failure here is survivable — the parent shows the credentials fallback.
    const personalEmail = candidate.email?.trim() || null;
    let inviteSent = false;
    let inviteError: string | null = null;
    try {
      await invite.mutateAsync({
        companyEmail: companyEmail.trim(),
        personalEmail,
        fullName,
      });
      inviteSent = true;
    } catch (err) {
      inviteError = err instanceof Error ? err.message : "unknown error";
    }

    onOpenChange(false);
    if (inviteSent) toast.success(`Invite sent to ${companyEmail.trim()}`);
    onProvisioned({
      name: fullName,
      email: companyEmail.trim(),
      personalEmail,
      password,
      inviteSent,
      inviteError,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start onboarding — {fullName}</DialogTitle>
          <DialogDescription>
            Creates the profile with its two-phase step list, provisions their login in
            onboarding mode, and emails
            {candidate.email ? ` ${candidate.email}` : " their personal address"} an invite to
            set their own password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input value={fullName} disabled />
          </div>
          {hasTrialLogin && (
            <label className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">Use their trialist login</span>
                <span className="block text-xs text-muted-foreground">
                  They passed the trial on this login. Keep it: no new account, no invite, they sign in as before and land on
                  the onboarding page. Change the email later once their @meridiansales.example mailbox exists.
                </span>
              </span>
              <Switch checked={reuseTrialLogin} onCheckedChange={setReuseTrialLogin} className="mt-0.5" />
            </label>
          )}
          <div className="space-y-2">
            <Label htmlFor="company-email">{reusing ? "Company email (optional for now)" : "Company email *"}</Label>
            <Input
              id="company-email"
              type="email"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
              placeholder="firstname@meridiansales.example"
            />
            <p className="text-xs text-muted-foreground">
              Their new Google Workspace address. Create that mailbox first: it becomes their Vexon OS sign-in and the
              onboarding invite is sent there, not to their personal email.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="start-date">Start date</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Their first day. Shows as a countdown on their onboarding page. You can set it later from their row.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-role">Role they are starting in *</Label>
            <Select value={targetRole} onValueChange={setTargetRole}>
              <SelectTrigger id="target-role">
                <SelectValue placeholder="Choose a role…" />
              </SelectTrigger>
              <SelectContent>
                {ONBOARDING_TARGET_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={(!reusing && !companyEmail.trim()) || !targetRole || busy} onClick={submit}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {reusing
              ? carryOver.isPending
                ? "Carrying login over…"
                : "Start onboarding"
              : invite.isPending
                ? "Sending invite…"
                : provision.isPending
                  ? "Provisioning login…"
                  : "Create & invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
