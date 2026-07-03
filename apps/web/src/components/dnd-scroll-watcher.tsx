import { useDndContext } from "@dnd-kit/core";
import { useEffect } from "react";

/**
 * Forces dnd-kit to re-measure all droppable rects on any scroll event during
 * drag. This is needed on surfaces with a `position: sticky` sidebar: dnd-kit's
 * `Rect` class assumes all elements move with scroll (applying scroll deltas to
 * the initial getBoundingClientRect). Sticky elements don't move, so the rects
 * drift and the drop target ends up offset from the cursor. Re-measuring
 * creates fresh Rect objects with correct values.
 * @returns Nothing (invisible helper component).
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

    // Capture phase catches scroll on any element (sidebar, page, etc.)
    globalThis.addEventListener("scroll", handleScroll, true);
    return () => {
      globalThis.removeEventListener("scroll", handleScroll, true);
      cancelAnimationFrame(rafId);
    };
  }, [active, measureDroppableContainers]);

  return null;
}
