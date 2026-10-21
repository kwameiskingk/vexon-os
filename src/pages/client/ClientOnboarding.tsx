// The client onboarding journey — a full-screen, pre-portal experience.
//
// 3 Sep: rebuilt as a DECK. One big card per step, the next few peeking out
// behind it in brand tints; complete a card and it slides to the back with a
// small burst of confetti while the next one comes forward. "Previous" brings
// a finished card back to the front for review, and editable cards
// (form / yes-no / list / upload) can be re-saved in place (update_answers)
// without breaking the sequence. Locking is still server-side: the deck only
// ever exposes the first unfinished card. When every card is done the last
// card is "Take me to my dashboard" — the client releases themselves.
//
// The deck mechanics (peek layers, transitions, confetti, Previous/review,
// rail, backdrop, card chrome) live in src/components/onboarding-deck and are
// shared with the SDR deck and both sandboxes. This file keeps only what is
// client-specific: the step bodies (JourneySteps), the StepCtx, the copy.
//
// 7 Sep (Marcus's review): no speaker chip; the finish list reads in the
// past tense via config.done_label.
//
// 11 Sep (Marcus's 8 Sep walkthrough): a card with an explainer opens AS the
// video and switches to its action when the video ends (DeckCard). The
// welcome video plays the same way in front of the first card, and the
// "onboarding complete" video in front of the finish card, through the
// deck's override slot. No pop-outs anywhere.
//
// ClientOnboardingView is presentational (demo portal + sandbox render it on
// fixtures / in-memory state); the default export is the live container.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2, LogOut, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOnboardingMediaUrl } from "@/lib/onboardingMedia";
import { useClientFlowSettings } from "@/hooks/useClientFlowSettings";
import {
  useClientJourney,
  useCompleteJourneyStep,
  useReopenJourneyStep,
  useGoToDashboard,
  useUpdateAnswers,
  type ClientJourneyData,
  type JourneyStage,
  type JourneyTask,
} from "@/hooks/useClientJourney";
import {
  StepBody,
  isEditableType,
  primaryBtn,
  taskSummary,
  type StepCtx,
} from "@/components/client-onboarding/JourneySteps";
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

/* ────────────────────────────── helpers ─────────────────────────────── */

const taskDone = (t: JourneyTask) => t.is_completed || t.waived_at != null;

/** The auto-completing first card; its video is the deck's welcome, played at view level. */
const WELCOME_STEP_KEY = "create_login";
const EMPTY_TASK = { step_key: "", label: "", config: null, video_url: null } as unknown as JourneyTask;

const doneLabelOf = (t: JourneyTask) =>
  pastTenseLabel(t.label, typeof t.config?.done_label === "string" ? (t.config.done_label as string) : null);

interface ClientCard {
  task: JourneyTask;
  stage: JourneyStage;
}

/* ─────────────────────────────── View ───────────────────────────────── */

export interface ClientOnboardingViewProps {
  data: ClientJourneyData;
  completingStep: string | null;
  onCompleteStep: (stepKey: string, payload: Record<string, unknown>) => void;
  onUpdateStep?: (stepKey: string, payload: Record<string, unknown>) => Promise<void>;
  onGoToDashboard?: () => void;
  goingToDashboard?: boolean;
  onSignOut?: () => void;
  onOpenPortal?: () => void;
  /** AE demo portal: inert handlers, no Supabase. */
  demo?: boolean;
  /** Dev Center sandbox: everything works, nothing is written (3 Sep). */
  sandbox?: boolean;
  /** Replaces the Sign out control in the header (sandbox chip + Reset). */
  headerRight?: ReactNode;
}

export function ClientOnboardingView({
  data,
  completingStep,
  onCompleteStep,
  onUpdateStep,
  onGoToDashboard,
  goingToDashboard,
  onSignOut,
  onOpenPortal,
  demo,
  sandbox,
  headerRight,
}: ClientOnboardingViewProps) {
  const stages = useMemo(() => (data.stages ?? []).filter((s) => s.stage_key !== "campaign_live" || s.tasks.length > 0), [data.stages]);
  const progress = data.progress_pct ?? 0;
  const firstName = (data.client?.contact_name || "").trim().split(/\s+/)[0] || "there";
  const live = !!data.journey?.campaign_live_at;

  const cards = useMemo(() => {
    const map = new Map<string, ClientCard>();
    const items: DeckItem[] = [];
    for (const stage of stages) {
      for (const task of stage.tasks) {
        map.set(task.step_key, { task, stage });
        items.push({ key: task.step_key, stageKey: stage.stage_key, label: task.label, done: taskDone(task), locked: stage.state === "locked" });
      }
    }
    return { map, items };
  }, [stages]);

  const allDone = cards.items.findIndex((c) => !c.done && !c.locked) === -1;

  // The mobile number typed on the onboarding form beats the profile's phone
  // (the owner, 3 Sep): the booking card's SMS-reminder box pre-fills from it.
  const formPhone = useMemo(() => {
    for (const s of stages) {
      for (const t of s.tasks) {
        if (t.step_type !== "form") continue;
        const a = (t.answers ?? {}) as Record<string, unknown>;
        const v = a.mobile ?? a.phone ?? a.mobile_number;
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }
    return "";
  }, [stages]);

  const ctxBase: Omit<StepCtx, "onComplete" | "completing" | "mode" | "onCancelEdit"> = {
    clientProfileId: data.client?.client_profile_id ?? "",
    contactName: data.client?.contact_name ?? "",
    clientEmail: data.client?.email ?? "",
    clientPhone: formPhone || (data.client?.phone ?? ""),
    companyName: data.client?.company_name ?? "",
    calendarConnected: data.calendar_connection?.status === "connected",
    demo,
    sandbox,
  };

  const railStages: DeckStage[] = stages.map((s) => ({ key: s.stage_key, title: s.title, state: s.state }));
  const introGate = useIntroGate(sandbox ? "client-sandbox" : demo ? "client-demo" : `client:${data.client?.client_profile_id ?? "me"}`);

  const renderCard = (item: DeckItem, ctx: DeckRenderCtx) => {
    const card = cards.map.get(item.key);
    if (!card) return null;
    return (
      <ClientStepCard
        card={card}
        ctx={ctx}
        explainer={{
          // The welcome video (create_login) plays in front of the deck on
          // first open — that card completes itself on first sign-in, so a
          // per-card gate would never fire for a real client.
          pending: item.key !== WELCOME_STEP_KEY && !ctx.reviewing && !taskDone(card.task) && !introGate.hasSeen(item.key),
          onWatched: () => introGate.markSeen(item.key),
        }}
        ctxBase={ctxBase}
        completing={completingStep === card.task.step_key}
        onComplete={(payload) => onCompleteStep(card.task.step_key, payload)}
        canEdit={!!onUpdateStep && !demo && isEditableType(card.task.step_type)}
        onSaveEdit={async (payload) => {
          if (!onUpdateStep) return;
          await onUpdateStep(card.task.step_key, payload);
          ctx.stopEdit();
        }}
      />
    );
  };

  // Finish-screen video (Daniel's "onboarding complete"): flow-level media
  // from client_flow_settings, played in front of the finish card under the
  // gate key "__finish". Not fetched on the demo portal (fixtures only).
  const flowSettings = useClientFlowSettings(!demo);
  const finishVideo = useOnboardingMediaUrl(flowSettings.data?.finish_video_path ?? null, !demo);
  const finishSource: VideoSource = {
    videoSrc: finishVideo.data ?? null,
    videoUrl: demo ? null : flowSettings.data?.finish_video_url ?? null,
    loading: !demo && !!flowSettings.data?.finish_video_path && finishVideo.isLoading,
  };
  const finishIntroOpen = allDone && !live && hasPlayableVideo(finishSource) && !introGate.hasSeen("__finish");

  // Welcome video: whichever card the deck opens on, Daniel's welcome plays
  // once per journey first (gate key = the create_login step key).
  const welcomeCard = cards.map.get(WELCOME_STEP_KEY);
  const welcomeMedia = useCardMedia(welcomeCard?.task ?? EMPTY_TASK, demo);
  const welcomeIntroOpen = !!welcomeCard && !allDone && !live && hasPlayableVideo(welcomeMedia.explainer) && !introGate.hasSeen(WELCOME_STEP_KEY);

  const override: DeckOverride | null = welcomeIntroOpen && welcomeCard
    ? {
        index: 0,
        label: welcomeCard.task.label,
        render: () => (
          <DeckCard
            index={0}
            total={cards.items.length}
            title={welcomeCard.task.label}
            description={welcomeCard.task.description}
            stageTitle={welcomeCard.stage.title}
            done={false}
            explainer={welcomeMedia.explainer}
            explainerPending
            onExplainerWatched={() => introGate.markSeen(WELCOME_STEP_KEY)}
          />
        ),
      }
    : finishIntroOpen
      ? {
          index: cards.items.length - 1,
          label: "Onboarding complete",
          render: () => (
            <DeckCard
              index={cards.items.length}
              total={cards.items.length}
              title="Onboarding complete"
              description="A short word on what happens next, before your dashboard opens."
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
      eyebrow={live ? "Campaign live" : "All complete"}
      title={live ? "Your campaign is live." : `You are all set, ${firstName}.`}
      body={
        live
          ? "Your SDR team has started calling. Meetings will appear on your dashboard as they are booked."
          : `That is everything we need from ${data.client?.company_name || "you"} for now. Your dashboard is ready; the next steps will be added there after your onboarding call.`
      }
      ctaLabel="Take me to my dashboard"
      busy={!!goingToDashboard}
      onGo={demo || sandbox ? onOpenPortal : onGoToDashboard ?? onOpenPortal}
      items={[...cards.map.values()].map((c) => doneLabelOf(c.task))}
    />
  );

  // 2 Oct (Marcus): the whole deck a fraction smaller so a card's top and
  // bottom fit on one screen, the same step the website took.
  return (
    <div className="min-h-screen bg-[#f5f5f6] [zoom:0.92]">
    <Deck
      items={cards.items}
      stages={railStages}
      progress={progress}
      headerLabel={data.client?.company_name || "Client onboarding"}
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
        live
          ? "Your campaign is live. Welcome aboard."
          : allDone
            ? "Everything is complete. Your dashboard is waiting."
            : "One step at a time. Each card takes only a few minutes, and your progress is saved as you go."
      }
      override={override}
      renderCard={renderCard}
      renderFinish={renderFinish}
    />
    </div>
  );
}

/* ───────────────────────────── Step card ────────────────────────────── */

/**
 * Card media (4 Sep): a thumbnail for the left panel and, optionally, an
 * uploaded video that opens in the full-screen player. New uploads live in
 * the onboarding-media bucket; `config.image_path` is the pre-4-Sep field and
 * still resolves from client-onboarding-assets so older flows keep working.
 */
function useCardMedia(task: JourneyTask, demo?: boolean) {
  const cfg = (task.config ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof cfg[k] === "string" && cfg[k] ? (cfg[k] as string) : null);
  const thumbnailPath = str("thumbnail_path");
  const legacyImagePath = str("image_path");
  const videoPath = str("video_path");
  const introVideoPath = str("intro_video_path");

  const thumb = useOnboardingMediaUrl(thumbnailPath, !demo);
  const video = useOnboardingMediaUrl(videoPath, !demo);
  const introVideo = useOnboardingMediaUrl(introVideoPath, !demo);

  const [legacyUrl, setLegacyUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLegacyUrl(null);
    if (!thumbnailPath && legacyImagePath && !demo) {
      supabase.storage.from("client-onboarding-assets").createSignedUrl(legacyImagePath, 3600)
        .then(({ data }) => { if (!cancelled && data?.signedUrl) setLegacyUrl(data.signedUrl); });
    }
    return () => { cancelled = true; };
  }, [thumbnailPath, legacyImagePath, demo]);

  // The explainer the card opens as (8 Sep, inline 11 Sep) — never the
  // card's own content video. The demo portal never resolves uploaded media
  // (static fixtures), so there an upload alone is not treated as playable.
  const explainer: VideoSource = {
    videoSrc: introVideo.data ?? null,
    videoUrl: str("intro_video_url"),
    loading: !demo && !!introVideoPath && introVideo.isPending,
  };

  return {
    imageUrl: thumb.data ?? legacyUrl,
    videoSrc: video.data ?? null,
    loading: !!videoPath && video.isPending,
    explainer,
  };
}

function ClientStepCard({ card, ctx, explainer, ctxBase, completing, onComplete, canEdit, onSaveEdit }: {
  card: ClientCard;
  ctx: DeckRenderCtx;
  explainer: { pending: boolean; onWatched: () => void };
  ctxBase: Omit<StepCtx, "onComplete" | "completing" | "mode" | "onCancelEdit">;
  completing: boolean;
  onComplete: (payload: Record<string, unknown>) => void;
  canEdit: boolean;
  onSaveEdit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const { task, stage } = card;
  const media = useCardMedia(task, ctxBase.demo);
  const [savingEdit, setSavingEdit] = useState(false);
  // 2 Oct (Marcus): the welcome card is only a video. A real client's copy is
  // completed the moment they first sign in; in the sandbox (and any journey
  // where that did not happen) it completes itself once the video has been
  // watched, so nobody sees an empty card with a "Mark complete" button.
  const autoWelcome = task.step_key === WELCOME_STEP_KEY && !taskDone(task) && !explainer.pending && !ctx.reviewing && !completing;
  const autoWelcomeFired = useRef(false);
  useEffect(() => {
    if (!autoWelcome || autoWelcomeFired.current) return;
    autoWelcomeFired.current = true;
    onComplete({});
  }, [autoWelcome, onComplete]);

  // 2 Oct (Marcus): a mis-clicked "Mark complete" can be undone from the
  // reviewed card. Not for waived cards (the CSM did that) or in the demo.
  const reopen = useReopenJourneyStep();
  const canReopen = ctx.reviewing && task.is_completed && !task.waived_at && !ctxBase.demo && !ctxBase.sandbox;
  const reopenButton = canReopen ? (
    <button
      type="button"
      className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
      disabled={reopen.isPending}
      onClick={() => {
        if (!window.confirm("Mark this card as not complete? What you entered is kept and the card comes back to the front.")) return;
        reopen.mutate({ step_key: task.step_key }, {
          onSuccess: () => toast.success("The card is back in front of you"),
          onError: (e) => toast.error(e instanceof Error ? e.message : "That did not work. Please try again."),
        });
      }}
    >
      {reopen.isPending ? "One moment…" : "Mark as not complete"}
    </button>
  ) : null;
  // 28 Sep: follow-along (mini-player) and its chapters come from the step's
  // config, set per step in the flow builder. Off unless switched on there.
  const cfg = (task.config ?? {}) as Record<string, unknown>;
  const followAlong = cfg.follow_along === true;
  const chapters = Array.isArray(cfg.chapters)
    ? (cfg.chapters as Array<{ label?: unknown; seconds?: unknown }>)
        .filter((c) => c && typeof c.seconds === "number" && Number.isFinite(c.seconds))
        .map((c) => ({ label: typeof c.label === "string" && c.label ? c.label : "Chapter", seconds: c.seconds as number }))
    : [];

  const stepCtx: StepCtx = ctx.editing
    ? {
        ...ctxBase,
        mode: "edit",
        completing: savingEdit,
        onCancelEdit: ctx.stopEdit,
        onComplete: async (payload) => {
          setSavingEdit(true);
          try { await onSaveEdit(payload); } finally { setSavingEdit(false); }
        },
      }
    : { ...ctxBase, mode: "complete", completing, onComplete };

  return (
    <DeckCard
      index={ctx.index}
      total={ctx.total}
      title={task.label}
      description={task.description}
      videoUrl={task.video_url}
      imageUrl={media.imageUrl}
      videoSrc={media.videoSrc}
      mediaLoading={media.loading}
      stageTitle={stage.title}
      done={taskDone(task)}
      editing={ctx.editing}
      explainer={media.explainer}
      explainerPending={explainer.pending}
      onExplainerWatched={explainer.onWatched}
      followAlong={followAlong && !ctx.reviewing}
      chapters={chapters}
    >
      {ctx.reviewing ? (
        <ReviewSummary
          lines={taskSummary(task)}
          note={task.waived_at ? "waived by your Customer Success Manager" : null}
          onEdit={canEdit ? ctx.startEdit : undefined}
          extra={reopenButton}
        />
      ) : (
        <StepBody task={task} ctx={stepCtx} />
      )}
    </DeckCard>
  );
}

/* ───────────────────────────── Container ────────────────────────────── */

export default function ClientOnboarding() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useClientJourney();
  const complete = useCompleteJourneyStep();
  const update = useUpdateAnswers();
  const release = useGoToDashboard();
  const [completingStep, setCompletingStep] = useState<string | null>(null);
  // Was the journey still running when this page first loaded? Decides whether
  // a release mid-session shows the celebration or redirects immediately.
  const wasActiveOnMount = useRef<boolean | null>(null);
  if (wasActiveOnMount.current === null && data?.journey) {
    wasActiveOnMount.current = data.journey.status === "active";
  }

  const handleComplete = async (stepKey: string, payload: Record<string, unknown>) => {
    setCompletingStep(stepKey);
    try {
      await complete.mutateAsync({ step_key: stepKey, ...payload });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work. Please try again.");
    } finally {
      setCompletingStep(null);
    }
  };

  const handleUpdate = async (stepKey: string, payload: Record<string, unknown>) => {
    try {
      await update.mutateAsync({ step_key: stepKey, ...payload });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work. Please try again.");
      throw e;
    }
  };

  const goToDashboard = async () => {
    try {
      await release.mutateAsync();
      navigate("/client/dashboard", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Not quite yet. Please complete the remaining cards first.");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/client");
  };

  const openPortal = () => navigate("/client/dashboard");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f6]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  // Released to the live portal: the journey is over and its tab is gone, so a
  // fresh visit here belongs on the dashboard. If the release happened while
  // they were sitting on this page, let the celebration play out instead of
  // yanking them away mid-confetti.
  if (data?.journey && data.journey.status !== "active" && data.journey.status !== "awaiting_payment") {
    if (!wasActiveOnMount.current || release.isSuccess) return <Navigate to="/client/dashboard" replace />;
  }

  // No journey → this login predates the onboarding flow (existing clients
  // don't get the journey, per the owner's ruling). Send them to the portal.
  if (error || !data?.journey || data.journey.status === "awaiting_payment") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f6] px-5">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white flex items-center justify-center">
            <Rocket className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold font-heading">No onboarding journey here</h1>
          <p className="text-sm text-muted-foreground">
            {data?.journey?.status === "awaiting_payment"
              ? "Your onboarding opens as soon as everything is confirmed on our side. We will email you."
              : "Your account is already up and running. Please go to your dashboard."}
          </p>
          <Button onClick={openPortal} className={primaryBtn}>Go to dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <ClientOnboardingView
      data={data}
      completingStep={completingStep}
      onCompleteStep={handleComplete}
      onUpdateStep={handleUpdate}
      onGoToDashboard={goToDashboard}
      goingToDashboard={release.isPending}
      onSignOut={signOut}
      onOpenPortal={openPortal}
    />
  );
}
