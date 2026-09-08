import type { MetaEventPlayer } from "@openrift/shared/types/api/meta";
import { useEffect, useState } from "react";

import type { RowSlot } from "@/features/meta/lib/meta-event-standings";
import { useHydrated } from "@/hooks/use-hydrated";
import { useWindowVirtualizerFresh } from "@/lib/virtualizer-fresh";

export const ROWS_SHOWN = 16;
export const ROW_HEIGHT = 66;

// A row in the rendering the breakpoint hides measures zero, and those zeros
// would survive in the cache until the viewport crosses back over 768px.
export function measureRow(element: Element): number {
  return element.getBoundingClientRect().height || ROW_HEIGHT;
}

export interface RowWindow {
  containerRef: (node: HTMLElement | null) => void;
  height: number | undefined;
  rows: { player: MetaEventPlayer; slot: RowSlot }[];
}

/** Before hydration, a fixed opening slice matches the server HTML. */
export function useRowWindow(players: readonly MetaEventPlayer[]): RowWindow {
  const hydrated = useHydrated();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    if (container === null) {
      return;
    }
    const measure = () => {
      const next = Math.round(container.getBoundingClientRect().top + globalThis.scrollY);
      setScrollMargin((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [container]);

  const { virtualizer, virtualItems, totalSize } = useWindowVirtualizerFresh<HTMLElement>({
    count: players.length,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => players[index]?.id ?? index,
    measureElement: measureRow,
    scrollMargin,
    overscan: 6,
  });

  if (!hydrated) {
    return {
      containerRef: setContainer,
      height: undefined,
      rows: players.slice(0, ROWS_SHOWN).map((player) => ({ player, slot: {} })),
    };
  }

  return {
    containerRef: setContainer,
    height: totalSize,
    rows: virtualItems.flatMap((item) => {
      const player = players[item.index];
      if (player === undefined) {
        return [];
      }
      return [
        {
          player,
          slot: {
            "data-index": item.index,
            ref: virtualizer.measureElement,
            style: {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${item.start - scrollMargin}px)`,
            },
          },
        },
      ];
    }),
  };
}
