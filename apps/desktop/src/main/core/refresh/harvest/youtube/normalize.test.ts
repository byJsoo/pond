import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildExpression } from "./item";
import type { YoutubeWatchPage } from "./normalize";

const caption = `#gregdoucette #leenbeefpatty #fitness

Game Changing TEST BOOSTER FERULA:
https://www.htltsupps.com/products/ferula

SCULPTD Training App:
https://www.sculptdapp.com/`;

const descriptionBox = `<div id="title"><h1>Leg day</h1></div>
<div id="description-inner">
  <div id="description-inline-expander">
    <div id="attributed-snippet-text">12345678901234567890123456789 123456<br>78901234567890123456789 K<br>views<br><br>12345678901234567890123456789<br>h ago<br><br>#gregdoucette #leenbeefpatty #fitness<br><br>153,002 views • Sep 29, 2026 • #gregdoucette #leenbeefpatty #fitness<br><br>Game Changing TEST BOOSTER FERULA:<br>https://www.htltsupps.com/products/fe...<br><br>SCULPTD Training App:<br>https://www.sculptdapp.com/ ...more</div>
    <button id="expand">more</button>
  </div>
</div>`;

interface PlayerResponse {
  videoDetails: {
    videoId?: string;
    shortDescription?: string;
    viewCount?: string;
    lengthSeconds?: string;
  };
  microformat?: {
    playerMicroformatRenderer: {
      publishDate?: string;
      canonicalUrl?: string;
      isShortsEligible?: boolean;
      thumbnail?: {
        isOriginalAspectRatio?: boolean;
        thumbnails?: Array<{ url?: string; width?: number; height?: number }>;
      };
    };
  };
}

async function harvest(
  html: string,
  player?: PlayerResponse,
  options: { fetchPage?: unknown } = {},
) {
  const { window } = new JSDOM(
    `<!doctype html><html><body>${html}</body></html>`,
    { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  );
  const context = {
    document: window.document,
    location: window.location,
    ytInitialPlayerResponse: player,
    URL,
    DOMParser: window.DOMParser,
    AbortController,
    setTimeout,
    clearTimeout,
  };
  const vmContext = options.fetchPage
    ? { ...context, fetch: options.fetchPage }
    : context;
  const page: Promise<YoutubeWatchPage | null> = runInNewContext(
    buildExpression("dQw4w9WgXcQ"),
    vmContext,
  );
  return page;
}

function shortsPage(
  videoId: string,
  thumbnails: Array<{ url: string; width: number; height: number }>,
  options: { includePlayer?: boolean; ogImage?: string } = {},
) {
  const ogImage = options.ogImage ?? thumbnails[0]?.url ?? "";
  const player = {
    videoDetails: { videoId },
    microformat: {
      playerMicroformatRenderer: {
        canonicalUrl: `https://www.youtube.com/shorts/${videoId}`,
        thumbnail: { isOriginalAspectRatio: true, thumbnails },
      },
    },
  };
  const script =
    options.includePlayer === false
      ? ""
      : `<script>ytInitialPlayerResponse = ${JSON.stringify(player)};</script>`;
  return `<!doctype html><html><head><link rel="canonical" href="https://www.youtube.com/shorts/${videoId}"><meta property="og:url" content="https://www.youtube.com/shorts/${videoId}"><meta property="og:image" content="${ogImage}"></head><body>${script}</body></html>`;
}

describe("youtube watch description", () => {
  it("saves the player caption instead of the description box", async () => {
    const page = await harvest(descriptionBox, {
      videoDetails: { shortDescription: caption },
    });
    expect(page?.description).toBe(caption);
  });

  it("leaves the description empty when the video has no caption", async () => {
    const page = await harvest(descriptionBox, {
      videoDetails: { shortDescription: "  " },
    });
    expect(page?.title).toBe("Leg day");
    expect(page?.description).toBeUndefined();
  });

  it("drops view counts, the digit probe, and the expand control when the player caption is missing", async () => {
    const page = await harvest(descriptionBox);
    expect(page?.description).toBe(`#gregdoucette #leenbeefpatty #fitness

Game Changing TEST BOOSTER FERULA:
https://www.htltsupps.com/products/fe...

SCULPTD Training App:
https://www.sculptdapp.com/`);
  });
});

describe("youtube watch metadata", () => {
  const player: PlayerResponse = {
    videoDetails: {
      videoId: "dQw4w9WgXcQ",
      shortDescription: caption,
      viewCount: "768679906",
      lengthSeconds: "234",
    },
    microformat: {
      playerMicroformatRenderer: { publishDate: "2023-12-07T16:00:10-08:00" },
    },
  };

  it("reads views, the publish date, and length from the player response", async () => {
    const page = await harvest(
      `${descriptionBox}<div id="info-strings"><yt-formatted-string>Premiered Dec 8, 2023</yt-formatted-string></div>`,
      player,
    );
    expect(page?.meta).toMatchObject({
      views: 768_679_906,
      publishedAt: "2023-12-07T16:00:10-08:00",
      durationSec: 234,
    });
  });

  it("uses the player's portrait thumbnail instead of the landscape poster", async () => {
    const page = await harvest(
      `${descriptionBox}<video poster="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"></video>`,
      {
        videoDetails: {
          videoId: "dQw4w9WgXcQ",
          lengthSeconds: "39",
        },
        microformat: {
          playerMicroformatRenderer: {
            thumbnail: {
              isOriginalAspectRatio: true,
              thumbnails: [
                {
                  url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                  width: 480,
                  height: 360,
                },
                {
                  url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oardefault.jpg?sqp=1",
                  width: 405,
                  height: 720,
                },
              ],
            },
          },
        },
      },
    );
    expect(page?.mediaUrl).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/oardefault.jpg?sqp=1",
    );
  });

  it("ignores a player response left over from another video", async () => {
    const page = await harvest(descriptionBox, {
      ...player,
      videoDetails: { ...player.videoDetails, videoId: "otherVideo1" },
    });
    expect(page?.meta?.views).toBeUndefined();
    expect(page?.meta?.durationSec).toBeUndefined();
    expect(page?.description).not.toBe(caption);
  });

  const shortsWatchPlayer: PlayerResponse = {
    videoDetails: {
      videoId: "dQw4w9WgXcQ",
      shortDescription: caption,
      viewCount: "1000",
      lengthSeconds: "58",
    },
    microformat: {
      playerMicroformatRenderer: {
        canonicalUrl: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        isShortsEligible: true,
        publishDate: "2026-01-01T00:00:00-08:00",
        thumbnail: {
          thumbnails: [
            {
              url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg?sqp=watch",
              width: 1280,
              height: 720,
            },
          ],
        },
      },
    },
  };

  it.each(["oardefault.jpg", "sardefault.jpg", "hq720.jpg"])(
    "reads the exact Shorts display cover from the /shorts player response: %s",
    async (filename) => {
      const cover = `https://i.ytimg.com/vi/dQw4w9WgXcQ/${filename}?sqp=signed`;
      const fetched: Array<string> = [];
      const page = await harvest(
        `${descriptionBox}<video poster="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"></video>`,
        shortsWatchPlayer,
        {
          fetchPage: async (url: string) => {
            fetched.push(url);
            return {
              ok: true,
              text: async () =>
                shortsPage("dQw4w9WgXcQ", [
                  { url: cover, width: 405, height: 720 },
                ]),
            };
          },
        },
      );

      expect(fetched).toEqual(["/shorts/dQw4w9WgXcQ"]);
      expect(page?.mediaUrl).toBe(cover);
      expect(page?.mediaUrls).toEqual([{ url: cover, type: "video" }]);
      expect(page?.title).toBe("Leg day");
      expect(page?.description).toBe(caption);
      expect(page?.meta).toMatchObject({
        views: 1000,
        durationSec: 58,
        publishedAt: "2026-01-01T00:00:00-08:00",
      });
    },
  );

  it("uses the Shorts og image when the player response cannot be parsed", async () => {
    const cover =
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/oardefault.jpg?sqp=signed";
    const page = await harvest(
      `${descriptionBox}<video poster="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"></video>`,
      shortsWatchPlayer,
      {
        fetchPage: async () => ({
          ok: true,
          text: async () =>
            shortsPage("dQw4w9WgXcQ", [], {
              includePlayer: false,
              ogImage: cover,
            }),
        }),
      },
    );

    expect(page?.mediaUrl).toBe(cover);
  });

  it("ignores a portrait player thumbnail when /shorts canonicalizes back to watch", async () => {
    const cover = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg?sqp=signed";
    const normalPlayer = {
      videoDetails: { videoId: "dQw4w9WgXcQ" },
      microformat: {
        playerMicroformatRenderer: {
          canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          thumbnail: {
            isOriginalAspectRatio: true,
            thumbnails: [{ url: cover, width: 405, height: 720 }],
          },
        },
      },
    };
    const html = `<!doctype html><html><head><link rel="canonical" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"><meta property="og:url" content="https://www.youtube.com/watch?v=dQw4w9WgXcQ"><meta property="og:image" content="${cover}"></head><body><script>ytInitialPlayerResponse = ${JSON.stringify(normalPlayer)};</script></body></html>`;
    const page = await harvest(
      `${descriptionBox}<video poster="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"></video>`,
      shortsWatchPlayer,
      {
        fetchPage: async () => ({ ok: true, text: async () => html }),
      },
    );

    expect(page?.mediaUrl).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });

  it("does not probe /shorts for a normal watch video", async () => {
    const fetched: Array<string> = [];
    const page = await harvest(
      `${descriptionBox}<video poster="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"></video>`,
      {
        videoDetails: {
          videoId: "dQw4w9WgXcQ",
          lengthSeconds: "30",
        },
        microformat: {
          playerMicroformatRenderer: {
            canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            isShortsEligible: false,
          },
        },
      },
      {
        fetchPage: async (url: string) => {
          fetched.push(url);
          return { ok: false, text: async () => "" };
        },
      },
    );

    expect(fetched).toEqual([]);
    expect(page?.mediaUrl).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });

  it("keeps the watch harvest when the Shorts cover probe fails", async () => {
    const page = await harvest(
      `${descriptionBox}<video poster="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"></video>`,
      shortsWatchPlayer,
      {
        fetchPage: async () => {
          throw new Error("offline");
        },
      },
    );

    expect(page?.title).toBe("Leg day");
    expect(page?.description).toBe(caption);
    expect(page?.mediaUrl).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
    expect(page?.meta?.durationSec).toBe(58);
  });
});
