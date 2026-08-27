import { useEffect, useEffectEvent, useLayoutEffect } from "react";

/** Teardown for the previous scope, in the shape `useEffect` returns. */
type ScopeCleanup = (() => void) | void;

/**
 * Runs `onScope` for the first value of `scope` and again each time it
 * changes, for imperative work that has to happen outside render — resetting
 * a Zustand store, re-measuring the DOM, tearing down view state that belonged
 * to the previous scope. Returning a function tears that work down, exactly as
 * an effect's cleanup does. React state must not be set from `onScope`; derive
 * or adjust that during render instead.
 *
 * The scope is handed to the callback rather than sitting in the dependency
 * array as a bare re-run trigger, so "re-run when this changes" is expressed
 * as a real read of the value.
 */
export function useScopeEffect<T>(scope: T, onScope: (scope: T) => ScopeCleanup) {
  const run = useEffectEvent(onScope);
  useEffect(() => run(scope), [scope]);
}

/**
 * {@link useScopeEffect} on the layout timing, for work whose result the very
 * next paint depends on — a measurement the layout below is positioned from.
 */
export function useScopeLayoutEffect<T>(scope: T, onScope: (scope: T) => ScopeCleanup) {
  const run = useEffectEvent(onScope);
  useLayoutEffect(() => run(scope), [scope]);
}
