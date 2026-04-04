/**
 * Utilities for testing Zustand stores.
 *
 * Zustand stores are singletons. These helpers ensure each test starts with
 * a clean slate by resetting stores to their initial state.
 */
import type { StoreApi } from "zustand";

/**
 * Captures the initial state of a store and returns a cleanup function
 * that restores it. Call in beforeEach/afterEach.
 *
 * @returns A function that resets the store to its initial state.
 */
export function createStoreResetter<T>(store: StoreApi<T>): () => void {
  const initialState = store.getState();
  return () => {
    store.setState(initialState, true);
  };
}
