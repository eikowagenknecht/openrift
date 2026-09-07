import type { OverlayBoardDirection } from "@openrift/shared/contracts/overlay";
import type { TierRow } from "@openrift/shared/types/api/tier-list";
import { useEffect, useRef } from "react";

import {
  useClearOverlay,
  usePushOverlayBoard,
  useSetOverlayBoardReveal,
} from "@/features/stage/hooks/use-overlay";
import type { OverlayBoardSync } from "@/features/stage/lib/overlay-board-sync";
import { createOverlayBoardSync } from "@/features/stage/lib/overlay-board-sync";

interface SentBoard {
  title: string;
  tiers: readonly TierRow[];
  direction: OverlayBoardDirection;
}

/**
 * Mirrors the stage board onto the signed-in creator's OBS overlay. Switching
 * the sync off clears the overlay; leaving the stage does not.
 */
export function useOverlayBoardSync({
  enabled,
  paused,
  title,
  tiers,
  direction,
  revealCount,
}: {
  enabled: boolean;
  paused: boolean;
  title: string;
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

  // Built lazily in the effect, not a useState initializer: a render-scope
  // ref read trips the React Compiler's bailout and ships the file unoptimized.
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
      // Dropping the record means coming back is always a fresh push.
      sent.current = null;
      return;
    }
    // React Compiler cannot lower `??=` and would ship this file unoptimized.
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
    // Cancels a step still in flight; the sender may never have been built
    // if the mirror spent its whole run paused.
    syncRef.current?.cancel();
    clear();
  }, [clear, enabled]);
}
