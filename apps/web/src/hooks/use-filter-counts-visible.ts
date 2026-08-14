import { useDeferredValue } from "react";

import { useSmUp } from "@/hooks/use-sm-up";
import { useFilterDrawerStore } from "@/stores/filter-drawer-store";

/**
 * Whether any surface that displays the faceted filter counts is visible:
 * from `sm` up the compact filter bar always shows them; below that they only
 * appear inside the mobile options drawer while it is open. Feed this to
 * `countsEnabled` on the card-data hooks so the counts pass is skipped when
 * nothing would display its output.
 *
 * The drawer-open flag is deferred: flipping counts on is itself a full
 * meta-recompute + chip re-render, and doing it in the same commit that opens
 * the drawer delays the slide-in by that much on a phone. Deferring lets the
 * drawer appear first; the count badges fill in a beat later (and instantly
 * when the memoized counts are still current).
 *
 * Not for surfaces that show the compact bar on phones too (collection stats
 * passes `flex` to keep it visible) — those must keep counts unconditionally.
 * @returns Whether the faceted filter counts are visible somewhere.
 */
export function useFilterCountsVisible(): boolean {
  const smUp = useSmUp();
  const drawerOpen = useFilterDrawerStore((state) => state.open);
  const drawerOpenDeferred = useDeferredValue(drawerOpen);
  return smUp || drawerOpenDeferred;
}
