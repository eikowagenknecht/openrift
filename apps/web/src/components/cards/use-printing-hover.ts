import { useEffect, useRef, useState } from "react";

/**
 * State for a hover-triggered printing preview. Clearing is debounced so the
 * preview doesn't flash off-and-on when the pointer moves between adjacent
 * items (pointerleave → pointerenter in the same gesture).
 * @returns `{ hoveredId, onEnter, onLeave, reset }` — feed `onEnter`/`onLeave`
 * to each item's pointer events, and call `reset` when the host popup closes.
 */
export function usePrintingHover(clearDelayMs = 80) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClear = () => {
    if (clearTimerRef.current !== null) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  useEffect(() => cancelClear, []);

  const onEnter = (id: string) => {
    cancelClear();
    setHoveredId(id);
  };

  const onLeave = () => {
    cancelClear();
    clearTimerRef.current = setTimeout(() => {
      setHoveredId(null);
      clearTimerRef.current = null;
    }, clearDelayMs);
  };

  const reset = () => {
    cancelClear();
    setHoveredId(null);
  };

  return { hoveredId, onEnter, onLeave, reset };
}
