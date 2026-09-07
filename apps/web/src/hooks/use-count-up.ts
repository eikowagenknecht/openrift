import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 to the target value using an ease-out curve.
 * Restarts when `target` changes.
 */
export function useCountUp(target: number, durationMs = 1200): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  const [ramping, setRamping] = useState(target);
  if (ramping !== target) {
    setRamping(target);
    setValue(0);
  }

  useEffect(() => {
    if (target === 0) {
      return;
    }

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      // rAF reports the frame's own start, which can precede the call that
      // scheduled it; an unclamped negative progress renders negative counts.
      const progress = Math.min(Math.max(elapsed / durationMs, 0), 1);
      // ease-out cubic: decelerates toward the end
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}
