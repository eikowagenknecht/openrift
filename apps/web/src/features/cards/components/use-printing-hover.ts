import { useEffect, useRef, useState } from "react";

/** Clearing is debounced so the preview doesn't flash when the pointer moves between adjacent items. */
export function usePrintingHover(clearDelayMs = 80) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClear = () => {
    if (clearTimerRef.current !== null) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      if (clearTimerRef.current !== null) {
        clearTimeout(clearTimerRef.current);
      }
    },
    [],
  );

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
