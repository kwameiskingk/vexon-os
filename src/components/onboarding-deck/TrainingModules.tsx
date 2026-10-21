// A card that plays as a short course: modules of videos, watched in order
// (6 Oct 2026, Elena: "one module and then there's like three videos and
// then you have to watch all and then you go to the next module").
//
// - Every module lists its videos as 1, 2, 3 with clean titles and lengths.
// - A video counts as watched when it plays to the end.
// - Module N+1 unlocks once every video in module N is watched.
// - The card's "Mark complete · next task" unlocks after the last module.
//
// Progress is kept on the starter's device (localStorage, per user), so a
// half-watched course survives a reload; the card's completion itself is
// saved as usual. The sandbox adds a "Mark as watched" link per video so the
// flow can be reviewed without sitting through two hours of video.

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Lock, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, type TrainingModule, type TrainingVideo } from "@/lib/sdrTrainingModules";
import { usePrimaryAction } from "./CardAction";

interface Props {
  stepKey: string;
  modules: TrainingModule[];
  /** Already completed: everything shows as watched and unlocked. */
  done: boolean;
  completing: boolean;
  onComplete: () => void;
  sandbox?: boolean;
  userId?: string | null;
}

const storageKey = (userId: string | null | undefined, stepKey: string, sandbox?: boolean) =>
  `vexon:training:${sandbox ? "sandbox" : userId ?? "me"}:${stepKey}`;

function readWatched(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeWatched(key: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Private window or blocked storage: progress lasts for this visit only.
  }
}

export function TrainingModulesStep({ stepKey, modules, done, completing, onComplete, sandbox, userId }: Props) {
  const key = storageKey(userId, stepKey, sandbox);
  const [watched, setWatched] = useState<Set<string>>(() => readWatched(key));
  useEffect(() => setWatched(readWatched(key)), [key]);

  const allVideos = useMemo(() => modules.flatMap((m) => m.videos), [modules]);
  const isWatched = (id: string) => done || watched.has(id);
  const moduleDone = (m: TrainingModule) => m.videos.every((vid) => isWatched(vid.id));
  const unlocked = (i: number) => done || modules.slice(0, i).every(moduleDone);
  const watchedCount = allVideos.filter((vid) => isWatched(vid.id)).length;
  const allWatched = watchedCount === allVideos.length;
  const currentModule = Math.max(0, modules.findIndex((m) => !moduleDone(m)));

  const firstUnwatched = (m: TrainingModule) => m.videos.find((vid) => !isWatched(vid.id)) ?? m.videos[0];
  const [openModule, setOpenModule] = useState<number>(done ? -1 : currentModule);
  // 6 Oct (the owner): the card opens with the next video already in the player,
  // so it is obvious there are videos to watch. It starts when the starter
  // presses play; after that, each next video starts on its own.
  const [playing, setPlaying] = useState<TrainingVideo | null>(() =>
    done ? null : firstUnwatched(modules[currentModule] ?? modules[0]),
  );
  const [autoplay, setAutoplay] = useState(false);
  const choose = (vid: TrainingVideo) => {
    setAutoplay(true);
    setPlaying(vid);
  };

  const markWatched = (id: string) => {
    setWatched((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      writeWatched(key, next);
      return next;
    });
  };

  // When a video ends: tick it, then queue the next unwatched one in the
  // same module, or open the next module once this one is finished.
  const onEnded = (vid: TrainingVideo) => {
    markWatched(vid.id);
    const mi = modules.findIndex((m) => m.videos.some((x) => x.id === vid.id));
    const m = modules[mi];
    const nextInModule = m.videos.find((x) => x.id !== vid.id && !isWatched(x.id));
    if (nextInModule) {
      choose(nextInModule);
      return;
    }
    if (mi + 1 < modules.length) {
      setOpenModule(mi + 1);
      choose(modules[mi + 1].videos[0]);
    } else {
      setPlaying(null);
    }
  };

  usePrimaryAction({
    onClick: onComplete,
    busy: completing,
    disabled: !allWatched && !done,
    hint: allWatched || done
      ? null
      : `${watchedCount} of ${allVideos.length} videos watched. Finish every module to continue.`,
  });

  return (
    <div className="space-y-4 text-left">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {done || allWatched
            ? `All ${modules.length} modules complete`
            : `Module ${currentModule + 1} of ${modules.length}`}
        </span>
        <span>{watchedCount} / {allVideos.length} watched</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-violet-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-violet-400 to-blue-400 transition-all"
          style={{ width: `${Math.round((watchedCount / allVideos.length) * 100)}%` }}
        />
      </div>

      {playing && (
        <Player
          key={playing.id}
          video={playing}
          autoPlay={autoplay}
          onEnded={() => onEnded(playing)}
          sandbox={sandbox}
          watched={isWatched(playing.id)}
        />
      )}

      <ol className="space-y-2">
        {modules.map((m, i) => {
          const open = openModule === i;
          const isUnlocked = unlocked(i);
          const complete = moduleDone(m);
          const count = m.videos.filter((vid) => isWatched(vid.id)).length;
          return (
            <li key={m.id} className={cn("rounded-xl border bg-white", isUnlocked ? "border-violet-200/80" : "border-slate-200 opacity-70")}>
              <button
                type="button"
                disabled={!isUnlocked}
                onClick={() => {
                  setOpenModule(open ? -1 : i);
                  if (!open && isUnlocked) choose(firstUnwatched(m));
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed"
              >
                {complete ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                ) : isUnlocked ? (
                  <PlayCircle className="h-5 w-5 shrink-0 text-violet-500" />
                ) : (
                  <Lock className="h-5 w-5 shrink-0 text-slate-400" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-violet-600">Module {i + 1}</span>
                  <span className="block font-semibold text-slate-900">{m.title}</span>
                  <span className="block text-xs text-slate-500">
                    {isUnlocked
                      ? `${count} of ${m.videos.length} videos watched · ${formatDuration(m.videos.reduce((a, x) => a + x.seconds, 0))}`
                      : `Finish Module ${i} to unlock`}
                  </span>
                </span>
                {isUnlocked && <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />}
              </button>
              {open && isUnlocked && (
                <ul className="border-t border-violet-100 px-2 py-2">
                  {m.videos.map((vid, j) => {
                    const seen = isWatched(vid.id);
                    const active = playing?.id === vid.id;
                    return (
                      <li key={vid.id}>
                        <button
                          type="button"
                          onClick={() => choose(vid)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-violet-50",
                            active && "bg-violet-50",
                          )}
                        >
                          {seen ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-violet-300" />
                          )}
                          <span className="w-5 shrink-0 text-slate-400">{j + 1}.</span>
                          <span className={cn("flex-1", active ? "font-semibold text-violet-700" : "text-slate-800")}>{vid.title}</span>
                          <span className="shrink-0 text-xs text-slate-400">{formatDuration(vid.seconds)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Player({ video, autoPlay, onEnded, sandbox, watched }: { video: TrainingVideo; autoPlay: boolean; onEnded: () => void; sandbox?: boolean; watched: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const fired = useRef(false);
  const finish = () => {
    if (fired.current) return;
    fired.current = true;
    onEnded();
  };
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl bg-black shadow-sm">
        <video
          ref={ref}
          src={video.src}
          controls
          autoPlay={autoPlay}
          playsInline
          preload="auto"
          className="aspect-video w-full"
          onEnded={finish}
          onTimeUpdate={(e) => {
            // Some browsers skip "ended" after a seek to the very end.
            const el = e.currentTarget;
            if (el.duration && el.currentTime >= el.duration - 0.75) finish();
          }}
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-800">{video.title}</span>
        {sandbox && !watched && (
          <button type="button" onClick={finish} className="text-xs font-medium text-violet-700 hover:underline">
            Mark as watched (sandbox)
          </button>
        )}
      </div>
    </div>
  );
}
