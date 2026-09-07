import type { OverlayBoard } from "@openrift/shared";

interface OverlayBoardIntent {
  board: Omit<OverlayBoard, "revealCount"> | null;
  revealCount: number;
}

export interface OverlayBoardSyncDeps {
  pushBoard: (board: OverlayBoard) => Promise<unknown>;
  setReveal: (revealCount: number) => Promise<unknown>;
}

export interface OverlayBoardSync {
  send: (intent: OverlayBoardIntent) => void;
  cancel: () => void;
}

/**
 * Sends one call at a time. A later intent replaces the queued one, except a
 * reveal step queued behind a board push folds into that push.
 */
export function createOverlayBoardSync(deps: OverlayBoardSyncDeps): OverlayBoardSync {
  let inFlight = false;
  let next: OverlayBoardIntent | null = null;

  const drain = async () => {
    inFlight = true;
    while (next !== null) {
      const intent = next;
      next = null;
      try {
        await (intent.board === null
          ? deps.setReveal(intent.revealCount)
          : deps.pushBoard({ ...intent.board, revealCount: intent.revealCount }));
      } catch {
        // Swallowed: the QueryClient's default mutation handler reports it.
      }
    }
    inFlight = false;
  };

  return {
    send(intent) {
      const waiting = next;
      next =
        waiting !== null && waiting.board !== null && intent.board === null
          ? { board: waiting.board, revealCount: intent.revealCount }
          : intent;
      if (!inFlight) {
        void drain();
      }
    },
    cancel() {
      next = null;
    },
  };
}
