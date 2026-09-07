import type { Printing } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import type { CardViewerItem } from "@/lib/card-viewer-types";
import { useSelectionStore } from "@/stores/selection-store";

interface Options {
  linkedPrintingId: string | undefined;
  printingsById: Record<string, Printing>;
  items: CardViewerItem[];
}

/**
 * `resetScroll: false`: TanStack Router's scroll-restoration otherwise fires
 * `window.scrollTo(0, 0)` and wipes out CardGrid's scroll-to-selected-card.
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
      search: ({ printingId: _printingId, ...rest }) => rest,
      replace: true,
      resetScroll: false,
    });
  }, [linkedPrintingId, printingsById, items, navigate]);
}
