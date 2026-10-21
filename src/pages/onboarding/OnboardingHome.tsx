// The new starter's onboarding surface — the only page an account in
// onboarding mode can reach (containment: profiles.in_onboarding_mode +
// ProtectedRoute + this route, shipped in M6).
//
// 3 Sep: rebuilt as the same DECK the client journey uses (R1). One card per
// step, pre-start first, then day one; the flow is strictly sequential so the
// deck only ever exposes the first unfinished card. The finish card releases
// the starter: completing the last task fires the auto_release trigger, this
// page polls profiles.in_onboarding_mode and enables "Take me to my
// dashboard" once the gate is open.
//
// 7 Sep: the card speaks for itself (no speaker chip). The live deck reads
// the builder templates too (starters got a SELECT policy on enabled rows in
// 20260907120000), so uploaded thumbnails, videos, quizzes and done labels
// reach real starters, not just the sandbox.
//
// 11 Sep (Marcus's 8 Sep walkthrough): a card with an explainer opens AS the
// video and switches to its action when it ends (DeckCard). No pop-outs.
// Day one is released BY HAND by Elena on the morning
// (employee_onboarding.day_one_released_at): until then the day-one cards
// are locked and, once "Before you start" is complete, the starter sees the
// section-end screen (itinerary + who to contact) from
// onboarding_flow_settings. The closing video from the same settings row
// plays in front of the finish card.
//
// SdrOnboardingView is presentational (the Dev Center sandbox renders it on
// in-memory state); the default export is the live container.

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, LogOut, Mail } from "lucide-react";
import { differenceInCalendarDays, format, parseISO, startOfToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOnboardingMediaUrl } from "@/lib/onboardingMedia";
import { withFirstName } from "@/lib/sdrTrainingModules";
import { useAuth } from "@/contexts/AuthContext";
import { isMissingSchemaError } from "@/lib/migrationGuard";
import { useOnboardingTasks, useCompleteStep } from "@/hooks/useEmployeeOnboarding";
import { fetchOnboardingFlowDetailed } from "@/hooks/useOnboardingFlow";
import { useOnboardingFlowSettings, DEFAULT_ONBOARDING_FLOW_SETTINGS, type OnboardingFlowSettings } from "@/hooks/useOnboardingFlowSettings";
import {
  PHASE_LABELS,
  currentStepIndex,
  phaseProgress,
  resolveSteps,
  type OnboardingPhase,
  type ResolvedStep,
} from "@/lib/onboardingSteps";
import {
  Deck,
  DeckCard,
  FinishCard,
  ReviewSummary,
  greeting,
  hasPlayableVideo,
  pastTenseLabel,
  useIntroGate,
  type DeckItem,
  type DeckOverride,
  type DeckRenderCtx,
  type DeckStage,
  type VideoSource,
} from "@/components/onboarding-deck";
import {
  ProofLink,
  SdrStepBody,
  isEditableSdrType,
  sdrStepSummary,
  type SdrCompletePayload,
} from "@/components/onboarding-deck/SdrSteps";

/* ─────────────────────────────── View ───────────────────────────────── */

export interface SdrOnboardingViewProps {
  steps: ResolvedStep[];
  firstName: string;
  /** YYYY-MM-DD planned first day, for the countdown chip (R6). */
  startDate?: string | null;
  completingTaskId: string | null;
  onComplete: (step: ResolvedStep, payload?: SdrCompletePayload) => void;
  /** Previous → "Edit and save again" on a finished card (11 Sep). Absent = no editing. */
  onUpdate?: (step: ResolvedStep, payload: SdrCompletePayload) => Promise<void>;
  /** Finish card: the account is out of onboarding mode and can leave. */
  released: boolean;
  /** HR has released the day-one cards (11 Sep). */
  dayOneReleased: boolean;
  /** The section-end screen and closing video; defaults before the migration. */
  flowSettings?: OnboardingFlowSettings;
  /** Sandbox only: a button on the section-end screen that stands in for Elena. */
  onSimulateRelease?: () => void;
  onFinish: () => void;
  onSignOut?: () => void;
  headerRight?: ReactNode;
  headerLabel?: ReactNode;
  sandbox?: boolean;
  userId?: string | null;
}

/**
 * DeckCard for an SDR step, resolving its uploaded media (4 Sep). Hooks only
 * run inside a component and renderCard is a plain callback, so the signed
 * thumbnail / video URLs are fetched here. The explainer (intro_video_*) is
 * what the card opens as; the card's own video ("Watch the recruitment
 * videos") is content and plays inline in the media pane.
 */
function SdrDeckCard({
  index, total, step, firstName, explainer, children,
}: {
  index: number;
  total: number;
  step: ResolvedStep;
  firstName: string;
  explainer?: { pending: boolean; onWatched: () => void };
  children: ReactNode;
}) {
  const thumb = useOnboardingMediaUrl(step.thumbnailPath);
  const video = useOnboardingMediaUrl(step.videoPath);
  const introVideo = useOnboardingMediaUrl(step.introVideoPath);
  const explainerSource: VideoSource = {
    videoSrc: introVideo.data ?? null,
    videoUrl: step.introVideoUrl,
    loading: !!step.introVideoPath && introVideo.isPending,
  };
  return (
    <DeckCard
      index={index}
      total={total}
      title={step.label}
      description={withFirstName(step.description, firstName)}
      videoUrl={step.videoUrl}
      imageUrl={thumb.data ?? null}
      videoSrc={video.data ?? null}
      mediaLoading={!!step.videoPath && video.isPending}
      stageTitle={PHASE_LABELS[step.phase]}
      done={step.done}
      explainer={explainerSource}
      explainerPending={!!explainer?.pending}
      onExplainerWatched={explainer?.onWatched}
      centred
    >
      {children}
    </DeckCard>
  );
}

export function SdrOnboardingView({
  steps, firstName, startDate, completingTaskId, onComplete, onUpdate, released, dayOneReleased, flowSettings, onSimulateRelease,
  onFinish, onSignOut, headerRight, headerLabel, sandbox, userId,
}: SdrOnboardingViewProps) {
  const [savingEdit, setSavingEdit] = useState<string | null>(null);
  const activeIndex = currentStepIndex(steps);
  const allDone = steps.length > 0 && activeIndex === steps.length;
  const progress = phaseProgress(steps);
  const doneCount = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const preStartDone = progress.pre_start.total > 0 && progress.pre_start.done === progress.pre_start.total;
  const settings = flowSettings ?? DEFAULT_ONBOARDING_FLOW_SETTINGS;

  const items: DeckItem[] = useMemo(
    () => steps.map((s) => ({ key: s.taskId, stageKey: s.phase, label: s.label, done: s.done, locked: s.phase === "day_one" && !dayOneReleased && !s.done })),
    [steps, dayOneReleased],
  );
  const byKey = useMemo(() => new Map(steps.map((s) => [s.taskId, s])), [steps]);
  const introGate = useIntroGate(sandbox ? "sdr-sandbox" : `sdr:${userId ?? "me"}`);

  const stages: DeckStage[] = (["pre_start", "day_one"] as OnboardingPhase[])
    .filter((p) => progress[p].total > 0)
    .map((p) => {
      const done = progress[p].done === progress[p].total;
      const state: DeckStage["state"] = done
        ? "complete"
        : p === "pre_start" || ((preStartDone || progress.pre_start.total === 0) && dayOneReleased)
          ? "active"
          : "locked";
      return { key: p, title: PHASE_LABELS[p], state };
    });

  const renderCard = (item: DeckItem, ctx: DeckRenderCtx) => {
    const step = byKey.get(item.key);
    if (!step) return null;
    return (
      <SdrDeckCard
        index={ctx.index}
        total={ctx.total}
        step={step}
        firstName={firstName}
        explainer={{ pending: !ctx.reviewing && !step.done && !introGate.hasSeen(step.key), onWatched: () => introGate.markSeen(step.key) }}
      >
        {ctx.reviewing ? (
          <ReviewSummary
            lines={sdrStepSummary(step)}
            extra={step.proofPath ? <ProofLink path={step.proofPath} sandbox={sandbox} /> : undefined}
            onEdit={onUpdate && isEditableSdrType(step.type) ? ctx.startEdit : undefined}
          />
        ) : ctx.editing && onUpdate ? (
          <SdrStepBody
            step={step}
            ctx={{
              mode: "edit",
              completing: savingEdit === step.taskId,
              onCancelEdit: ctx.stopEdit,
              onComplete: async (payload) => {
                setSavingEdit(step.taskId);
                try {
                  await onUpdate(step, payload ?? {});
                  ctx.stopEdit();
                } finally {
                  setSavingEdit(null);
                }
              },
              sandbox,
              userId,
            }}
          />
        ) : (
          <SdrStepBody
            step={step}
            ctx={{
              completing: completingTaskId === step.taskId,
              onComplete: (payload) => onComplete(step, payload),
              sandbox,
              userId,
            }}
          />
        )}
      </SdrDeckCard>
    );
  };

  // "Before you start" is complete, day one not yet released: the itinerary
  // and who to contact, in the same card chrome.
  const renderWaiting = () => (
    <DeckCard
      index={doneCount}
      total={steps.length}
      title={settings.pre_start_end_title}
      stageTitle={PHASE_LABELS.pre_start}
      done
      centred
    >
      <div className="space-y-5 text-center">
        <div className="space-y-3 text-[15px] leading-relaxed text-foreground/85 max-w-2xl mx-auto">
          {settings.pre_start_end_body.split(/\n{2,}/).map((para, i) => (
            <p key={i} className="whitespace-pre-line">{para}</p>
          ))}
        </div>
        {(settings.contact_name || settings.contact_email) && (
          <p className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-4 py-2 text-sm">
            <Mail className="h-4 w-4 text-violet-600" />
            <span>
              Need anything before you start? Contact <b>{settings.contact_name || "HR"}</b>
              {settings.contact_email && (
                <> at <a className="text-violet-700 underline underline-offset-2" href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a></>
              )}
              .
            </span>
          </p>
        )}
        {sandbox && onSimulateRelease && (
          <Button variant="outline" className="border-violet-200 bg-white/70" onClick={onSimulateRelease}>
            Sandbox: release day one (what Elena does on the morning)
          </Button>
        )}
      </div>
    </DeckCard>
  );

  // Closing video (Marcus's "ending" for day one) in front of the finish card.
  const finishVideo = useOnboardingMediaUrl(settings.finish_video_path);
  const finishSource: VideoSource = {
    videoSrc: finishVideo.data ?? null,
    videoUrl: settings.finish_video_url,
    loading: !!settings.finish_video_path && finishVideo.isPending,
  };
  const finishIntroOpen = allDone && hasPlayableVideo(finishSource) && !introGate.hasSeen("__finish");
  const override: DeckOverride | null = finishIntroOpen
    ? {
        index: steps.length - 1,
        label: "Onboarding complete",
        render: () => (
          <DeckCard
            index={steps.length}
            total={steps.length}
            title="Onboarding complete"
            description="A short word before your dashboard opens."
            stageTitle="All complete"
            done
            explainer={finishSource}
            explainerPending
            onExplainerWatched={() => introGate.markSeen("__finish")}
          />
        ),
      }
    : null;

  const renderFinish = () => (
    <FinishCard
      eyebrow="All complete"
      title={`You are all set, ${firstName}.`}
      body={
        sandbox
          ? "That is the whole flow. In the live version this is where the starter's account is unlocked and they land on their dashboard."
          : "That is everything. Your full dashboard is being unlocked now; please go through as soon as the button is ready."
      }
      ctaLabel="Take me to my dashboard"
      busy={!sandbox && !released}
      onGo={onFinish}
      items={steps.map((s) => pastTenseLabel(s.label, s.doneLabel))}
      footnote={!sandbox && !released ? "Unlocking your dashboard. This usually takes a few seconds." : undefined}
    />
  );

  return (
    <Deck
      items={items}
      stages={stages}
      progress={pct}
      headerLabel={headerLabel ?? "New starter onboarding"}
      headerRight={
        headerRight ??
        (onSignOut ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={onSignOut}>
            <LogOut className="h-4 w-4 mr-1.5" /> Sign out
          </Button>
        ) : undefined)
      }
      eyebrow="Your onboarding"
      title={`${greeting()}, ${firstName}`}
      subtitle={
        allDone
          ? "Everything is complete. Welcome to the team."
          : "One card at a time. Each takes only a few minutes, and your progress is saved as you go."
      }
      notice={!allDone ? <PreStartNotice startDate={startDate} preStartDone={preStartDone} dayOneReleased={dayOneReleased} /> : undefined}
      override={override}
      renderCard={renderCard}
      renderFinish={renderFinish}
      renderWaiting={renderWaiting}
    />
  );
}

/* ─────────────────────────── Pre-start notice (R6) ──────────────────── */

function PreStartNotice({ startDate, preStartDone, dayOneReleased }: { startDate?: string | null; preStartDone: boolean; dayOneReleased: boolean }) {
  const start = startDate ? parseISO(startDate) : null;
  const days = start ? differenceInCalendarDays(start, startOfToday()) : null;
  const chip =
    start && days != null
      ? days > 1
        ? `Starts ${format(start, "EEEE d MMMM")} · ${days} days to go`
        : days === 1
          ? `Starts tomorrow, ${format(start, "EEEE d MMMM")}`
          : days === 0
            ? `Your first day: ${format(start, "EEEE d MMMM")}`
            : `Started ${format(start, "EEEE d MMMM")}`
      : null;

  return (
    <div
      className={cn(
        "rounded-2xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 shadow-[0_18px_40px_-28px_rgba(126,63,181,.4)]",
        preStartDone ? "bg-emerald-50/90 border-emerald-200" : "bg-white/85 backdrop-blur border-violet-200",
      )}
    >
      <div className={cn("shrink-0 h-10 w-10 rounded-full flex items-center justify-center", preStartDone ? "bg-emerald-500 text-white" : "bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white")}>
        {preStartDone ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-heading font-semibold text-[15px] leading-snug">
          {preStartDone
            ? dayOneReleased
              ? "'Before you start' is complete. Your day-one cards are now open."
              : "'Before you start' is complete. Well done."
            : "Completing everything in 'Before you start' ahead of your first day is a condition of starting with us."}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {preStartDone
            ? dayOneReleased
              ? "Work through the day-one list with your manager on the day."
              : "Your day-one cards open once HR releases them on the morning of your first day."
            : "Your day-one cards open on the morning, once HR has released them."}
        </p>
      </div>
      {chip && (
        <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800">
          <CalendarDays className="h-3.5 w-3.5" /> {chip}
        </span>
      )}
    </div>
  );
}

/* ───────────────────────────── Container ────────────────────────────── */

interface MyOnboarding {
  id: string;
  candidate_name: string | null;
  target_role: string | null;
  start_date?: string | null;
  /** 11 Sep: set by HR on the morning of day one. */
  day_one_released_at?: string | null;
}

export default function OnboardingHome() {
  const { user } = useAuth();
  const { data: allTasks, isLoading: tasksLoading } = useOnboardingTasks();
  const complete = useCompleteStep();
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  const { data: record, isLoading: recordLoading } = useQuery({
    queryKey: ["my-onboarding", user?.id],
    enabled: !!user?.id,
    // Elena's day-one release must land without a reload: poll every minute
    // until it has.
    refetchInterval: (q) => ((q.state.data as MyOnboarding | null | undefined)?.day_one_released_at ? false : 60_000),
    queryFn: async (): Promise<MyOnboarding | null> => {
      // day_one_released_at arrives with the 11 Sep migration and start_date
      // with the 3 Sep one; retry without each in turn.
      const withRelease = await supabase
        .from("employee_onboarding")
        .select("id, candidate_name, target_role, start_date, day_one_released_at" as "id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!withRelease.error) return (withRelease.data ?? null) as unknown as MyOnboarding | null;
      if (!isMissingSchemaError(withRelease.error)) throw withRelease.error;
      const withStart = await supabase
        .from("employee_onboarding")
        .select("id, candidate_name, target_role, start_date" as "id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!withStart.error) return (withStart.data ?? null) as unknown as MyOnboarding | null;
      if (!isMissingSchemaError(withStart.error)) throw withStart.error;
      const { data, error } = await supabase
        .from("employee_onboarding")
        .select("id, candidate_name, target_role" as "id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) {
        if (isMissingSchemaError(error)) return null;
        throw error;
      }
      return (data ?? null) as unknown as MyOnboarding | null;
    },
  });

  // The builder templates carry the media, quizzes and done labels the task
  // snapshot does not (7 Sep). Readable by starters since 20260907120000;
  // before that the read comes back empty and the code template fills in.
  const { data: liveFlow } = useQuery({
    queryKey: ["onboarding-flow-live-templates"],
    staleTime: 5 * 60_000,
    queryFn: async () => (await fetchOnboardingFlowDetailed()).steps,
  });

  const { data: flowSettings } = useOnboardingFlowSettings();

  const steps = useMemo(
    () =>
      resolveSteps(
        (allTasks ?? []).filter((t) => record && t.onboarding_id === record.id),
        record?.target_role ?? null,
        liveFlow ?? null,
      ),
    [allTasks, record, liveFlow],
  );

  const allDone = steps.length > 0 && currentStepIndex(steps) === steps.length;

  // Auto-release (Marcus's ruling): completing the last step lifts
  // in_onboarding_mode via a DB trigger. Once everything is done, poll the
  // profile until the gate is open, then let the finish card's button work.
  const { data: released } = useQuery({
    queryKey: ["my-onboarding-released", user?.id],
    enabled: !!user?.id && allDone,
    refetchInterval: (q) => (q.state.data === true ? false : 4000),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("in_onboarding_mode" as "id")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) return false;
      return (
        (data as unknown as { in_onboarding_mode?: boolean } | null)
          ?.in_onboarding_mode === false
      );
    },
  });

  const markDone = async (step: ResolvedStep, payload?: SdrCompletePayload) => {
    setCompletingTaskId(step.taskId);
    try {
      const outcome = await complete.mutateAsync({
        taskId: step.taskId,
        done: true,
        ...(payload?.answer !== undefined ? { answer: payload.answer } : {}),
        ...(payload?.proofPath !== undefined ? { proofPath: payload.proofPath } : {}),
      });
      if (outcome.answerDropped) {
        toast.warning("Step completed, but your answer couldn't be stored yet (migration pending).");
      }
    } catch (err) {
      toast.error(`Couldn't save that: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setCompletingTaskId(null);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/");
  };

  const firstName = record?.candidate_name?.trim().split(/\s+/)[0] || "there";

  if (recordLoading || tasksLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f6]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!record || steps.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f6] px-5">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-bold font-heading">Your onboarding is being prepared</h1>
          <p className="text-sm text-muted-foreground">Your cards will appear here shortly. Please check back in a moment.</p>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  return (
    <SdrOnboardingView
      steps={steps}
      firstName={firstName}
      startDate={record?.start_date ?? null}
      completingTaskId={completingTaskId}
      onComplete={markDone}
      onUpdate={async (step, payload) => {
        await complete.mutateAsync({
          taskId: step.taskId,
          done: true,
          ...(payload.answer !== undefined ? { answer: payload.answer } : {}),
          ...(payload.proofPath !== undefined ? { proofPath: payload.proofPath } : {}),
        });
        toast.success("Saved");
      }}
      released={released === true}
      dayOneReleased={!!record?.day_one_released_at}
      flowSettings={flowSettings}
      // Full reload on purpose: useOnboardingMode caches with staleTime
      // Infinity, so a client-side navigate would bounce straight back here.
      onFinish={() => window.location.assign("/")}
      onSignOut={signOut}
      userId={user?.id ?? null}
    />
  );
}
