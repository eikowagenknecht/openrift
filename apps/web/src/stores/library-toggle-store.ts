import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { create } from "zustand";

/** The collection grid and the list page each remember their "show whole library" toggle separately. */
export type LibraryToggleScope = "collection" | "list";

// An empty collection flips the toggle on during render (see the auto-library
// one-shot in CollectionGrid), and writing to an external store from render
// isn't safe, so each surface keeps live state locally and mirrors it here to
// survive the remount when switching collections or lists. Not persisted:
// a fresh page load starts in the entries-only view.
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

// `scope` is expected to be constant for a given call site: the seed is read once on mount.
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
