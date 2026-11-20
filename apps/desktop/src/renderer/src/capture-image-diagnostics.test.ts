import { describe, expect, it, vi } from "vitest";
import { waitForImagesWithDiagnostics } from "./capture-image-diagnostics";

function image(decode: () => Promise<void>, complete = true) {
  return { currentSrc: "image", src: "image", complete, decode };
}

describe("waitForImagesWithDiagnostics", () => {
  it("records successful decodes", async () => {
    const result = await waitForImagesWithDiagnostics(
      [image(async () => {})],
      20,
    );
    expect(result).toEqual({
      total: 1,
      decoded: 1,
      rejected: 0,
      stillLoading: 0,
      proceededBy: "all-complete",
    });
  });

  it("records rejected decodes while allowing readiness", async () => {
    const result = await waitForImagesWithDiagnostics(
      [image(async () => Promise.reject(new Error("decode failed")))],
      20,
    );
    expect(result).toMatchObject({
      decoded: 0,
      rejected: 1,
      proceededBy: "all-complete",
    });
  });

  it("records images still pending when the timeout wins", async () => {
    vi.useFakeTimers();
    const result = waitForImagesWithDiagnostics(
      [image(() => new Promise(() => {}), false)],
      6000,
    );
    await vi.advanceTimersByTimeAsync(6000);
    await expect(result).resolves.toEqual({
      total: 1,
      decoded: 0,
      rejected: 0,
      stillLoading: 1,
      proceededBy: "timeout",
    });
    vi.useRealTimers();
  });
});
