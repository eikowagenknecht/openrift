import { useEffect } from "react";

import { isTypingTarget } from "@/lib/keyboard-target";
import { useCommandPaletteStore } from "@/stores/command-palette-store";

interface RegisterQuickAddOptions {
  /**
   * Identifies the registration, so a route replacing another does not lose its
   * entry to the outgoing route's cleanup. Null offers nothing, which is the
   * signed-out catalog with no Inbox to add to.
   */
  key: string | null;
  /** The add row and its scope chip, e.g. "Add to My Binder". */
  label: string;
  /** The move row's label, where the surface can relocate owned copies. */
  moveLabel?: string | null;
  /**
   * Whether Ctrl+K opens this quick-add instead of the global palette. Defaults
   * to true; the catalog passes false because the page is already a card
   * search.
   */
  claimsShortcut?: boolean;
}

/**
 * Offers this route's quick-add to the command palette: it becomes a row (or
 * two, with a move label) in the palette's Actions group, and Ctrl+K opens it
 * where the route claims the chord.
 *
 * The body stays mounted at the call site, reading `quickAddOpen` and
 * `quickAddVerb` from the store.
 */
export function useRegisterQuickAdd({
  key,
  label,
  moveLabel = null,
  claimsShortcut = true,
}: RegisterQuickAddOptions): void {
  const register = useCommandPaletteStore((state) => state.registerQuickAdd);
  const unregister = useCommandPaletteStore((state) => state.unregisterQuickAdd);
  useEffect(() => {
    if (key === null) {
      return;
    }
    register({ key, label, moveLabel, claimsShortcut });
    return () => unregister(key);
  }, [key, label, moveLabel, claimsShortcut, register, unregister]);
}

/**
 * The app-wide palette shortcuts, mounted once by the shell.
 *
 * Ctrl/Cmd+K is the palette everywhere, resolving to the route's quick-add
 * where one is registered. `/` is the same opener for people who never learned
 * the chord, so it stands down inside a field the user is typing into and
 * whenever a modifier is held (Ctrl+/ and Cmd+/ belong to the browser).
 */
export function useCommandPaletteShortcuts(): void {
  const toggleShortcut = useCommandPaletteStore((state) => state.toggleShortcut);
  const openPalette = useCommandPaletteStore((state) => state.openPalette);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k" && !event.repeat) {
        event.preventDefault();
        toggleShortcut();
        return;
      }
      const plainSlash =
        event.key === "/" &&
        !event.repeat &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(event.target);
      if (plainSlash) {
        event.preventDefault();
        openPalette();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openPalette, toggleShortcut]);
}
