import type { SaveFile } from "@pond/schema/db";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import { describe, expect, it } from "vitest";
import {
  youtubeShortPosterPlan,
  youtubeShortPosterRepairIndexes,
} from "./youtube-thumbnail";

const SHORT_ID = "a88WoGBL1Mc";
const IMAGE_BASE = `https://i.ytimg.com/vi/${SHORT_ID}`;
const LANDSCAPE = `${IMAGE_BASE}/hqdefault.jpg`;
const OARDEFAULT = `${IMAGE_BASE}/oardefault.jpg`;
const SARDEFAULT = `${IMAGE_BASE}/sardefault.jpg`;
const OAR2 = `${IMAGE_BASE}/oar2.jpg`;
const FRAME0 = `${IMAGE_BASE}/frame0.jpg`;

function watchCapture(options: {
  duration?: number;
  posterUrl?: string;
  width?: number;
  height?: number;
}) {
  return storedAsRawJson({
    capture: {
      id: SHORT_ID,
      source: "youtube",
      url: `https://www.youtube.com/watch?v=${SHORT_ID}`,
      duration: options.duration,
      media: [
        {
          type: "video",
          url: `https://www.youtube.com/watch?v=${SHORT_ID}`,
          posterUrl: options.posterUrl ?? LANDSCAPE,
        },
      ],
    },
    ytdlp: {
      duration: options.duration,
      width: options.width,
      height: options.height,
      thumbnail: LANDSCAPE,
    },
  });
}

describe("youtubeShortPosterPlan", () => {
  it("prefers the unsigned copy of exact oardefault cover evidence, then the signed evidence", () => {
    const signed = `${OARDEFAULT}?sqp=signed`;
    expect(
      youtubeShortPosterPlan(
        watchCapture({
          duration: 39,
          width: 1080,
          height: 1920,
          posterUrl: signed,
        }),
        LANDSCAPE,
      ),
    ).toEqual({
      fallbackUrl: LANDSCAPE,
      attempts: [OARDEFAULT, signed, SARDEFAULT, LANDSCAPE, OAR2, FRAME0],
      coverEvidenceUrl: signed,
    });
  });

  it("prefers the unsigned copy of exact sardefault cover evidence", () => {
    const signed = `${SARDEFAULT}?sqp=signed`;
    expect(
      youtubeShortPosterPlan(
        watchCapture({
          duration: 61,
          width: 1080,
          height: 1920,
          posterUrl: signed,
        }),
        LANDSCAPE,
      )?.attempts,
    ).toEqual([SARDEFAULT, signed, OARDEFAULT, LANDSCAPE, OAR2, FRAME0]);
  });

  it("keeps exact signed hq720 crop evidence ahead of hardcoded cover endpoints", () => {
    const signed = `${IMAGE_BASE}/hq720.jpg?sqp=signed`;
    expect(
      youtubeShortPosterPlan(
        watchCapture({
          duration: 58,
          width: 1080,
          height: 1920,
          posterUrl: signed,
        }),
        LANDSCAPE,
      )?.attempts,
    ).toEqual([signed, OARDEFAULT, SARDEFAULT, LANDSCAPE, OAR2, FRAME0]);
  });

  it("puts automatic frame endpoints after cover endpoints when no exact evidence was harvested", () => {
    expect(
      youtubeShortPosterPlan(
        watchCapture({
          duration: 39,
          width: 1080,
          height: 1920,
          posterUrl: LANDSCAPE,
        }),
        LANDSCAPE,
      )?.attempts,
    ).toEqual([OARDEFAULT, SARDEFAULT, LANDSCAPE, OAR2, FRAME0]);
  });

  it("treats a /shorts/ URL as a short when dimensions were not harvested", () => {
    const rawJson = storedAsRawJson({
      capture: {
        id: SHORT_ID,
        source: "youtube",
        url: `https://www.youtube.com/shorts/${SHORT_ID}`,
        media: [
          {
            type: "video",
            url: `https://www.youtube.com/shorts/${SHORT_ID}`,
            posterUrl: LANDSCAPE,
          },
        ],
      },
    });
    expect(youtubeShortPosterPlan(rawJson, LANDSCAPE)?.attempts[0]).toBe(
      OARDEFAULT,
    );
  });

  it("leaves a longer video on its current thumbnail", () => {
    expect(
      youtubeShortPosterPlan(
        watchCapture({
          duration: 181,
          width: 1080,
          height: 1920,
        }),
        LANDSCAPE,
      ),
    ).toBeNull();
  });

  it("leaves a short landscape video on the normal platform thumbnail", () => {
    expect(
      youtubeShortPosterPlan(
        watchCapture({
          duration: 30,
          width: 1280,
          height: 720,
        }),
        LANDSCAPE,
      ),
    ).toBeNull();
  });

  it("uses the slot dimensions when ytdlp dimensions are absent", () => {
    const rawJson = storedAsRawJson({
      capture: {
        id: SHORT_ID,
        source: "youtube",
        url: `https://www.youtube.com/watch?v=${SHORT_ID}`,
        duration: 39,
        media: [
          {
            type: "video",
            url: `https://www.youtube.com/watch?v=${SHORT_ID}`,
            posterUrl: LANDSCAPE,
          },
        ],
      },
    });
    expect(
      youtubeShortPosterPlan(rawJson, LANDSCAPE, {
        width: 1080,
        height: 1920,
      })?.attempts[0],
    ).toBe(OARDEFAULT);
  });
});

function file(
  kind: SaveFile["kind"],
  path: string,
  overrides: Partial<SaveFile> = {},
): SaveFile {
  return { kind, path, sha256: "", size: 1, ...overrides };
}

describe("youtubeShortPosterRepairIndexes", () => {
  const evidence = `${OARDEFAULT}?sqp=signed`;
  const rawJson = watchCapture({
    duration: 39,
    width: 1080,
    height: 1920,
    posterUrl: evidence,
  });

  it("marks an automatic oar2 frame for replacement when exact cover evidence exists", () => {
    expect(
      youtubeShortPosterRepairIndexes(
        [
          file("video", "video.mp4", { width: 1080, height: 1920 }),
          file("poster", "poster-1.jpg", { sourceUrl: OAR2 }),
        ],
        rawJson,
      ),
    ).toEqual([0]);
  });

  it("does not replace a poster already sourced from the same cover endpoint", () => {
    expect(
      youtubeShortPosterRepairIndexes(
        [
          file("video", "video.mp4", { width: 1080, height: 1920 }),
          file("poster", "poster-1.jpg", { sourceUrl: OARDEFAULT }),
        ],
        rawJson,
      ),
    ).toEqual([]);
  });

  it("does not replace a custom poster", () => {
    expect(
      youtubeShortPosterRepairIndexes(
        [
          file("video", "video.mp4", { width: 1080, height: 1920 }),
          file("poster", "poster-1.jpg", { sourceUrl: OAR2, custom: true }),
        ],
        rawJson,
      ),
    ).toEqual([]);
  });

  it("does not repair without exact cover evidence", () => {
    expect(
      youtubeShortPosterRepairIndexes(
        [
          file("video", "video.mp4", { width: 1080, height: 1920 }),
          file("poster", "poster-1.jpg", { sourceUrl: OAR2 }),
        ],
        watchCapture({ duration: 39, width: 1080, height: 1920 }),
      ),
    ).toEqual([]);
  });

  it("does not repeat a repair that already fell back to the automatic frame", () => {
    expect(
      youtubeShortPosterRepairIndexes(
        [
          file("video", "video.mp4", { width: 1080, height: 1920 }),
          file("poster", "poster-1.jpg", {
            sourceUrl: OAR2,
            coverAttemptedUrl: evidence,
          }),
        ],
        rawJson,
      ),
    ).toEqual([]);
  });

  it("retries the frame repair when harvest carries different cover evidence", () => {
    expect(
      youtubeShortPosterRepairIndexes(
        [
          file("video", "video.mp4", { width: 1080, height: 1920 }),
          file("poster", "poster-1.jpg", {
            sourceUrl: OAR2,
            coverAttemptedUrl: `${evidence}&stale=1`,
          }),
        ],
        rawJson,
      ),
    ).toEqual([0]);
  });

  it("does not frame-repair a landscape video", () => {
    expect(
      youtubeShortPosterRepairIndexes(
        [
          file("video", "video.mp4", { width: 1280, height: 720 }),
          file("poster", "poster-1.jpg", { sourceUrl: OAR2 }),
        ],
        rawJson,
      ),
    ).toEqual([]);
  });
});
