import type { OverlayBoardDirection, TierRow } from "@openrift/shared";
import { useEffect, useRef } from "react";

import {
  useClearOverlay,
  usePushOverlayBoard,
  useSetOverlayBoardReveal,
} from "@/hooks/use-overlay";
import type { OverlayBoardSync } from "@/lib/overlay-board-sync";
import { createOverlayBoardSync } from "@/lib/overlay-board-sync";

/** The board as it was last put on stream, so the next change knows what kind it is. */
interface SentBoard {
  title: string;
  tiers: readonly TierRow[];
  direction: OverlayBoardDirection;
}

/**
 * Mirrors the board on the stage onto the signed-in creator's OBS overlay.
 *
 * The overlay is a second screen showing the same ranking, so everything here
 * is a consequence of the stage rather than a control of its own: switching the
 * sync on puts the board up as it stands, stepping the run steps the reveal,
 * and changing the board itself (a flipped direction, a ranking edited between
 * takes) pushes it again. `tiers` are the saved rows, not the resolved ones —
 * the overlay resolves them against its own catalogue.
 *
 * `paused` freezes the mirror without taking it down, which is what ranking
 * live on the stage needs: the audience keeps seeing the board as it was while
 * the creator drags cards around, and the finished ranking goes out in one push
 * when they switch back to the show.
 *
 * Switching the sync off clears the overlay. Leaving the stage does not — a
 * ranking segment often outlives the browser tab it was run from, and the OBS
 * tab's Clear button is there for when it doesn't.
 */
export function useOverlayBoardSync({
  enabled,
  paused,
  title,
  tiers,
  direction,
  revealCount,
}: {
  /** The creator's switch. */
  enabled: boolean;
  /** Holds the mirror where it is, without clearing it. */
  paused: boolean;
  title: string;
  /** The saved rows, exactly as the list stores them. */
  tiers: readonly TierRow[];
  direction: OverlayBoardDirection;
  revealCount: number;
}) {
  const pushBoard = usePushOverlayBoard();
  const setReveal = useSetOverlayBoardReveal();
  const clearOverlay = useClearOverlay();

  const pushAsync = pushBoard.mutateAsync;
  const revealAsync = setReveal.mutateAsync;
  const clear = clearOverlay.mutate;

  // The sender is built once and reaches the mutations through this box, so it
  // never has to be rebuilt to catch up with a fresh mutate function. Built
  // lazily inside the effect rather than in a useState initializer: a render-
  // scope closure over `calls.current` is a ref read during render as far as
  // the compiler can tell, and the whole file would ship unoptimized.
  const calls = useRef({ pushAsync, revealAsync });
  useEffect(() => {
    calls.current = { pushAsync, revealAsync };
  }, [pushAsync, revealAsync]);

  const syncRef = useRef<OverlayBoardSync | null>(null);
  const sent = useRef<SentBoard | null>(null);
  const wasEnabled = useRef(false);

  const active = enabled && !paused;

  useEffect(() => {
    if (!active) {
      // Nothing is sent while the mirror is frozen or off, and the record of
      // what is on stream is dropped — coming back is a fresh push, because the
      // board may well have changed in between.
      sent.current = null;
      return;
    }
    // A plain `if` rather than `??=`: the compiler cannot lower that operator
    // and would ship the file unoptimized.
    if (syncRef.current === null) {
      syncRef.current = createOverlayBoardSync({
        pushBoard: (board) => calls.current.pushAsync({ board }),
        setReveal: (count) => calls.current.revealAsync({ revealCount: count }),
      });
    }
    const sync = syncRef.current;
    const last = sent.current;
    if (
      last !== null &&
      last.title === title &&
      last.tiers === tiers &&
      last.direction === direction
    ) {
      // Only the run moved, so the board on stream stands and just steps.
      sync.send({ board: null, revealCount });
      return;
    }
    sent.current = { title, tiers, direction };
    sync.send({ board: { title, tiers: [...tiers], direction }, revealCount });
  }, [active, direction, revealCount, tiers, title]);

  useEffect(() => {
    if (enabled) {
      wasEnabled.current = true;
      return;
    }
    if (!wasEnabled.current) {
      return;
    }
    wasEnabled.current = false;
    // A step still waiting would move a board that is coming down anyway. The
    // sender may never have been built if the mirror spent its whole run paused.
    syncRef.current?.cancel();
    clear();
  }, [clear, enabled]);
}
