// Enquire (19 Sep 2026): turn a pasted link into something the renderer can
// show. YouTube / Loom / Vimeo page links become player embeds, direct video
// files play inline, everything else is treated as an image.
export type Embed = { kind: "image" | "video" | "iframe"; src: string };

export function mediaEmbed(url: string | undefined | null): Embed | null {
  const u = (url || "").trim();
  if (!u) return null;
  let yt = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1` };
  yt = u.match(/loom\.com\/(?:share|embed)\/([A-Za-z0-9]+)/);
  if (yt) return { kind: "iframe", src: `https://www.loom.com/embed/${yt[1]}?hide_owner=true&hide_share=true&hide_title=true` };
  yt = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (yt) return { kind: "iframe", src: `https://player.vimeo.com/video/${yt[1]}?title=0&byline=0&portrait=0` };
  if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(u)) return { kind: "video", src: u };
  return { kind: "image", src: u };
}

export const mediaKindLabel = (url: string | undefined | null): string => {
  const e = mediaEmbed(url);
  return !e ? "" : e.kind === "iframe" ? "video (embedded player)" : e.kind === "video" ? "video file" : "image";
};
