/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { sourceIdFromUrl } from "@pond/schema/sources";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { inPageYoutubeNormalize } from "./normalize";
import type { YoutubeWatchPage } from "./normalize";

/** The scraper only reads the watch UI; saved forms recognized by sourceIdFromUrl can render a different page, so navigate to the canonical watch URL. */
export function urlForHarvest(url: string): string {
  const videoId = sourceIdFromUrl("youtube", url);
  if (!videoId) return url;
  const out = new URL("https://www.youtube.com/watch");
  out.searchParams.set("v", videoId);
  return out.href;
}

export function buildExpression(videoId: string): string {
  return buildItemExpression(
    inPageYoutubeNormalize,
    inPageYoutubeHarvest,
    videoId,
  );
}

async function inPageYoutubeHarvest(
  videoId: string,
  norm: ReturnType<typeof inPageYoutubeNormalize>,
): Promise<YoutubeWatchPage | null> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (document.querySelector("#title h1, ytd-video-primary-info-renderer")) {
      break;
    }
    await new Promise((r) => {
      setTimeout(r, 250);
    });
  }
  const page = norm.extractWatchPageMeta();
  if (!page || !norm.isShortsVideo(page.meta?.durationSec)) return page;

  try {
    if (!globalThis.fetch) return page;
    const controller = globalThis.AbortController
      ? new globalThis.AbortController()
      : null;
    const timeout = controller
      ? setTimeout(() => {
          controller.abort();
        }, 5000)
      : null;
    try {
      const init: RequestInit = { credentials: "same-origin" };
      if (controller) init.signal = controller.signal;
      const response = await globalThis.fetch(`/shorts/${videoId}`, init);
      if (response.ok) {
        const cover = norm.shortsDisplayCoverFromHtml(
          await response.text(),
          videoId,
        );
        if (cover) {
          page.mediaType = "video";
          page.mediaUrl = cover;
          page.mediaUrls = [{ url: cover, type: "video" }];
        }
      }
    } finally {
      if (timeout !== null) clearTimeout(timeout);
    }
  } catch {
    /** The watch harvest is already complete, so a failed cover probe must not discard it. */
  }
  return page;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
