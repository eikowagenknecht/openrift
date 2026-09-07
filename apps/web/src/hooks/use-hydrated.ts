import { useSyncExternalStore } from "react";

// oxlint-disable-next-line eslint/no-empty-function -- intentional no-op unsubscribe for useSyncExternalStore
const emptySubscribe = () => () => {};

/** Returns true once the client has hydrated; always false during SSR. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
