/**
 * Temporary capture diagnostics. Keep this separate from card rendering so it
 * can be removed after the thumbnail investigation without changing capture
 * behavior.
 */
export interface CaptureImageLike {
  currentSrc: string;
  src: string;
  complete: boolean;
  decode(): Promise<void>;
}

export interface CaptureImageDiagnostics {
  total: number;
  decoded: number;
  rejected: number;
  stillLoading: number;
  proceededBy: "all-complete" | "timeout";
}

export async function waitForImagesWithDiagnostics(
  images: readonly CaptureImageLike[],
  waitMs: number,
): Promise<CaptureImageDiagnostics> {
  const relevant = images.filter((image) =>
    Boolean(image.currentSrc || image.src),
  );
  let decoded = 0;
  let rejected = 0;
  if (relevant.length === 0) {
    return {
      total: 0,
      decoded,
      rejected,
      stillLoading: 0,
      proceededBy: "all-complete",
    };
  }

  const allComplete = Promise.all(
    relevant.map((image) =>
      image.decode().then(
        () => {
          decoded += 1;
        },
        () => {
          rejected += 1;
        },
      ),
    ),
  ).then(() => "all-complete" as const);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), waitMs);
  });
  const proceededBy = await Promise.race([allComplete, timeout]);
  if (timer) clearTimeout(timer);
  return {
    total: relevant.length,
    decoded,
    rejected,
    stillLoading: relevant.filter((image) => !image.complete).length,
    proceededBy,
  };
}
