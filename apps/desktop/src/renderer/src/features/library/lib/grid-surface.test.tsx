import { describe, expect, it } from "vitest";
import { openLibraryAt } from "@/app/test/library-router";
import { isGridSurfaceActive } from "./grid-surface";

describe("grid surface eligibility", () => {
  it("is active on a visible collection grid", async () => {
    await openLibraryAt("/folders/design");
    expect(isGridSurfaceActive()).toBe(true);
  });

  it("is inactive on a rail page", async () => {
    await openLibraryAt("/tags");
    expect(isGridSurfaceActive()).toBe(false);
  });

  it("is inactive while Inbox review covers the grid", async () => {
    await openLibraryAt("/inbox");
    expect(isGridSurfaceActive()).toBe(false);
  });

  it("is inactive while a Save covers the grid", async () => {
    await openLibraryAt("/recents?save=save-1");
    expect(isGridSurfaceActive()).toBe(false);
  });
});
