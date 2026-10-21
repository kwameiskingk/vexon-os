// Card media controls shared by both flow builders (client onboarding and
// SDR onboarding): upload a thumbnail, upload a video, or paste a Loom /
// YouTube link.
//
// The thumbnail is what a starter or client sees on the card's left panel;
// when the card also has a video it gains a play button and opens the
// full-screen player. A card can have a thumbnail with no video (a plain
// picture, per the design references) or a video with no thumbnail (the
// panel then shows a play tile).

import { useRef, useState } from "react";
import { Film, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  MAX_THUMBNAIL_BYTES,
  MAX_VIDEO_BYTES,
  THUMBNAIL_ACCEPT,
  VIDEO_ACCEPT,
  humanSize,
  mediaFileName,
  removeOnboardingMedia,
  uploadOnboardingMedia,
  useOnboardingMediaUrl,
  type MediaKind,
} from "@/lib/onboardingMedia";

export interface CardMedia {
  thumbnailPath: string;
  videoPath: string;
  videoUrl: string;
}

function UploadRow({
  kind, label, hint, accept, path, onChange, disabled,
}: {
  kind: MediaKind;
  label: string;
  hint: string;
  accept: string;
  path: string;
  onChange: (path: string) => void;
  disabled?: boolean;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useOnboardingMediaUrl(kind === "thumbnail" ? path || null : null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProgress(0);
    try {
      const previous = path;
      const uploaded = await uploadOnboardingMedia(file, kind, (f) => setProgress(f));
      onChange(uploaded);
      if (previous) void removeOnboardingMedia(previous);
      toast.success(kind === "video" ? "Video uploaded" : "Thumbnail uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const busy = progress !== null;
  const limit = kind === "video" ? MAX_VIDEO_BYTES : MAX_THUMBNAIL_BYTES;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-start gap-3">
        {kind === "thumbnail" && path && preview.data && (
          <img src={preview.data} alt="" className="h-14 w-24 rounded-md object-cover border border-border shrink-0" />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="inline-flex">
              <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                disabled={busy || disabled}
                onChange={(e) => pick(e.target.files?.[0])}
              />
              <span
                className={
                  "inline-flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 cursor-pointer hover:bg-muted " +
                  (busy || disabled ? "opacity-60 pointer-events-none" : "")
                }
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : kind === "video" ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                {path ? "Replace" : "Upload"} {kind === "video" ? "video" : "image"}
              </span>
            </label>
            {path && !busy && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
                onClick={() => { const p = path; onChange(""); void removeOnboardingMedia(p); }}
              >
                <Trash2 className="h-3 w-3" /> Remove
              </button>
            )}
          </div>
          {busy ? (
            <div className="space-y-1">
              <Progress value={Math.round((progress ?? 0) * 100)} className="h-1.5" />
              <p className="text-[11px] text-muted-foreground">
                Uploading… {Math.round((progress ?? 0) * 100)}%. Large videos take a few minutes; keep this tab open.
              </p>
            </div>
          ) : path ? (
            <p className="text-[11px] text-muted-foreground truncate">{mediaFileName(path)}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">{hint} Up to {humanSize(limit)}.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function MediaFields({
  value, onChange, disabled, mode = "card",
}: {
  value: CardMedia;
  onChange: (patch: Partial<CardMedia>) => void;
  disabled?: boolean;
  /**
   * "card" = the card's own media (thumbnail + the content video that opens
   * when they click the card). "intro" = the explainer that plays full screen
   * BEFORE the card (8 Sep): video or link only, no thumbnail.
   */
  mode?: "card" | "intro";
}) {
  const intro = mode === "intro";
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Upload className="h-3.5 w-3.5 text-violet-500" />
        <p className="text-xs font-semibold">{intro ? "Explainer video (plays full screen before the card)" : "Card media"}</p>
      </div>
      {intro && (
        <p className="text-[11px] text-muted-foreground">
          Someone from the team explaining this step. They watch it, press Continue, then the card appears.
        </p>
      )}

      {!intro && (
        <UploadRow
          kind="thumbnail"
          label="Thumbnail (shown on the left of the card)"
          hint="PNG or JPG, landscape works best."
          accept={THUMBNAIL_ACCEPT}
          path={value.thumbnailPath}
          onChange={(p) => onChange({ thumbnailPath: p })}
          disabled={disabled}
        />
      )}

      <UploadRow
        kind="video"
        label={intro ? "Explainer video" : "Video (opens full screen when they click the card)"}
        hint="MP4, MOV or WebM straight off the drive."
        accept={VIDEO_ACCEPT}
        path={value.videoPath}
        onChange={(p) => onChange({ videoPath: p })}
        disabled={disabled}
      />

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">…or paste a Loom / YouTube link instead</label>
        <Input
          value={value.videoUrl}
          onChange={(e) => onChange({ videoUrl: e.target.value })}
          placeholder="https://www.loom.com/share/…"
          disabled={!!value.videoPath || disabled}
        />
        {value.videoPath && (
          <p className="text-[11px] text-muted-foreground">An uploaded video is in use, so the link is ignored.</p>
        )}
      </div>
    </div>
  );
}
