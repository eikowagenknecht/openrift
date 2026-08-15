import type { OverlayBoard } from "@openrift/shared";

/** What the stage wants the OBS overlay's board to be right now. */
export interface OverlayBoardIntent {
  /**
   * The whole board, when it has to go out again — the first push, a changed
   * ranking, a flipped direction. Null steps the reveal of the board already up,
   * which is all a step of the run needs to send.
   */
  board: Omit<OverlayBoard, "revealCount"> | null;
  /** How many of its cards should be placed. */
  revealCount: number;
}

/** The two calls the sync makes, kept as plain promises so it can be tested without React. */
export interface OverlayBoardSyncDeps {
  pushBoard: (board: OverlayBoard) => Promise<unknown>;
  setReveal: (revealCount: number) => Promise<unknown>;
}

export interface OverlayBoardSync {
  /** Sends now, or holds the intent until the call in flight settles. */
  send: (intent: OverlayBoardIntent) => void;
  /** Drops whatever is waiting, e.g. because the board is coming down anyway. */
  cancel: () => void;
}

/**
 * Keeps the OBS overlay's board in step with the stage, one call at a time.
 *
 * A creator holding the next key walks the run faster than the round trips
 * come back, so every intermediate position is dropped and only the latest one
 * goes out once the wire is free — the audience sees the board catch up rather
 * than replay every step, and the position the run actually stopped on is never
 * the one that got dropped.
 *
 * A step waiting behind a board push folds into that push instead of replacing
 * it, so a re-push is never lost to the arrow press that followed it.
 *
 * Failures are swallowed here: the QueryClient's default mutation handler owns
 * the message, and one refused call must not stop the steps after it.
 *
 * @returns The sender.
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
        // Reported by the global mutation error toast.
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
