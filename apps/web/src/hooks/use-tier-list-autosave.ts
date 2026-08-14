import type { TierRow } from "@openrift/shared";
import { useDebouncer } from "@tanstack/react-pacer";
import { useEffect } from "react";

import { useUpdateTierList } from "@/hooks/use-tier-lists";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

/**
 * How long the board has to sit still before it is sent. Long enough that a
 * run of drags is one save, short enough that a creator who stops to talk has
 * the board on the server before they say the next sentence.
 */
export const AUTOSAVE_WAIT_MS = 1200;

export interface TierListAutosave {
  /** True while the board is ahead of the server: a save is queued or in flight. */
  saving: boolean;
  /** Sends whatever is queued right now, for the way out of the stage. */
  flush: () => void;
}

/**
 * Saves the tier-list builder's draft on its own, for surfaces with no Save
 * button. Ranking live on stage is one: the creator is on camera with both
 * hands on the board, and a ranking lost to a closed tab is a re-record.
 *
 * The rows are captured when the save is *queued*, not when it fires. That is
 * what makes the flush on the way out safe — the stage drops the draft as it
 * unmounts, and a saver that read the store at fire time would send the empty
 * board that the reset left behind.
 *
 * `markSaved` keeps the same snapshot semantics the builder's Save button uses:
 * it clears `dirty` only if the board is still the array that went to the
 * server, so a drag that lands mid-save stays unsaved and gets its own pass.
 *
 * @param tierListId The list being edited; a draft belonging to another list is ignored.
 * @returns The save indicator's state, and a manual flush.
 */
export function useTierListAutosave(tierListId: string): TierListAutosave {
  const updateTierList = useUpdateTierList();
  // Subscribed rather than read imperatively: this is what drives the "Saving…"
  // indicator. It flips once per save cycle, not once per drag, so the caller
  // re-renders about as often as the server is written to.
  const dirty = useTierListBuilderStore((state) => state.dirty);

  const saver = useDebouncer(
    (rows: TierRow[]) => {
      updateTierList.mutate(
        { id: tierListId, tiers: rows },
        {
          onSuccess: () => {
            useTierListBuilderStore.getState().markSaved(rows);
          },
          // No toast here: the QueryClient's default mutation onError owns the
          // error message for every mutation.
        },
      );
    },
    {
      wait: AUTOSAVE_WAIT_MS,
      // Leaving the stage must not drop the last few seconds of ranking, so a
      // queued save goes out on the way past rather than being cancelled.
      onUnmount: (debouncer) => debouncer.flush(),
    },
  );

  useEffect(() => {
    const unsubscribe = useTierListBuilderStore.subscribe((state) => {
      // `dirty` is what separates an edit from the load that seeded the draft,
      // and the id guard keeps a draft that has already moved on to another
      // list from being written back over this one.
      if (state.dirty && state.listId === tierListId) {
        saver.maybeExecute(state.rows);
      }
    });
    return unsubscribe;
  }, [saver, tierListId]);

  return { saving: dirty || updateTierList.isPending, flush: saver.flush };
}
