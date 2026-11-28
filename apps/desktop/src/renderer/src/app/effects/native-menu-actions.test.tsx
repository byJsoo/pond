import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentLocation, openLibraryAt } from "@/app/test/library-router";
import { filterToolbar } from "@/features/library/components/filter-menu/toolbar-state";
import { searchViewKey } from "@/features/library/lib/search-view";
import {
  currentSort,
  getViewState,
  resetFilters,
  searchAllSaves,
  setSearchDraft,
} from "@/features/library/state/view-store";
import {
  handleNativeMenuAction,
  shouldIgnoreMenuAction,
} from "./native-menu-actions";

let editor: HTMLDivElement;

beforeEach(() => {
  editor = document.createElement("div");
  editor.contentEditable = "true";
  editor.tabIndex = 0;
  editor.setAttribute("role", "textbox");
  document.body.append(editor);
});

afterEach(() => {
  editor.remove();
});

it("ignores a native accelerator while the fish composer owns the keyboard", () => {
  editor.focus();
  expect(document.activeElement).toBe(editor);

  expect(shouldIgnoreMenuAction("accelerator", "view.sidebar.toggle")).toBe(
    true,
  );
  expect(shouldIgnoreMenuAction("accelerator", "view.layout.waterfall")).toBe(
    true,
  );
});

it("ignores a native accelerator while a native input is focused", () => {
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  expect(shouldIgnoreMenuAction("accelerator", "save.open-with-default")).toBe(
    true,
  );
  input.remove();
});

it("allows Search from a field when the field did not handle it", () => {
  editor.focus();

  expect(shouldIgnoreMenuAction("accelerator", "library.search")).toBe(false);
});

it("allows a native accelerator outside an editor", () => {
  document.body.focus();

  expect(shouldIgnoreMenuAction("accelerator", "view.sidebar.toggle")).toBe(
    false,
  );
});

it("allows an explicit menu command while an editor has focus", () => {
  editor.focus();

  expect(shouldIgnoreMenuAction("menu", "view.sidebar.toggle")).toBe(false);
});

describe("grid-only native menu actions", () => {
  it("ignores filter commands outside an active grid", async () => {
    await openLibraryAt("/tags");
    const open = filterToolbar.isOpen();

    handleNativeMenuAction("find.filters.toggle");

    expect(filterToolbar.isOpen()).toBe(open);
  });

  it("ignores random sort outside an active grid", async () => {
    await openLibraryAt("/tags");
    const sort = currentSort();
    const randomSeed = getViewState().randomSeed;

    handleNativeMenuAction("view.random");

    expect(currentSort()).toEqual(sort);
    expect(getViewState().randomSeed).toBe(randomSeed);
  });

  it("ignores subfolder contents outside an active grid", async () => {
    await openLibraryAt("/tags");
    const includeSubfolders = getViewState().includeSubfolders;

    handleNativeMenuAction("view.subfolders.toggle");

    expect(getViewState().includeSubfolders).toBe(includeSubfolders);
  });

  it("does not narrow a hidden search scope outside an active grid", async () => {
    const view = { kind: "folder", id: "design" } as const;
    searchAllSaves(view);
    await openLibraryAt("/tags");

    try {
      handleNativeMenuAction("find.search");
      expect(getViewState().searchAllView).toBe(searchViewKey(view));
    } finally {
      resetFilters();
    }
  });
});

describe("Search All Saves", () => {
  beforeEach(() => {
    resetFilters();
  });

  it("widens a folder search in place", async () => {
    setSearchDraft("poster");
    const router = await openLibraryAt("/folders/design");

    handleNativeMenuAction("find.search-all");

    expect(getViewState()).toMatchObject({
      q: "poster",
      searchAllView: searchViewKey({ kind: "folder", id: "design" }),
    });
    expect(currentLocation(router).pathname).toBe("/folders/design");

    handleNativeMenuAction("find.search");
    expect(getViewState().searchAllView).toBeNull();
  });

  it("leaves Trash for the Library instead of mixing deleted Saves in", async () => {
    setSearchDraft("poster");
    const router = await openLibraryAt("/trash");

    handleNativeMenuAction("find.search-all");

    expect(getViewState().searchAllView).toBeNull();
    expect(currentLocation(router).pathname).toBe("/");
    expect(currentLocation(router).search).toMatchObject({ q: "poster" });
  });
});
