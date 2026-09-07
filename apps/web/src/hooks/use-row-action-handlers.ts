import { useEffect } from "react";

import type { CardRowSurface, HandlersBySurface } from "@/stores/card-row-actions-store";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";

/**
 * Re-registers every render (no dependency array) so cells dispatch the
 * freshest closure. Unregister is owner-checked since React mounts the next surface first.
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
