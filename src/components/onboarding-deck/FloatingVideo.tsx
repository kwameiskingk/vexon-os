// The follow-along mini-player (Marcus via Daniel, 28 Sep): on a card that
// allows it, the client can start the step while the explainer keeps
// playing in a small player pinned to the bottom corner of the page, the
// way YouTube minimises a video. It carries on from where the full-size
// video had got to, can be expanded back into the card or closed, and when
// the step is a sectioned form it jumps to the matching chapter as the
// client moves between sections.
//
// Rendered through a portal so it floats above the deck rather than inside
// the card's overflow-hidden shell. Purely presentational: DeckCard owns
// the playhead and decides when it shows.

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineVideo, type VideoSource } from "./InlineVideo";

export interface Chapter {
  label: string;
  seconds: number;
}

export function FloatingVideo({
  title, source, startAt, chapters, activeChapter, videoRef, onTimeUpdate, onEnded, onExpand, onClose, onChapter,
}: {
  title: string;
  source: VideoSource;
  startAt: number;
  chapters: Chapter[];
  /** Index into chapters of the one currently playing, or -1. */
  activeChapter: number;
  videoRef: RefObject<HTMLVideoElement>;
  onTimeUpdate: (seconds: number) => void;
  onEnded: () => void;
  onExpand: () => void;
  onClose: () => void;
  onChapter: (index: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <motion.aside
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl bg-white/95 backdrop-blur-xl border border-white/80 shadow-[0_30px_80px_-24px_rgba(126,63,181,.55),0_2px_8px_rgba(30,27,46,.08)] overflow-hidden"
      aria-label={`Video for ${title}, playing while you complete the step`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <p className="flex-1 min-w-0 truncate text-[11px] font-mono uppercase tracking-[0.18em] text-violet-600">
          Playing alongside
        </p>
        <button
          type="button"
          onClick={onExpand}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-violet-700 hover:bg-violet-50"
          aria-label="Expand the video"
          title="Expand"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-violet-50 hover:text-foreground"
          aria-label="Close the video"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-2 pb-2">
        <InlineVideo
          compact
          title={title}
          videoSrc={source.videoSrc}
          videoUrl={source.videoUrl}
          loading={source.loading}
          autoPlay
          startAt={startAt}
          videoRef={videoRef}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
        />
      </div>

      {chapters.length > 0 && source.videoSrc && (
        <nav className="flex gap-1.5 overflow-x-auto px-3 pb-3 [scrollbar-width:none]" aria-label="Video chapters">
          {chapters.map((c, i) => (
            <button
              key={`${c.seconds}-${c.label}`}
              type="button"
              onClick={() => onChapter(i)}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                i === activeChapter
                  ? "bg-violet-600 border-violet-600 text-white"
                  : "bg-white border-violet-200 text-violet-800 hover:bg-violet-50",
              )}
            >
              {c.label}
            </button>
          ))}
        </nav>
      )}
    </motion.aside>,
    document.body,
  );
}
