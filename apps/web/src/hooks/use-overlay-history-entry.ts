import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

export type OverlayHistoryKey = "cardDetail" | "missingCardDetail" | "paletteCardDetail";

interface OverlayHistoryEntryOptions {
  active: boolean;
  stateKey: OverlayHistoryKey;
  onPop: () => void;
}

/**
 * Pushes a history entry while an overlay is open, so the browser and Android
 * back buttons close it. Must go through the router: a bare `history.pushState`
 * triggers scroll restoration to the top; `resetScroll: false` suppresses it.
 */
export function useOverlayHistoryEntry({
  active,
  stateKey,
  onPop,
}: OverlayHistoryEntryOptions): void {
  const router = useRouter();

  // Must not re-run the effect on a fresh onPop closure: a second push would need a second back press to undo.
  const onPopRef = useRef(onPop);
  useEffect(() => {
    onPopRef.current = onPop;
  }, [onPop]);

  useEffect(() => {
    if (!active) {
      return;
    }
    void router.navigate({
      href: router.latestLocation.href,
      state: (prev) => ({ ...prev, [stateKey]: true }),
      resetScroll: false,
    });
    const handlePop = () => onPopRef.current();
    globalThis.addEventListener("popstate", handlePop);
    return () => globalThis.removeEventListener("popstate", handlePop);
  }, [active, router, stateKey]);
}

/**
 * Closes an overlay by popping the entry {@link useOverlayHistoryEntry} pushed.
 * Falls back to the caller's own close when that entry is already gone.
 */
export function closeOverlayHistoryEntry(stateKey: OverlayHistoryKey, close: () => void): void {
  if (hasOverlayHistoryEntry(stateKey)) {
    history.back();
  } else {
    close();
  }
}

export function hasOverlayHistoryEntry(stateKey: OverlayHistoryKey): boolean {
  return Boolean((history.state as Record<string, unknown> | null)?.[stateKey]);
}
