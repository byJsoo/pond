import type { SaveFile } from "@pond/schema/db";
import type { RawJson } from "@pond/schema/raw";
import { hasMediaDims, videoPosterSlots } from "./poster-policy";

/** YouTube Shorts are at most three minutes. Longer videos keep the landscape poster. */
const YOUTUBE_SHORT_MAX_DURATION_SEC = 180;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

interface YoutubeShortPosterPlan {
  fallbackUrl: string;
  attempts: Array<string>;
  coverEvidenceUrl?: string;
}

interface MediaDims {
  width?: number | null;
  height?: number | null;
}

/**
 * Poster URLs to try for a Short, highest fidelity first.
 *
 * The captured poster is YouTube's effective Shorts cover. `oardefault` and
 * `sardefault` can have a high-quality unsigned copy of that same cover, while
 * `oar2` is only an automatic frame. The caller keeps a file only when the
 * pixels are taller than they are wide, then uses `fallbackUrl`.
 */
export function youtubeShortPosterPlan(
  rawJson: RawJson | null | undefined,
  fallbackUrl: string | null,
  videoDims?: MediaDims,
): YoutubeShortPosterPlan | null {
  const urls = collectUrls(rawJson, fallbackUrl);
  const videoId = urls
    .map(youtubeVideoIdFromUrl)
    .find((id): id is string => id !== null);
  if (!videoId) return null;
  const evidence = displayCoverEvidenceUrl(rawJson, videoId);
  const short = isShortCandidate({
    urls,
    durationSec: durationOf(rawJson),
    dims: dimsOf(rawJson, videoDims),
    hasCoverEvidence: evidence !== null,
  });
  if (!short) return null;

  const fallback =
    fallbackUrl && fallbackUrl.length > 0
      ? fallbackUrl
      : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const attempts: Array<string> = [];
  if (evidence) {
    const unsigned = unsignedCoverUrl(evidence, videoId);
    if (unsigned) attempts.push(unsigned);
    attempts.push(evidence);
  }
  attempts.push(
    `https://i.ytimg.com/vi/${videoId}/oardefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sardefault.jpg`,
    fallback,
    `https://i.ytimg.com/vi/${videoId}/oar2.jpg`,
    `https://i.ytimg.com/vi/${videoId}/frame0.jpg`,
  );
  const plan: YoutubeShortPosterPlan = {
    fallbackUrl: fallback,
    attempts: dedupe(attempts),
  };
  if (evidence) plan.coverEvidenceUrl = evidence;
  return plan;
}

/**
 * Slots whose portrait poster is known to be an automatic frame even though
 * the harvest carries YouTube's effective Shorts cover.
 */
export function youtubeShortPosterRepairIndexes(
  files: ReadonlyArray<SaveFile>,
  rawJson: RawJson | null | undefined,
): Array<number> {
  const videoId = videoIdFor(rawJson, null);
  const evidence = videoId ? displayCoverEvidenceUrl(rawJson, videoId) : null;
  if (!videoId || !evidence) return [];

  const { videos, posters } = videoPosterSlots(files);
  const indexes: Array<number> = [];
  for (let index = 0; index < videos.length; index += 1) {
    const video = videos[index];
    const poster = posters[index];
    if (
      !hasMediaDims(video) ||
      video.height <= video.width ||
      !poster?.sourceUrl ||
      poster.custom === true
    ) {
      continue;
    }
    const posterFile = youtubeImageFilename(poster.sourceUrl, videoId);
    if (
      (posterFile === "oar2.jpg" || posterFile === "frame0.jpg") &&
      poster.coverAttemptedUrl !== evidence
    ) {
      indexes.push(index);
    }
  }
  return indexes;
}

function videoIdFor(
  rawJson: RawJson | null | undefined,
  fallbackUrl: string | null,
): string | null {
  return (
    collectUrls(rawJson, fallbackUrl)
      .map(youtubeVideoIdFromUrl)
      .find((id): id is string => id !== null) ?? null
  );
}

function displayCoverEvidenceUrl(
  rawJson: RawJson | null | undefined,
  videoId: string,
): string | null {
  for (const media of rawJson?.capture?.media ?? []) {
    if (media.type !== "video" || !media.posterUrl) continue;
    const filename = youtubeImageFilename(media.posterUrl, videoId);
    if (filename === "oardefault.jpg" || filename === "sardefault.jpg") {
      return media.posterUrl;
    }
    if (filename === "hq720.jpg" && urlHasQuery(media.posterUrl)) {
      return media.posterUrl;
    }
  }
  return null;
}

function unsignedCoverUrl(url: string, videoId: string): string | null {
  const filename = youtubeImageFilename(url, videoId);
  if (filename !== "oardefault.jpg" && filename !== "sardefault.jpg") {
    return null;
  }
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return null;
  }
}

function youtubeImageFilename(url: string, videoId: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (host !== "ytimg.com" && !host.endsWith(".ytimg.com")) return null;
    for (const prefix of [`/vi/${videoId}/`, `/vi_webp/${videoId}/`]) {
      if (parsed.pathname.startsWith(prefix)) {
        return parsed.pathname.slice(prefix.length);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function urlHasQuery(url: string): boolean {
  try {
    return new URL(url).search.length > 0;
  } catch {
    return false;
  }
}

function youtubeVideoIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    return id && VIDEO_ID.test(id) ? id : null;
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const fromQuery = parsed.searchParams.get("v");
    if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery;
    const shorts = /^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/.exec(
      parsed.pathname,
    );
    if (shorts?.[1]) return shorts[1];
  }
  if (host === "ytimg.com" || host.endsWith(".ytimg.com")) {
    const thumb = /\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//.exec(parsed.pathname);
    if (thumb?.[1]) return thumb[1];
  }
  return null;
}

function isShortCandidate(args: {
  urls: Array<string>;
  durationSec: number | null;
  dims: MediaDims | null;
  hasCoverEvidence: boolean;
}): boolean {
  if (args.urls.some(isYoutubeShortsUrl) || args.hasCoverEvidence) return true;
  if (!isPortrait(args.dims)) return false;
  return (
    args.durationSec !== null &&
    args.durationSec > 0 &&
    args.durationSec <= YOUTUBE_SHORT_MAX_DURATION_SEC
  );
}

function isPortrait(dims: MediaDims | null): boolean {
  return hasMediaDims(dims) && dims.height > dims.width;
}

function isYoutubeShortsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return (
      (host === "youtube.com" || host.endsWith(".youtube.com")) &&
      parsed.pathname.startsWith("/shorts/")
    );
  } catch {
    return false;
  }
}

function durationOf(rawJson: RawJson | null | undefined): number | null {
  const capture = rawJson?.capture?.duration;
  if (capture !== undefined && Number.isFinite(capture)) {
    return capture;
  }
  const downloaded = rawJson?.ytdlp?.duration;
  if (downloaded !== undefined && Number.isFinite(downloaded)) {
    return downloaded;
  }
  return null;
}

function dimsOf(
  rawJson: RawJson | null | undefined,
  videoDims: MediaDims | undefined,
): MediaDims | null {
  if (hasMediaDims(videoDims)) {
    return { width: videoDims.width, height: videoDims.height };
  }
  const width = rawJson?.ytdlp?.width;
  const height = rawJson?.ytdlp?.height;
  if (
    width !== undefined &&
    height !== undefined &&
    Number.isFinite(width) &&
    Number.isFinite(height)
  ) {
    return { width, height };
  }
  for (const media of rawJson?.capture?.media ?? []) {
    if (
      media.type === "video" &&
      media.width !== undefined &&
      media.height !== undefined &&
      Number.isFinite(media.width) &&
      Number.isFinite(media.height)
    ) {
      return { width: media.width, height: media.height };
    }
  }
  return null;
}

function collectUrls(
  rawJson: RawJson | null | undefined,
  fallbackUrl: string | null,
): Array<string> {
  const urls = [
    fallbackUrl,
    rawJson?.capture?.url,
    rawJson?.ytdlp?.webpage_url,
    rawJson?.ytdlp?.original_url,
    rawJson?.ytdlp?.thumbnail,
  ];
  for (const media of rawJson?.capture?.media ?? []) {
    urls.push(media.url, media.posterUrl);
  }
  return urls.filter((url): url is string => Boolean(url));
}

function dedupe(urls: Array<string>): Array<string> {
  const seen = new Set<string>();
  const out: Array<string> = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
