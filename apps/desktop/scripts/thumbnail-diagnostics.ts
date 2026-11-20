/**
 * One-off, isolated diagnostic harness. It never imports pipeline workers,
 * never persists results, and reports aggregates only.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { app } from "electron";

const sandbox = process.env.POND_SANDBOX;
if (!sandbox) throw new Error("POND_SANDBOX is required");

for (const [name, path] of [
  ["userData", join(sandbox, "app-data")],
  ["sessionData", join(sandbox, "chromium")],
  ["logs", join(sandbox, "logs")],
  ["home", join(sandbox, "home")],
] as const) {
  mkdirSync(path, { recursive: true });
  app.setPath(name, path);
}

type SaveProbe = {
  sourceId: string;
  url: string;
  accountId: string | null;
  rawJson: string | null;
  cohort: "recent" | "older";
};

type Count = Record<string, number>;

function increment(counts: Count, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function probes(): SaveProbe[] {
  const db = new Database(join(sandbox, "indexes", "library.db"), {
    readonly: true,
  });
  const select = (order: "ASC" | "DESC") =>
    db.prepare(
      `SELECT source_id AS sourceId, url, account_id AS accountId, raw_json AS rawJson
     FROM saves WHERE source = 'twitter' AND deleted_at IS NULL
     ORDER BY saved_at ${order} LIMIT 3`,
    );
  const recent = select("DESC")
    .all()
    .map((row) => ({
      ...(row as Omit<SaveProbe, "cohort">),
      cohort: "recent" as const,
    }));
  const old = select("ASC")
    .all()
    .map((row) => ({
      ...(row as Omit<SaveProbe, "cohort">),
      cohort: "older" as const,
    }));
  db.close();
  return [...recent, ...old];
}

async function main(): Promise<void> {
  const [{ screenshotTweetDual }, { fetchMediaBatch, fetchAvatarToTxFile }] =
    await Promise.all([
      import("../src/main/core/refresh/harvest-window/screenshot"),
      import("../src/main/lib/blob"),
    ]);
  const screenshots: Count = {};
  const media: Count = {};
  const posters: Count = {};
  const cohorts: Count = {};

  for (const probe of probes()) {
    increment(cohorts, `${probe.cohort}:selected`);
    const shot = await screenshotTweetDual({
      url: probe.url,
      sourceId: probe.sourceId,
      accountId: probe.accountId,
      harvestMedia: true,
    });
    for (const [scheme, result] of [
      ["light", shot.light],
      ["dark", shot.dark],
    ] as const) {
      increment(
        screenshots,
        `${scheme}:${result.ok ? "captured" : (result.reason ?? "failed")}`,
      );
      if (result.imageDiagnostics) {
        increment(
          screenshots,
          `${scheme}:proceeded:${result.imageDiagnostics.proceededBy}`,
        );
        if (result.imageDiagnostics.failed > 0)
          increment(screenshots, `${scheme}:decode-failed`);
        if (result.imageDiagnostics.stillLoading > 0)
          increment(screenshots, `${scheme}:still-loading`);
      }
      // Deliberately no persistence call: all resulting screenshots are discarded.
      increment(screenshots, `${scheme}:persistence-not-attempted`);
    }

    const captured = shot.page?.media ?? [];
    const urls = captured
      .filter(
        (item) =>
          item.type !== "video" ||
          /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(item.url),
      )
      .map((item) => item.url);
    if (urls.length > 0) {
      const results = await fetchMediaBatch(urls);
      for (const result of results) {
        increment(
          media,
          result.file ? "downloaded" : `miss:${result.miss ?? "unknown"}`,
        );
      }
    }
    for (const item of captured.filter(
      (entry) => entry.type === "video" && entry.posterUrl,
    )) {
      const result = await fetchAvatarToTxFile(item.posterUrl ?? "");
      increment(
        posters,
        "file" in result ? "downloaded" : `miss:${result.miss}`,
      );
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      sampledSaves: Object.values(cohorts).reduce(
        (sum, value) => sum + value,
        0,
      ),
      cohorts,
      screenshots,
      media,
      posters,
      persistence:
        "not attempted; all screenshots and downloads were discarded",
    })}\n`,
  );
}

void app
  .whenReady()
  .then(main)
  .finally(() => app.quit());
