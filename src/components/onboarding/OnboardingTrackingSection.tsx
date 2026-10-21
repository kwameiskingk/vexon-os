// The TA's onboarding tracking view (Candidate Tracking page).
//
// One row per starter: pre-start and day-one progress, which items are
// still outstanding, and a detail sheet listing every step and its state —
// plus the "Release from onboarding" control, which goes through the M7
// SECURITY DEFINER function release_onboarding() (capability-checked
// server-side: can_screen_candidates). The TA has no UPDATE policy on
// profiles, so a direct flag flip would silently do nothing — see
// AUDIT_ONBOARDING.md §4.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { signedAssetUrl, useOnboardingFlowTemplates, rowToTemplate } from "@/hooks/useOnboardingFlow";
import { pastTenseLabel } from "@/components/onboarding-deck/copy";
import { CheckCircle2, Circle, Copy, KeyRound, Loader2, MailCheck, Send, Sunrise, Unlock, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { onboardingTargetRoleLabel } from "@/lib/hiringPipeline";
import {
  PHASE_LABELS,
  phaseProgress,
  resolveSteps,
  type OnboardingPhase,
  type ResolvedStep,
} from "@/lib/onboardingSteps";
import {
  useOnboardingRecords,
  useOnboardingTasks,
  useProvisionOnboardingLogin,
  useReleaseDayOne,
  useReleaseOnboarding,
  useSendOnboardingInvite,
  type OnboardingRecord,
} from "@/hooks/useEmployeeOnboarding";
import { useHiringPipeline, type PipelineCandidateRow } from "@/hooks/useHiringPipeline";
import {
  CreateOnboardingProfileDialog,
  type ProvisionOutcome,
} from "./CreateOnboardingProfileDialog";
import { StarterChecklist, StartDateField } from "./StarterChecklist";

function stateBadge(record: OnboardingRecord) {
  if (record.onboarding_state === "completed") {
    return {
      label: "Released",
      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (record.user_id) {
    return { label: "In onboarding", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" };
  }
  return { label: "No login yet", cls: "bg-muted text-muted-foreground" };
}

function MiniBar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;
  return (
    <div className="w-28">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", complete ? "bg-emerald-500" : "bg-sky-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function OnboardingTrackingSection() {
  const { data: recordsResult } = useOnboardingRecords();
  const { data: tasks } = useOnboardingTasks();
  const { data: flowTemplates } = useOnboardingFlowTemplates();
  const { data: pipelineResult } = useHiringPipeline();
  const release = useReleaseOnboarding();
  const releaseDayOne = useReleaseDayOne();
  const provision = useProvisionOnboardingLogin();
  const invite = useSendOnboardingInvite();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [createFor, setCreateFor] = useState<PipelineCandidateRow | null>(null);
  const [revealed, setRevealed] = useState<ProvisionOutcome | null>(null);

  const records = useMemo(() => recordsResult?.data ?? [], [recordsResult]);
  const startDateReady = recordsResult?.startDateReady ?? false;

  // Candidates at the Onboarding stage with no profile yet — the Kanban's
  // Onboarding column and this section are the same surface: reaching the
  // stage makes them appear here as "needs profile".
  const needsProfile = useMemo(() => {
    const linkedCandidateIds = new Set(records.map((r) => r.candidate_id).filter(Boolean));
    return (pipelineResult?.data ?? []).filter(
      (c) => c.stage_key === "onboarding" && !linkedCandidateIds.has(c.id),
    );
  }, [pipelineResult, records]);

  // The builder templates carry the done labels (7 Sep) the task snapshot
  // does not; merged key by key so the sheet reads in the past tense.
  const liveTemplates = useMemo(
    () => (flowTemplates?.data ?? []).map(rowToTemplate),
    [flowTemplates],
  );
  const stepsFor = useMemo(() => {
    const map = new Map<string, ResolvedStep[]>();
    for (const r of records) {
      map.set(
        r.id,
        resolveSteps(
          (tasks ?? []).filter((t) => t.onboarding_id === r.id),
          r.target_role,
          liveTemplates,
        ),
      );
    }
    return map;
  }, [records, tasks, liveTemplates]);

  const selected = records.find((r) => r.id === selectedId) ?? null;
  const selectedSteps = selected ? stepsFor.get(selected.id) ?? [] : [];

  const doRelease = async () => {
    if (!selected) return;
    try {
      await release.mutateAsync(selected.id);
      toast.success(
        selected.user_id
          ? `${selected.candidate_name ?? "Starter"} released — their full portal is now unlocked`
          : `${selected.candidate_name ?? "Starter"} marked complete (no login linked yet)`,
      );
      setConfirmRelease(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Release failed");
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">Onboarding progress</h3>
        <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums text-muted-foreground">
          {records.length}
        </span>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
          Click a starter for their full checklist
        </span>
        <a
          href="/onboarding/sandbox"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          Run the flow (sandbox) ↗
        </a>
      </header>

      {/* Candidates at the Onboarding stage who still need their profile. */}
      {needsProfile.length > 0 && (
        <ul className="divide-y divide-border border-b border-border bg-amber-500/[0.04]">
          {needsProfile.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {`${c.first_name} ${c.last_name}`.trim() || "Unknown"}
                  </p>
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                    Needs profile
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  Reached the Onboarding stage{c.email ? ` · ${c.email}` : ""} · create their Google Workspace mailbox, then Create &amp; invite
                </p>
              </div>
              <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setCreateFor(c)}>
                <UserPlus className="h-4 w-4" />
                Create profile
              </Button>
            </li>
          ))}
        </ul>
      )}

      {records.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {needsProfile.length > 0
            ? "No profiles yet — create them from the candidates above."
            : "Nobody is onboarding. Candidates appear here when they reach the Onboarding stage."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {records.map((r) => {
            const steps = stepsFor.get(r.id) ?? [];
            const progress = phaseProgress(steps);
            const outstanding = steps.filter((s) => !s.done);
            const badge = stateBadge(r);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {r.candidate_name ?? "Unnamed"}
                      </p>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", badge.cls)}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {onboardingTargetRoleLabel(r.target_role)}
                      {r.company_email ? ` · ${r.company_email}` : ""}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                      {outstanding.length === 0
                        ? "All steps complete"
                        : `Outstanding: ${outstanding
                            .slice(0, 2)
                            .map((s) => s.label)
                            .join(", ")}${outstanding.length > 2 ? ` +${outstanding.length - 2} more` : ""}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-4">
                    <MiniBar
                      label="Pre-start"
                      done={progress.pre_start.done}
                      total={progress.pre_start.total}
                    />
                    <MiniBar
                      label="Day 1"
                      done={progress.day_one.done}
                      total={progress.day_one.total}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Per-starter detail: every step, its state, and the release control. */}
      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-md">
          {selected && (
            <>
              {/* Identity header — same tinted-band idiom as the candidate
                  side panel (Run 3 restyle). */}
              <div className="border-b border-border bg-gradient-to-b from-primary/[0.08] via-primary/[0.03] to-transparent px-6 pb-5 pt-6">
                <SheetHeader className="space-y-0 text-left">
                  <div className="flex items-start gap-3.5 pr-8">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-base font-semibold text-primary">
                      {(selected.candidate_name ?? "?")
                        .split(/\s+/)
                        .map((p) => p[0] ?? "")
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "?"}
                    </span>
                    <div className="min-w-0">
                      <SheetTitle className="font-heading leading-tight">
                        {selected.candidate_name ?? "Unnamed"}
                      </SheetTitle>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs text-foreground">
                          {onboardingTargetRoleLabel(selected.target_role)}
                        </span>
                        {selected.company_email && (
                          <span className="inline-flex max-w-full items-center rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs text-foreground">
                            <span className="truncate">{selected.company_email}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </SheetHeader>
              </div>

              <div className="space-y-4 px-5 py-5">
                {(["pre_start", "day_one"] as OnboardingPhase[]).map((phase) => {
                  const phaseSteps = selectedSteps.filter((s) => s.phase === phase);
                  if (phaseSteps.length === 0) return null;
                  const accent =
                    phase === "pre_start"
                      ? "bg-sky-500/10 border-b-sky-500/20"
                      : "bg-violet-500/10 border-b-violet-500/20";
                  return (
                    <section
                      key={phase}
                      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                    >
                      <header className={cn("border-b px-3.5 py-2", accent)}>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                          {PHASE_LABELS[phase]}
                        </h4>
                      </header>
                      <ul className="space-y-1.5 px-3.5 py-3">
                        {phaseSteps.map((s) => (
                          <li key={s.taskId} className="flex items-start gap-2.5">
                            {s.done ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            ) : (
                              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                            )}
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "text-sm",
                                  s.done ? "text-muted-foreground" : "text-foreground",
                                )}
                              >
                                {s.done ? pastTenseLabel(s.label, s.doneLabel) : s.label}
                              </p>
                              {s.answer && (
                                <p className="truncate text-xs text-muted-foreground/80">
                                  {s.answer}
                                </p>
                              )}
                              {s.proofPath && (
                                <button
                                  type="button"
                                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                                  onClick={async () => {
                                    try {
                                      window.open(await signedAssetUrl(s.proofPath!), "_blank");
                                    } catch {
                                      toast.error("Couldn't open the proof file.");
                                    }
                                  }}
                                >
                                  View the uploaded proof
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}

                {/* Elena's own to-dos for this starter + their first day (3 Sep). */}
                <StartDateField record={selected} ready={startDateReady} />
                <StarterChecklist onboardingId={selected.id} />

                {/* Provision retry — for profiles whose login creation
                    failed or predates provisioning. Sends the email invite
                    too; the credentials dialog is only the fallback. */}
                {!selected.user_id && selected.onboarding_state !== "completed" && (
                  <div className="rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={
                        !selected.company_email ||
                        !selected.target_role ||
                        provision.isPending ||
                        invite.isPending
                      }
                      onClick={async () => {
                        let password: string;
                        try {
                          password = await provision.mutateAsync({
                            onboardingId: selected.id,
                            email: selected.company_email!,
                            displayName: selected.candidate_name ?? "",
                            targetRole: selected.target_role!,
                          });
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Provisioning failed");
                          return;
                        }
                        const personalEmail = selected.candidate_email;
                        let inviteSent = false;
                        let inviteError: string | null = null;
                        try {
                          await invite.mutateAsync({
                            companyEmail: selected.company_email!,
                            personalEmail,
                            fullName: selected.candidate_name ?? "",
                          });
                          inviteSent = true;
                          toast.success(`Invite sent to ${selected.company_email}`);
                        } catch (err) {
                          inviteError = err instanceof Error ? err.message : "unknown error";
                        }
                        setRevealed({
                          name: selected.candidate_name ?? "Starter",
                          email: selected.company_email!,
                          personalEmail,
                          password,
                          inviteSent,
                          inviteError,
                        });
                      }}
                    >
                      {provision.isPending || invite.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                      Provision &amp; send invite
                    </Button>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {selected.company_email
                        ? `Creates their sign-in (${selected.company_email}), locked to onboarding mode, and emails that same mailbox a set-password invite — the first email they ever receive there. Create the Google Workspace mailbox first.`
                        : "This profile has no company email, so a login can't be created for it."}
                    </p>
                  </div>
                )}

                {/* Resend invite — for provisioned starters whose invite
                    expired or never arrived (fresh one-shot link each time). */}
                {selected.user_id && selected.onboarding_state !== "completed" && (
                  <div className="rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={!selected.company_email || invite.isPending}
                      onClick={async () => {
                        try {
                          await invite.mutateAsync({
                            companyEmail: selected.company_email!,
                            personalEmail: selected.candidate_email,
                            fullName: selected.candidate_name ?? "",
                          });
                          toast.success(`Invite sent to ${selected.company_email}`);
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : "Invite email failed",
                          );
                        }
                      }}
                    >
                      {invite.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Resend invite email
                    </Button>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {selected.company_email
                        ? `Emails ${selected.company_email} a fresh link to set their password. Old links stop working after a while.`
                        : "No company email is on this record, so an invite can't be emailed."}
                    </p>
                  </div>
                )}

                {/* 11 Sep (Marcus): day one is released by hand on the morning, so a
                    no-show or a bad fit never sees the training material. */}
                {selected.onboarding_state !== "completed" && (
                  <div className="rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
                    {selected.day_one_released_at ? (
                      <>
                        <p className="text-sm font-medium inline-flex items-center gap-1.5">
                          <Sunrise className="h-4 w-4 text-amber-500" /> Day one released {selected.day_one_released_at.slice(0, 10)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Their day-one cards are open.</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 h-7 text-xs text-muted-foreground"
                          disabled={releaseDayOne.isPending}
                          onClick={async () => {
                            try {
                              await releaseDayOne.mutateAsync({ onboardingId: selected.id, release: false });
                              toast.success("Day one withdrawn — their day-one cards are locked again");
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "That did not work");
                            }
                          }}
                        >
                          Withdraw
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={releaseDayOne.isPending || !recordsResult?.dayOneReleaseReady}
                          onClick={async () => {
                            if (!window.confirm(`Release day one for ${selected.candidate_name ?? "this starter"}? Their day-one cards (training videos, script, quizzes) open straight away.`)) return;
                            try {
                              await releaseDayOne.mutateAsync({ onboardingId: selected.id, release: true });
                              toast.success("Day one released");
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "That did not work");
                            }
                          }}
                        >
                          {releaseDayOne.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sunrise className="h-4 w-4" />}
                          Release day one
                        </Button>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {recordsResult?.dayOneReleaseReady
                            ? "Do this in the morning HR meeting on their first day. Until then, once \"Before you start\" is done, they see their day-one itinerary and nothing else."
                            : "Needs the 11 Sep migration (20260911140000_sdr_onboarding_structure.sql)."}
                        </p>
                      </>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
                  {selected.onboarding_state === "completed" ? (
                    <p className="text-sm text-muted-foreground">
                      Released{selected.ended_at ? ` on ${selected.ended_at.slice(0, 10)}` : ""} —
                      their account is a normal portal now.
                    </p>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setConfirmRelease(true)}
                      >
                        <Unlock className="h-4 w-4" />
                        Release from onboarding
                      </Button>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {selected.user_id
                          ? "Unlocks their full role portal and marks onboarding complete."
                          : "No login is linked yet — this only marks the record complete."}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={confirmRelease} onOpenChange={setConfirmRelease}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Release {selected?.candidate_name ?? "this starter"} from onboarding?
            </DialogTitle>
            <DialogDescription>
              {selected?.user_id
                ? "Their account stops being restricted to the onboarding page and becomes a normal role portal. Finishing every step releases a starter automatically — this button is the manual override for ending onboarding early."
                : "No login is linked to this record yet, so this only marks the onboarding complete."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRelease(false)}>
              Cancel
            </Button>
            <Button disabled={release.isPending} onClick={doRelease}>
              {release.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateOnboardingProfileDialog
        candidate={createFor}
        open={createFor !== null}
        onOpenChange={(o) => !o && setCreateFor(null)}
        onProvisioned={setRevealed}
      />

      {/* Provisioning outcome. Happy path: the starter's personal address
          got the branded set-password invite — no credentials shown, just a
          resend control. Fallback (no personal email / send failure): the
          one-time password reveal, exactly as before the invite flow. */}
      <Dialog open={revealed !== null} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent className="sm:max-w-md">
          {revealed?.inviteSent ? (
            <>
              <DialogHeader>
                <div className="flex justify-center mb-1">
                  <MailCheck className="h-9 w-9 text-emerald-500" />
                </div>
                <DialogTitle className="text-center">
                  Invite sent to {revealed.personalEmail}
                </DialogTitle>
                <DialogDescription className="text-center">
                  {revealed.name} just needs to click the button in that email to set their own
                  password — no credentials to pass on. They&apos;ll sign in as{" "}
                  <span className="font-medium text-foreground">{revealed.email}</span>.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={invite.isPending}
                  onClick={async () => {
                    try {
                      await invite.mutateAsync({
                        companyEmail: revealed.email,
                        personalEmail: revealed.personalEmail!,
                        fullName: revealed.name,
                      });
                      toast.success(`Invite re-sent to ${revealed.personalEmail}`);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Invite email failed");
                    }
                  }}
                >
                  {invite.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Resend invite
                </Button>
                <Button onClick={() => setRevealed(null)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Login created — {revealed?.name}</DialogTitle>
                <DialogDescription>
                  We couldn&apos;t email their invite
                  {revealed?.inviteError ? ` (${revealed.inviteError})` : ""} — share these
                  credentials with them directly instead. Copy the password now: it won&apos;t be
                  shown again, and they&apos;ll be asked to set their own the first time they
                  sign in.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Sign-in email</p>
                  <Input readOnly value={revealed?.email ?? ""} className="font-mono text-sm" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">One-time password</p>
                  <div className="flex gap-2">
                    <Input readOnly value={revealed?.password ?? ""} className="font-mono text-sm" />
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label="Copy password"
                      onClick={async () => {
                        if (!revealed) return;
                        await navigator.clipboard.writeText(revealed.password);
                        toast.success("Password copied");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setRevealed(null)}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
