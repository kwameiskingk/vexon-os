// Uploaded onboarding media: walkthrough videos and card thumbnails.
//
// the owner's ruling (4 Sep): most onboarding videos come off the shared drive
// rather than Loom or YouTube, so they are uploaded straight into Vexon OS.
// A card can carry a thumbnail (shown on the card's left panel) and a video;
// clicking the thumbnail opens the video in a near-full-screen player, the
// same pop-out treatment the client onboarding form gets.
//
// Videos are big, so uploads go through a SIGNED UPLOAD URL with a plain
// XHR PUT: supabase-js's .upload() gives no progress events, and a ten-minute
// walkthrough with no progress bar looks broken. Everything else (signed
// playback URLs, deletes) uses the normal client.
//
// Bucket `onboarding-media` is private; playback always goes through a signed
// URL. Storage supports range requests on those, so seeking and speed changes
// work in the player.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ONBOARDING_MEDIA_BUCKET = "onboarding-media";

/** 1 GB: long walkthroughs off the shared drive, matching the bucket limit. */
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;

export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v";
export const THUMBNAIL_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";

const sanitize = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-70) || "file";

export const humanSize = (bytes: number) => {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/** Filename as authored, with our storage prefix stripped for display. */
export const mediaFileName = (path: string) =>
  path.split("/").pop()?.replace(/^[a-z0-9]+-/, "") ?? path;

export type MediaKind = "video" | "thumbnail";

/**
 * Upload with real progress. Returns the storage path to persist on the step.
 * Throws with a readable message; callers surface it in a toast.
 */
export async function uploadOnboardingMedia(
  file: File,
  kind: MediaKind,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const limit = kind === "video" ? MAX_VIDEO_BYTES : MAX_THUMBNAIL_BYTES;
  if (file.size > limit) {
    throw new Error(`That file is ${humanSize(file.size)}. The limit is ${humanSize(limit)}.`);
  }
  const prefix = kind === "video" ? "video" : "thumb";
  const path = `${prefix}/${Date.now().toString(36)}-${sanitize(file.name)}`;

  const { data, error } = await supabase.storage
    .from(ONBOARDING_MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not start the upload. Has the media migration been run?");
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.signedUrl, true);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}). ${xhr.responseText?.slice(0, 160) ?? ""}`.trim()));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });

  onProgress?.(1);
  return path;
}

/** Best effort: a failed delete never blocks saving the step. */
export async function removeOnboardingMedia(path: string): Promise<void> {
  try {
    await supabase.storage.from(ONBOARDING_MEDIA_BUCKET).remove([path]);
  } catch {
    /* orphaned object, harmless */
  }
}

/** A path that is already a URL: a site-relative file under /public (2 Oct,
 *  the WhatsApp card's video ships with the app) or an absolute http(s) link.
 *  Played as-is in the real <video>; nothing to sign. */
export function isDirectMediaUrl(path: string | null | undefined): boolean {
  return !!path && (path.startsWith("/") || /^https?:\/\//.test(path));
}

/** Signed playback/preview URL for a stored path. Null path → null URL. */
export function useOnboardingMediaUrl(path: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["onboarding-media-url", path],
    enabled: !!path && enabled,
    // Signed for 2h, refetched after 50m so a long watch never expires mid-play.
    staleTime: 50 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      if (isDirectMediaUrl(path)) return path!;
      const { data } = await supabase.storage
        .from(ONBOARDING_MEDIA_BUCKET)
        .createSignedUrl(path!, 7200);
      return data?.signedUrl ?? null;
    },
  });
}
