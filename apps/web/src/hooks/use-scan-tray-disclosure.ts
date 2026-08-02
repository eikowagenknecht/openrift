import { useState } from "react";

/**
 * Which tray row has its actions out, and how it got that way.
 *
 * `live` follows the newest row, so the card the user is still holding always
 * has its corrections within reach. `pinned` is a row the user opened
 * themselves, which a later scan must not steal. `closed` is the user
 * collapsing the open row.
 */
type Selection = { kind: "live" } | { kind: "pinned"; id: string } | { kind: "closed" };

export interface ScanTrayDisclosure {
  /** The row showing its action row, or null when every row is collapsed. */
  openId: string | null;
  /** Open a row, or collapse it when it is already the open one. */
  toggle: (id: string) => void;
}

/**
 * One-row-at-a-time disclosure for the scan session tray.
 *
 * The tray is a live log next to a running camera, so the open row moves on
 * its own: by default it is whichever row is newest, which is the card in the
 * user's hand. Opening an older row pins it, because a scan landing while the
 * user reaches for a button must not swap out what that button acts on.
 *
 * @param rowIds The tray's row ids, newest first.
 * @returns The open row and the toggle for it.
 */
export function useScanTrayDisclosure(rowIds: readonly string[]): ScanTrayDisclosure {
  const [selection, setSelection] = useState<Selection>({ kind: "live" });
  const liveId = rowIds[0] ?? null;

  // A pinned row disappears when its last copy is removed. Fall back to
  // following the live row rather than leaving the tray with nothing open.
  // Scanning that printing again makes it the newest row, so a stale pin can
  // never reopen a row out of order.
  const pinnedId =
    selection.kind === "pinned" && rowIds.includes(selection.id) ? selection.id : null;
  const openId = selection.kind === "closed" ? null : (pinnedId ?? liveId);

  const toggle = (id: string) => {
    if (openId === id) {
      setSelection({ kind: "closed" });
      return;
    }
    // Reopening the newest row hands the tray back to the live behaviour, so
    // the next scan takes over instead of staying pinned to a stale card.
    setSelection(id === liveId ? { kind: "live" } : { kind: "pinned", id });
  };

  return { openId, toggle };
}
