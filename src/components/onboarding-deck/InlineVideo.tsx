// The inline player every deck card uses (Marcus, 8 Sep: videos embedded in
// the card, never a pop-out). An uploaded file renders in a real <video>
// with the browser's controls; a pasted Loom / YouTube link keeps its own
// player in an iframe. Only an uploaded file can report that it has ended,
// which is what lets the card switch from the video to the action by itself.
//
// 28 Sep (follow-along): the same player also lives in the floating
// mini-player, so it can start part-way through (startAt), report where it
// has got to (onTimeUpdate) and hand its element back (videoRef) for chapter
// seeks. An embed cannot do any of that; it simply starts again.

import { useEffect, type RefObject } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { embedUrlFor } from "@/lib/onboardingSteps";

export interface VideoSource {
  /** Signed URL of an uploaded video. Beats videoUrl when present. */
  videoSrc?: string | null;
  /** Pasted Loom / YouTube link. */
  videoUrl?: string | null;
  /** True while a signed URL is still resolving. */
  loading?: boolean;
}

export interface InlineVideoProps extends VideoSource {
  title: string;
  /** Poster for an uploaded video. */
  poster?: string | null;
  autoPlay?: boolean;
  onEnded?: () => void;
  className?: string;
  /** Uploaded video only: begin this many seconds in (a resumed watch). */
  startAt?: number;
  /** Uploaded video only: the playhead, every ~250ms while playing. */
  onTimeUpdate?: (seconds: number) => void;
  /** Uploaded video only: the element, for seeking from outside. */
  videoRef?: RefObject<HTMLVideoElement>;
  /** Tighter chrome for the mini-player. */
  compact?: boolean;
}

/** True when there is something playable (or about to be) behind these props. */
export function hasPlayableVideo(v: VideoSource | null | undefined): boolean {
  return !!v && (!!v.videoSrc || !!v.loading || !!embedUrlFor(v.videoUrl));
}

export function InlineVideo({
  title, videoSrc, videoUrl, poster, loading, autoPlay, onEnded, className,
  startAt, onTimeUpdate, videoRef, compact,
}: InlineVideoProps) {
  const embedBase = !videoSrc ? embedUrlFor(videoUrl) : null;
  const embed = embedBase && autoPlay ? `${embedBase}${embedBase.includes("?") ? "&" : "?"}autoplay=1` : embedBase;

  // A resumed watch: seek once the element knows its duration. Signed
  // storage URLs answer range requests, so this is a seek, not a reload.
  useEffect(() => {
    const el = videoRef?.current;
    if (!el || !videoSrc || !startAt || startAt <= 0) return;
    const seek = () => {
      if (Math.abs(el.currentTime - startAt) > 1) el.currentTime = startAt;
    };
    if (el.readyState >= 1) seek();
    else el.addEventListener("loadedmetadata", seek, { once: true });
    return () => el.removeEventListener("loadedmetadata", seek);
    // Only when the source changes: startAt is the position to resume from
    // at mount time, not a live control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc]);

  return (
    <div
      className={cn(
        "relative w-full aspect-video overflow-hidden bg-black",
        compact ? "rounded-xl" : "rounded-2xl shadow-2xl ring-1 ring-white/20",
        className,
      )}
    >
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        </div>
      ) : videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          preload="auto"
          poster={poster ?? undefined}
          className="absolute inset-0 h-full w-full object-contain bg-black"
          controls
          playsInline
          autoPlay={autoPlay}
          onCanPlay={(e) => {
            // Browsers may refuse autoplay with sound until the viewer has
            // interacted with the page; if they do, the play button waits.
            if (autoPlay && e.currentTarget.paused) void e.currentTarget.play().catch(() => {});
          }}
          onTimeUpdate={onTimeUpdate ? (e) => onTimeUpdate(e.currentTarget.currentTime) : undefined}
          onEnded={onEnded}
        />
      ) : embed ? (
        <iframe src={embed} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen" allowFullScreen title={title} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="text-sm text-white/70">This video has not been added yet.</p>
        </div>
      )}
    </div>
  );
}
