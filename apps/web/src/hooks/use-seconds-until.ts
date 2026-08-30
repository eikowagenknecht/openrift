import { useEffect, useState } from "react";

function secondsUntil(deadline: number | null): number {
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/**
 * Whole seconds left until `deadline` (an epoch-millisecond stamp), ticking once
 * a second and clamped at zero. Reading the clock on every tick keeps the value
 * honest across a suspended tab, where the interval stops firing. A null
 * deadline means there is nothing to count towards and starts no timer.
 *
 * The count is held in state rather than derived in render, so the compiler
 * cannot cache it against the unchanged deadline and freeze the display; a new
 * deadline is picked up in render so the first second is never stale.
 *
 * @returns The remaining seconds.
 */
export function useSecondsUntil(deadline: number | null): number {
  const [counted, setCounted] = useState(() => ({ deadline, remaining: secondsUntil(deadline) }));

  if (counted.deadline !== deadline) {
    setCounted({ deadline, remaining: secondsUntil(deadline) });
  }

  useEffect(() => {
    if (deadline === null) {
      return;
    }
    const timer = globalThis.setInterval(
      () => setCounted({ deadline, remaining: secondsUntil(deadline) }),
      1000,
    );
    return () => globalThis.clearInterval(timer);
  }, [deadline]);

  return counted.deadline === deadline ? counted.remaining : secondsUntil(deadline);
}
