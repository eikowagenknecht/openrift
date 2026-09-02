import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/** Flag an overlay writes into the history state to recognize its own entry. */
export type OverlayHistoryKey = "cardDetail" | "missingCardDetail" | "paletteCardDetail";

interface OverlayHistoryEntryOptions {
  /** Push the entry while true, and drop the popstate listener when it clears. */
  active: boolean;
  /** Which flag this overlay owns. Two overlays sharing one page need two keys. */
  stateKey: OverlayHistoryKey;
  /** Runs when the entry is popped, by the back button or by closeOverlayHistoryEntry. */
  onPop: () => void;
}

/**
 * Pushes a history entry while an overlay is open, so the browser and Android
 * back buttons close it instead of leaving the page.
 *
 * The entry goes through the router rather than a bare `history.pushState`.
 * `@tanstack/history` patches `pushState`, so a raw call arrives at the router
 * as a genuine PUSH navigation. With `scrollRestoration` on (see router.ts) the
 * router then finds no cached scroll offset under the pushed entry's key and
 * scrolls the window to the top, and the matching `history.back()` puts it back
 * on close. Opening a card detail halfway down a page visibly jumped to the top
 * and back again. `resetScroll: false` is what stops it.
 * @returns Nothing.
 */
export function useOverlayHistoryEntry({
  active,
  stateKey,
  onPop,
}: OverlayHistoryEntryOptions): void {
  const router = useRouter();

  // The callback is read through a ref so a caller's fresh closure never
  // re-runs the effect: a second entry would need a second back press to undo.
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
 * Closes an overlay by popping the entry {@link useOverlayHistoryEntry} pushed,
 * so the extra entry never outlives the overlay it belongs to. Falls back to
 * the caller's own close when that entry is gone, which is the case when the
 * user already went back, or when the push has not flushed yet.
 * @returns Nothing.
 */
export function closeOverlayHistoryEntry(stateKey: OverlayHistoryKey, close: () => void): void {
  if (hasOverlayHistoryEntry(stateKey)) {
    history.back();
  } else {
    close();
  }
}

/**
 * Whether the top history entry is the one this overlay pushed.
 * @returns True when popping the entry is the right way to close.
 */
export function hasOverlayHistoryEntry(stateKey: OverlayHistoryKey): boolean {
  return Boolean((history.state as Record<string, unknown> | null)?.[stateKey]);
}
