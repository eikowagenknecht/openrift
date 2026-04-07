import { useSyncExternalStore } from "react";

// oxlint-disable-next-line eslint/no-empty-function -- intentional no-op unsubscribe for useSyncExternalStore
const emptySubscribe = () => () => {};

/**
 * Returns true once the client has hydrated (after the first render).
 * During SSR, always returns false. Safe for conditional rendering of
 * browser-only content (virtualizers, canvas, etc.) without hydration mismatch.
 *
 * @returns Whether the component has hydrated on the client.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
