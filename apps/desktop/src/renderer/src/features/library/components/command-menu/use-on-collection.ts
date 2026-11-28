import { useRouter } from "@tanstack/react-router";
import { gridSurfaceEligible } from "@/features/library/lib/grid-surface";
import { useOpenSaveId } from "@/features/saves/navigation";
import { routeMeta } from "@/shared/lib/route-meta";

/** True where collection actions have a visible grid to own them. */
export function useOnCollection(pathname: string): boolean {
  const router = useRouter();
  const saveOpen = useOpenSaveId() !== null;
  return gridSurfaceEligible(routeMeta(router, pathname), saveOpen);
}
