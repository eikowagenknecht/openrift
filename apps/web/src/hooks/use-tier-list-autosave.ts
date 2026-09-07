import type { TierRow } from "@openrift/shared/types/api/tier-list";
import { useDebouncer } from "@tanstack/react-pacer";
import { useEffect } from "react";

import { useUpdateTierList } from "@/hooks/use-tier-lists";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

export const AUTOSAVE_WAIT_MS = 1200;

export interface TierListAutosave {
  saving: boolean;
  flush: () => void;
}

/**
 * Rows are captured when the save is queued, not when it fires, so a flush on
 * unmount can't send the empty board a stage reset left behind.
 */
export function useTierListAutosave(tierListId: string): TierListAutosave {
  const updateTierList = useUpdateTierList();
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
      // Must flush the queued save on unmount; cancelling would drop the last few seconds of ranking.
      onUnmount: (debouncer) => debouncer.flush(),
    },
  );

  useEffect(() => {
    const unsubscribe = useTierListBuilderStore.subscribe((state) => {
      // `dirty` separates an edit from the seeding load; the id guard blocks
      // writing back over a draft that has moved to another list.
      if (state.dirty && state.listId === tierListId) {
        saver.maybeExecute(state.rows);
      }
    });
    return unsubscribe;
  }, [saver, tierListId]);

  return { saving: dirty || updateTierList.isPending, flush: saver.flush };
}
