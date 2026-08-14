import { useEffect, useState } from "react";

/** Events that count as the user still being at the keyboard. */
const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Tracks whether the user has gone quiet for `delayMs`.
 *
 * Presentation mode uses this to fade its own chrome out of the capture: the
 * position marker and exit button are needed while setting a shot up and are
 * noise once recording starts. Starts non-idle so the controls are visible the
 * moment the page opens.
 *
 * @returns True once no activity has been seen for the delay.
 */
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
