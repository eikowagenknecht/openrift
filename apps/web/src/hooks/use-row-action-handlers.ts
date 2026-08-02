import { useEffect } from "react";

import type { CardRowSurface, HandlersBySurface } from "@/stores/card-row-actions-store";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";

/**
 * Registers this surface's row-action handlers so virtualized cells can
 * dispatch them via `getState()` instead of taking them as props (see
 * card-row-actions-store for why that indirection exists).
 *
 * Deliberately re-registers on every render with no dependency array: the
 * handlers close over per-render state (the item list, mutation results,
 * pending flags), and cells must dispatch the freshest implementation. That is
 * cheap because nothing subscribes to the slot.
 *
 * Unregistering is owner-checked. React mounts the next surface before running
 * the previous one's cleanup, so an unconditional clear on unmount would wipe a
 * registration that had already been replaced.
 * @param surface Which card-browser surface is registering.
 * @param handlers The handlers that surface offers.
 * @returns Nothing.
 */
export function useRowActionHandlers<TSurface extends CardRowSurface>(
  surface: TSurface,
  handlers: HandlersBySurface[TSurface],
): void {
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-register every render
  useEffect(() => {
    useCardRowActionsStore.getState().setHandlers(surface, handlers);
    return () => {
      useCardRowActionsStore.getState().clearHandlers(surface);
    };
  });
}
