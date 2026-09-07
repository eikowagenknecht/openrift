/**
 * Zustand stores are singletons; these helpers reset a store to its initial
 * state so each test starts clean.
 */
import type { StoreApi } from "zustand";

export function createStoreResetter<T>(store: StoreApi<T>): () => void {
  const initialState = store.getState();
  return () => {
    store.setState(initialState, true);
  };
}
