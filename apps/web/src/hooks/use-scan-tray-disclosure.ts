import { useState } from "react";

/**
 * Which tray row has its actions out, and how it got that way.
 *
 * `live` follows the newest row, so the card the user is still holding always
 * has its corrections within reach. `pinned` is a row the user opened
 * themselves. `closed` is the user collapsing the open row. Both of those
 * remember the scan they were made on, because neither outlives the next one.
 */
type Selection =
  | { kind: "live" }
  | { kind: "pinned"; id: string; scans: number }
  | { kind: "closed"; scans: number };

export interface ScanTrayDisclosure {
  /** The row showing its action row, or null when every row is collapsed. */
  openId: string | null;
  /** Open a row, or collapse it when it is already the open one. */
  toggle: (id: string) => void;
}

/**
 * One-row-at-a-time disclosure for the scan session tray.
 *
 * The tray is a live log next to a running camera, so the open row moves on its
 * own: by default it is whichever row is newest, which is the card in the
 * user's hand. Opening an older row pins it, so a scan landing while the user
 * reaches for a button cannot swap out what that button acts on — but only
 * until that scan is done. Once a card has actually been added the tray hands
 * itself back to the newest row: the user has moved on to the next card, and
 * finding the controls still parked on an old one is the sort of thing that
 * gets a copy added to the wrong printing.
 *
 * @param rowIds The tray's row ids, newest first.
 * @param scans How many cards the session has added; any change is a new scan.
 * @returns The open row and the toggle for it.
 */
export function useScanTrayDisclosure(rowIds: readonly string[], scans = 0): ScanTrayDisclosure {
  const [selection, setSelection] = useState<Selection>({ kind: "live" });
  const liveId = rowIds[0] ?? null;

  const current: Selection =
    selection.kind === "live" || selection.scans === scans ? selection : { kind: "live" };

  // A pinned row disappears when its last copy is removed. Fall back to
  // following the live row rather than leaving the tray with nothing open.
  const pinnedId = current.kind === "pinned" && rowIds.includes(current.id) ? current.id : null;
  const openId = current.kind === "closed" ? null : (pinnedId ?? liveId);

  const toggle = (id: string) => {
    if (openId === id) {
      setSelection({ kind: "closed", scans });
      return;
    }
    // Reopening the newest row hands the tray back to the live behaviour, so
    // the next scan takes over instead of staying pinned to a stale card.
    setSelection(id === liveId ? { kind: "live" } : { kind: "pinned", id, scans });
  };

  return { openId, toggle };
}
