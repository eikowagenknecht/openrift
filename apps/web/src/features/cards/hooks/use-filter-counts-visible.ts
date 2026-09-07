import { useDeferredValue } from "react";

import { useFilterDrawerStore } from "@/features/cards/stores/filter-drawer-store";
import { useSmUp } from "@/hooks/use-sm-up";

/**
 * Surfaces that show the compact bar on phones must keep counts unconditionally instead.
 */
export function useFilterCountsVisible(): boolean {
  const smUp = useSmUp();
  const drawerOpen = useFilterDrawerStore((state) => state.open);
  const drawerOpenDeferred = useDeferredValue(drawerOpen);
  return smUp || drawerOpenDeferred;
}
