import { useEffect, useEffectEvent, useLayoutEffect } from "react";

type ScopeCleanup = (() => void) | void;

// React state must not be set from `onScope`; derive or adjust that during
// render instead.
export function useScopeEffect<T>(scope: T, onScope: (scope: T) => ScopeCleanup) {
  const run = useEffectEvent(onScope);
  useEffect(() => run(scope), [scope]);
}

/** {@link useScopeEffect} on the layout timing. */
export function useScopeLayoutEffect<T>(scope: T, onScope: (scope: T) => ScopeCleanup) {
  const run = useEffectEvent(onScope);
  useLayoutEffect(() => run(scope), [scope]);
}
