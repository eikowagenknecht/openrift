import { useState } from "react";

// `pinned`/`closed` remember the scan count they were made on: a pin or close
// only outlives the current scan, not the next one.
type Selection =
  | { kind: "live" }
  | { kind: "pinned"; id: string; scans: number }
  | { kind: "closed"; scans: number };

export interface ScanTrayDisclosure {
  openId: string | null;
  toggle: (id: string) => void;
}

// A scan landing must not swap what a pinned/closed row's button acts on
// until that selection's scan count is passed; then it reverts to the newest row.
export function useScanTrayDisclosure(rowIds: readonly string[], scans = 0): ScanTrayDisclosure {
  const [selection, setSelection] = useState<Selection>({ kind: "live" });
  const liveId = rowIds[0] ?? null;

  const current: Selection =
    selection.kind === "live" || selection.scans === scans ? selection : { kind: "live" };

  const pinnedId = current.kind === "pinned" && rowIds.includes(current.id) ? current.id : null;
  const openId = current.kind === "closed" ? null : (pinnedId ?? liveId);

  const toggle = (id: string) => {
    if (openId === id) {
      setSelection({ kind: "closed", scans });
      return;
    }
    setSelection(id === liveId ? { kind: "live" } : { kind: "pinned", id, scans });
  };

  return { openId, toggle };
}
