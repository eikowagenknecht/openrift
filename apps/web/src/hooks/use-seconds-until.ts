import { useEffect, useState } from "react";

function secondsUntil(deadline: number | null): number {
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/**
 * Held in state, not derived in render: the React compiler would otherwise cache
 * it against an unchanged deadline and freeze the display across a suspended tab.
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
