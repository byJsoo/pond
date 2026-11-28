import { openSaveId } from "@/features/saves/navigation";
import { currentRouteMeta } from "@/shared/lib/route-meta";
import type { RouteMeta } from "@/shared/lib/route-meta";

type GridSurfaceMeta = Pick<RouteMeta, "surface" | "nav">;

/** Inbox review and the Save overlay cover the grid, so their routes cannot own hidden presentation commands. */
export function gridSurfaceEligible(
  meta: GridSurfaceMeta | null,
  saveOpen: boolean,
): boolean {
  return meta?.surface === "grid" && meta.nav?.kind !== "inbox" && !saveOpen;
}

export function isGridSurfaceActive(): boolean {
  return gridSurfaceEligible(currentRouteMeta(), openSaveId() !== null);
}

export function runWhenGridSurfaceActive(run: () => void): void {
  if (!isGridSurfaceActive()) return;
  run();
}
