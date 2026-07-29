import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { create } from "zustand";

/**
 * Which surface a library toggle belongs to. The collection grid and the
 * list page each have their own "show whole library" button, and they mean
 * different things (add to this collection vs add to this list), so they
 * remember their state separately.
 */
export type LibraryToggleScope = "collection" | "list";

/**
 * Session memory for the "show whole library" toggles.
 *
 * Each surface keeps the live value in local state because an empty
 * collection flips the toggle on during render (see the auto-library one-shot
 * in CollectionGrid), and writing to an external store from render is not
 * safe. This store is that value's memory across mounts: switching
 * collections or lists remounts the grid, and the toggle should survive that
 * instead of snapping back to the entries-only view every time.
 *
 * Deliberately not persisted — a fresh page load still starts in the
 * entries-only view.
 */
interface LibraryToggleState {
  showLibrary: Record<LibraryToggleScope, boolean>;
  setShowLibrary: (scope: LibraryToggleScope, showLibrary: boolean) => void;
  reset: () => void;
}

const INITIAL: Record<LibraryToggleScope, boolean> = { collection: false, list: false };

export const useLibraryToggleStore = create<LibraryToggleState>()((set) => ({
  showLibrary: INITIAL,
  setShowLibrary: (scope, showLibrary) =>
    set((state) => ({ showLibrary: { ...state.showLibrary, [scope]: showLibrary } })),
  reset: () => set({ showLibrary: INITIAL }),
}));

/**
 * Local `showLibrary` state seeded from the session store and mirrored back
 * into it after every change, so the toggle carries across collection / list
 * switches (which remount the grid when the route changes).
 *
 * `scope` is expected to be constant for a given call site — the seed is read
 * once on mount.
 * @returns The current value and a `useState`-style setter.
 */
export function useLibraryToggle(
  scope: LibraryToggleScope,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [showLibrary, setShowLibrary] = useState(
    () => useLibraryToggleStore.getState().showLibrary[scope],
  );
  useEffect(() => {
    useLibraryToggleStore.getState().setShowLibrary(scope, showLibrary);
  }, [scope, showLibrary]);
  return [showLibrary, setShowLibrary];
}
