import type { Printing } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { useSelectionStore } from "@/stores/selection-store";

interface Options {
  linkedPrintingId: string | undefined;
  printingsById: Record<string, Printing>;
  items: CardViewerItem[];
}

/**
 * When the URL carries `?printingId=X`, select that printing and strip the
 * param from the URL. Runs at most once per mount.
 *
 * `resetScroll: false` is critical: TanStack Router's scroll-restoration
 * handler fires `window.scrollTo(0, 0)` for fresh location keys, which would
 * wipe out the CardGrid's scroll-to-selected-card behavior.
 *
 * @returns Nothing.
 */
export function useCardDeepLink({ linkedPrintingId, printingsById, items }: Options) {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (!linkedPrintingId || handled.current) {
      return;
    }
    const printing = printingsById[linkedPrintingId];
    if (!printing) {
      return;
    }
    handled.current = true;
    useSelectionStore.getState().selectCard(printing, items, "printing");
    void navigate({
      to: ".",
      search: ({ printingId: _, ...rest }) => rest,
      replace: true,
      resetScroll: false,
    });
  }, [linkedPrintingId, printingsById, items, navigate]);
}
