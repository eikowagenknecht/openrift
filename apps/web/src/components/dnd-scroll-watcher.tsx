import { useDndContext } from "@dnd-kit/core";
import { useEffect } from "react";

/**
 * dnd-kit's `Rect` applies scroll deltas to the initial getBoundingClientRect, assuming everything
 * moves with scroll. A `position: sticky` sidebar doesn't, so its rects drift; re-measure on scroll.
 */
export function DndScrollWatcher() {
  const { active, measureDroppableContainers } = useDndContext();

  useEffect(() => {
    if (!active) {
      return;
    }

    let rafId = 0;
    const handleScroll = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          measureDroppableContainers([]);
          rafId = 0;
        });
      }
    };

    globalThis.addEventListener("scroll", handleScroll, true);
    return () => {
      globalThis.removeEventListener("scroll", handleScroll, true);
      cancelAnimationFrame(rafId);
    };
  }, [active, measureDroppableContainers]);

  return null;
}
