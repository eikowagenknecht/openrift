import { useEffect, useState } from "react";

const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;

/** Tracks whether the user has gone quiet for `delayMs`. Starts non-idle. */
export function useIdle(delayMs: number): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer = globalThis.setTimeout(() => setIdle(true), delayMs);

    const markActive = () => {
      setIdle(false);
      globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(() => setIdle(true), delayMs);
    };

    for (const event of ACTIVITY_EVENTS) {
      globalThis.addEventListener(event, markActive, { passive: true });
    }
    return () => {
      globalThis.clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        globalThis.removeEventListener(event, markActive);
      }
    };
  }, [delayMs]);

  return idle;
}
