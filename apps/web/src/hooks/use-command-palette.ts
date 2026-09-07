import { useEffect } from "react";

import { isTypingTarget } from "@/lib/keyboard-target";
import { useCommandPaletteStore } from "@/stores/command-palette-store";

interface RegisterQuickAddOptions {
  key: string | null;
  label: string;
  moveLabel?: string | null;
  claimsShortcut?: boolean;
}

/** `key: null` skips registration entirely; used for the signed-out catalog. */
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

/** `/` stands down inside a typing target and when any modifier is held (Ctrl+/, Cmd+/ are browser shortcuts). */
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
