// The card chrome every deck step shares.
//
// 11 Sep (Marcus's 8 Sep walkthrough): the card IS the video. The first time
// a card with an explainer is reached it opens as the video, filling the
// card; when an uploaded video ends the card switches to its action by
// itself (a Loom / YouTube embed cannot report the end, so those get a
// "Continue to the step" button). Afterwards a small replay button in the
// top corner brings the video back at any time. Nothing pops out any more:
// the card's own content video, if it has one, plays inline in the media
// pane.
//
// 28 Sep (Marcus via Daniel): a card can allow "follow along" — the client
// starts the step while the explainer carries on in a floating mini-player
// in the corner of the page (FloatingVideo), from the point it had reached.
// Off unless the flow builder switches it on for that step, so every other
// card behaves exactly as before. With chapters set, a sectioned form
// moves the video to the matching chapter as the client changes section.
//
// The advance button is universal ("Mark complete · next task") and lives
// in the card's bottom action bar; step bodies register it through
// usePrimaryAction rather than drawing their own. The stage badge sits in
// the same bar, grey while in progress, green once done.
//
// Purely presentational. The deck that owns the card decides what goes in
// the body: the client deck renders its JourneySteps bodies, the SDR deck
// its SdrSteps bodies, and in review mode both render a ReviewSummary.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { motion } from "motion/react";
import { ArrowRight, Check, Loader2, PenLine, PictureInPicture2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { embedUrlFor } from "@/lib/onboardingSteps";
import { CardActionProvider, NEXT_TASK_LABEL, type PrimaryAction } from "./CardAction";
import { FloatingVideo, type Chapter } from "./FloatingVideo";
import { InlineVideo, hasPlayableVideo, type VideoSource } from "./InlineVideo";

export type { Chapter };

export interface DeckCardProps {
  index: number;
  total: number;
  title: string;
  /** The card's intro copy. Nothing renders without it. */
  description?: string | null;
  /** The card's own content video (a pasted link). */
  videoUrl?: string | null;
  imageUrl?: string | null;
  /** Signed URL of the card's own uploaded content video. Beats videoUrl. */
  videoSrc?: string | null;
  /** True while the signed media URLs are still resolving. */
  mediaLoading?: boolean;
  stageTitle: string;
  done: boolean;
  editing?: boolean;
  /** The explainer that plays as the card itself before the action shows. */
  explainer?: VideoSource | null;
  /** True until the explainer has been watched this session. */
  explainerPending?: boolean;
  onExplainerWatched?: () => void;
  /** 28 Sep: offer "start the step while the video plays" (mini-player). */
  followAlong?: boolean;
  /** Chapter marks in the explainer, in order; a sectioned form follows them. */
  chapters?: Chapter[];
  /**
   * 5 Oct (the owner): the step reads like the video phase: eyebrow, title and
   * copy centred, the body centred under them. The SDR deck switches this on;
   * the client deck keeps its left-aligned forms.
   */
  centred?: boolean;
  children?: ReactNode;
}

/**
 * A WHITE pill for buttons that sit on the brand gradient (the finish card).
 * Used on a plain <button>, never the shared Button, whose default variant
 * paints a dark gradient background-image that a colour class cannot beat —
 * the "too dark" button Marcus saw on 8 Sep.
 */
export const lightPillBtn =
  "inline-flex items-center justify-center h-12 rounded-full px-8 text-base font-semibold bg-white text-violet-800 hover:bg-violet-50 hover:text-violet-900 shadow-[0_12px_30px_-10px_rgba(0,0,0,.45)] ring-2 ring-white/60 transition-colors disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white";

/** The big gradient advance button (the card's only primary control). */
export const ctaBtn =
  "h-12 rounded-full px-8 text-base font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 text-white border-0 shadow-[0_12px_30px_-10px_rgba(154,86,208,.6)] disabled:opacity-50";

const shell =
  "rounded-[28px] bg-white/85 backdrop-blur-xl border border-white/70 shadow-[0_30px_80px_-30px_rgba(126,63,181,.45),0_2px_6px_rgba(30,27,46,.05)] overflow-hidden";

/* ───────────────────────────── Follow-along context ─────────────────── */

interface FollowAlongState {
  /** True while the mini-player is on screen. */
  active: boolean;
  /** Jump the mini-player to a chapter by index; ignored when inactive or unset. */
  seekChapter: (index: number) => void;
}

const FollowAlongContext = createContext<FollowAlongState>({ active: false, seekChapter: () => {} });

/** Step bodies read this to move the mini-player as their own sections change. */
export function useFollowAlong(): FollowAlongState {
  return useContext(FollowAlongContext);
}

/* ───────────────────────────── The card ─────────────────────────────── */

export function DeckCard({
  title, description, videoUrl, imageUrl, videoSrc, mediaLoading,
  stageTitle, done, editing, explainer, explainerPending, onExplainerWatched,
  followAlong, chapters, centred, children,
}: DeckCardProps) {
  // the owner, 11 Sep: a card whose only video is its own content (the SDR
  // "watch the recruitment videos" card, a pasted YouTube link) must behave
  // exactly like a card with an explainer — the card IS the video, then the
  // action — not a thumbnail in a side pane.
  const contentVideo: VideoSource | null =
    videoSrc || embedUrlFor(videoUrl) || mediaLoading ? { videoSrc, videoUrl, loading: mediaLoading } : null;
  const explainerSource = hasPlayableVideo(explainer) ? explainer! : contentVideo;
  const explainerReady = hasPlayableVideo(explainerSource);
  const [replay, setReplay] = useState(false);
  const videoPhase = explainerReady && (!!explainerPending || replay);

  // Follow-along: the mini-player and the playhead it carries between the
  // full-size video and the corner. Refs, not state, for the playhead — it
  // ticks several times a second and nothing needs to re-render for it.
  const canFollow = !!followAlong && explainerReady;
  const [docked, setDocked] = useState(false);
  const playhead = useRef(0);
  const dockedVideo = useRef<HTMLVideoElement>(null);
  const [activeChapter, setActiveChapter] = useState(-1);
  const chapterList = useMemo(
    () => (chapters ?? []).filter((c) => c && c.seconds >= 0).sort((a, b) => a.seconds - b.seconds),
    [chapters],
  );

  const finishVideo = () => {
    setReplay(false);
    if (explainerPending) onExplainerWatched?.();
  };

  /** "Start the step while the video plays": the card goes to the step, the video goes to the corner. */
  const dock = (from: number) => {
    playhead.current = from;
    setDocked(true);
    finishVideo();
  };

  /** The corner's expand button: the video fills the card again, from the same point. */
  const expand = () => {
    setDocked(false);
    setReplay(true);
  };

  const closeDock = () => setDocked(false);

  const chapterAt = useCallback(
    (seconds: number) => {
      let idx = -1;
      for (let i = 0; i < chapterList.length; i++) if (seconds >= chapterList[i].seconds) idx = i;
      return idx;
    },
    [chapterList],
  );

  const onDockedTime = (seconds: number) => {
    playhead.current = seconds;
    const idx = chapterAt(seconds);
    if (idx !== activeChapter) setActiveChapter(idx);
  };

  const seekChapter = useCallback(
    (index: number) => {
      const el = dockedVideo.current;
      const chapter = chapterList[index];
      if (!el || !chapter) return;
      el.currentTime = chapter.seconds;
      playhead.current = chapter.seconds;
      setActiveChapter(index);
      void el.play().catch(() => {});
    },
    [chapterList],
  );

  // A card that stops being followable (the deck moved on, the source
  // changed) takes its mini-player with it.
  useEffect(() => {
    if (!canFollow) setDocked(false);
  }, [canFollow]);

  const followState = useMemo<FollowAlongState>(
    () => ({ active: docked, seekChapter: docked ? seekChapter : () => {} }),
    [docked, seekChapter],
  );

  return (
    <FollowAlongContext.Provider value={followState}>
      <motion.div
        key={videoPhase ? "video" : "step"}
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 190, damping: 24, mass: 0.9 }}
      >
        {videoPhase ? (
          <VideoPhase
            title={title}
            description={description}
            stageTitle={stageTitle}
            explainer={explainerSource!}
            replaying={replay}
            startAt={replay ? playhead.current : 0}
            onTimeUpdate={(s) => { playhead.current = s; }}
            onDone={finishVideo}
            onFollowAlong={canFollow ? dock : undefined}
          />
        ) : (
          <StepPhase
            title={title}
            description={description}
            imageUrl={imageUrl}
            stageTitle={stageTitle}
            done={done}
            editing={editing}
            centred={centred}
            onReplay={explainerReady && !docked ? () => setReplay(true) : undefined}
          >
            {children}
          </StepPhase>
        )}
      </motion.div>

      {docked && !videoPhase && explainerSource && (
        <FloatingVideo
          title={title}
          source={explainerSource}
          startAt={playhead.current}
          chapters={chapterList}
          activeChapter={activeChapter}
          videoRef={dockedVideo}
          onTimeUpdate={onDockedTime}
          onEnded={closeDock}
          onExpand={expand}
          onClose={closeDock}
          onChapter={seekChapter}
        />
      )}
    </FollowAlongContext.Provider>
  );
}

/* ───────────────────────────── Video phase ──────────────────────────── */

function VideoPhase({
  title, description, stageTitle, explainer, replaying, startAt, onTimeUpdate, onDone, onFollowAlong,
}: {
  title: string;
  description?: string | null;
  stageTitle: string;
  explainer: VideoSource;
  replaying: boolean;
  startAt: number;
  onTimeUpdate: (seconds: number) => void;
  onDone: () => void;
  /** Present when the card allows follow-along; receives the playhead to carry over. */
  onFollowAlong?: (from: number) => void;
}) {
  // Only an uploaded file can tell us it has ended; an embed gets a button.
  const uploaded = !!explainer.videoSrc || !!explainer.loading;
  const [ended, setEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seen = useRef(0);
  useEffect(() => {
    setEnded(false);
  }, [explainer.videoSrc, explainer.videoUrl]);

  const followBtn = onFollowAlong && !ended && (
    <Button className={ctaBtn} onClick={() => onFollowAlong(videoRef.current?.currentTime ?? seen.current)}>
      <PictureInPicture2 className="h-4 w-4 mr-2" />
      {replaying ? "Keep watching while I continue" : "Start the step while the video plays"}
    </Button>
  );

  return (
    <div className={cn(shell, "p-6 sm:p-8 lg:p-10")}>
      {/* 2 Oct (Marcus): the instruction is the biggest thing on the card and
          centred; the title and copy sit under it, smaller. */}
      <p className="text-center text-[11px] font-mono uppercase tracking-[0.2em] text-violet-600">{stageTitle}</p>
      <h2 className="mt-2 text-center text-3xl sm:text-4xl font-heading font-bold tracking-tight leading-tight">
        {replaying ? "Watching again" : "Watch first"}
      </h2>
      <p className="mt-3 text-center text-lg font-heading font-semibold leading-snug">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-2xl text-center text-sm leading-relaxed text-foreground/75">{description}</p>}

      <InlineVideo
        className="mt-6"
        title={title}
        videoSrc={explainer.videoSrc}
        videoUrl={explainer.videoUrl}
        loading={explainer.loading}
        autoPlay
        startAt={startAt}
        videoRef={videoRef}
        onTimeUpdate={(s) => { seen.current = s; onTimeUpdate(s); }}
        onEnded={() => {
          setEnded(true);
          if (!replaying) onDone();
        }}
      />

      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        {replaying ? (
          followBtn ? (
            <>
              {followBtn}
              <button
                type="button"
                className="text-sm text-violet-700 underline underline-offset-2 hover:text-violet-900"
                onClick={onDone}
              >
                Back to the step
              </button>
            </>
          ) : (
            <Button className={ctaBtn} onClick={onDone}>
              Back to the step <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )
        ) : uploaded ? (
          <>
            {followBtn}
            <p className="w-full text-center text-xs text-muted-foreground">
              {ended
                ? "Moving on…"
                : onFollowAlong
                  ? "The step opens as soon as the video has finished, or start now and it keeps playing in the corner."
                  : "The step opens as soon as the video has finished."}
            </p>
            <button
              type="button"
              className="text-sm text-violet-700 underline underline-offset-2 hover:text-violet-900"
              onClick={onDone}
            >
              I have already watched this
            </button>
          </>
        ) : (
          <>
            {followBtn}
            <Button className={ctaBtn} onClick={onDone}>
              Continue to the step <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── Step phase ───────────────────────────── */

function StepPhase({
  title, description, imageUrl, stageTitle, done, editing, centred, onReplay, children,
}: {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  stageTitle: string;
  done: boolean;
  editing?: boolean;
  centred?: boolean;
  onReplay?: () => void;
  children?: ReactNode;
}) {
  // Only a thumbnail earns the side pane; every video plays as the card.
  const hasMedia = !!imageUrl;
  // A centred card without a side pane is text over an action bar: it does
  // not need the tall minimum that kept a form card from looking cramped.
  const mid = centred && !hasMedia;

  return (
    <CardActionProvider>
      {(action) => (
        <div className={cn(shell, "grid", hasMedia ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : "grid-cols-1")}>
          {hasMedia && (
            <div className="relative min-h-[240px] bg-gradient-to-br from-violet-700 via-violet-600 to-fuchsia-600">
              <img src={imageUrl!} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </div>
          )}

          <div className={cn("relative p-6 sm:p-9 lg:p-11 flex flex-col", mid ? "min-h-[300px]" : "min-h-[380px] lg:min-h-[460px]")}>
            {onReplay && (
              <button
                type="button"
                onClick={onReplay}
                className="absolute top-5 right-5 inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors"
                aria-label="Replay the video for this step"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Replay video
              </button>
            )}
            <p className={cn("text-[11px] font-mono uppercase tracking-[0.2em] text-violet-600", centred ? "text-center px-32" : "pr-32")}>{stageTitle}</p>
            {/* 2 Oct (Marcus): smaller title and copy; the action bar below is the big thing. */}
            <h2 className={cn("mt-3 text-xl sm:text-2xl font-heading font-semibold tracking-tight leading-tight", centred && "text-center")}>{title}</h2>
            {description && (
              <p className={cn("mt-3 text-sm leading-relaxed text-foreground/75 max-w-2xl", centred && "mx-auto text-center")}>{description}</p>
            )}
            <div className={cn("mt-7 flex-1", centred && "mx-auto w-full max-w-2xl")}>{children}</div>
          </div>

          <ActionBar action={action} stageTitle={stageTitle} done={done} editing={editing} wide={hasMedia} />
        </div>
      )}
    </CardActionProvider>
  );
}

function ActionBar({ action, stageTitle, done, editing, wide }: {
  action: PrimaryAction | null;
  stageTitle: string;
  done: boolean;
  editing?: boolean;
  wide: boolean;
}) {
  return (
    <footer
      className={cn(
        "border-t border-violet-100 bg-white/70 px-6 sm:px-9 py-4 flex flex-col items-center gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center",
        wide && "lg:col-span-2",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium justify-self-start",
          done ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-violet-50 border-violet-100 text-violet-700",
        )}
      >
        {done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />}
        {stageTitle}
        {editing ? " · editing" : done ? " · complete" : ""}
      </span>

      <div className="flex items-center gap-4">
        {action?.secondary && (
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={action.secondary.onClick}
            disabled={action.busy}
          >
            {action.secondary.label}
          </button>
        )}
        {action && (
          <Button className={cn(ctaBtn, "h-14 px-10 text-lg")} disabled={action.disabled || action.busy} onClick={action.onClick}>
            {action.busy ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : editing ? <PenLine className="h-5 w-5 mr-2" /> : <Check className="h-5 w-5 mr-2" />}
            {action.label ?? NEXT_TASK_LABEL}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center sm:text-left sm:justify-self-start min-h-[1rem]">
        {action?.hint ?? ""}
      </p>
    </footer>
  );
}

/* ───────────────────────────── Review summary ───────────────────────── */

/** What a finished card shows when brought back with "Previous". */
export function ReviewSummary({ lines, note, onEdit, extra }: {
  lines: string[];
  /** Small mono footnote under the list (e.g. "waived by your Customer Success Manager"). */
  note?: string | null;
  onEdit?: () => void;
  /** Anything else under the list (e.g. a "View proof" link). */
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <ul className="space-y-1.5 rounded-2xl bg-violet-50/70 border border-violet-100 p-4 text-sm">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /><span className="break-words">{line}</span></li>
        ))}
        {note && <li className="text-xs font-mono text-amber-600">{note}</li>}
      </ul>
      {extra}
      {onEdit && (
        <Button variant="outline" className="border-violet-200 bg-white/70" onClick={onEdit}>
          <PenLine className="h-4 w-4 mr-1.5" /> Edit and save again
        </Button>
      )}
    </div>
  );
}
