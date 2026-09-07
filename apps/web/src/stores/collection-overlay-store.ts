import type { Printing } from "@openrift/shared/types/catalog";
import { useEffect } from "react";
import { create } from "zustand";

import type { CopyDetailsTarget } from "@/lib/copy-details-target";
import type { WishEntryFlat } from "@/lib/wish-entry";

interface TakeConfirmTarget {
  printing: Printing;
  availableCopyIds: string[];
  initialQuantity: number;
}

interface TakeFollowUpTarget {
  printing: Printing;
  entries: WishEntryFlat[];
  takenQuantity: number;
}

/**
 * Slots stay separate: the take flow hands off from confirm to follow-up,
 * which a single slot would race.
 */
interface CollectionOverlayState {
  deleteOpen: boolean;
  clearInboxOpen: boolean;
  editOpen: boolean;
  shareOpen: boolean;
  copyDetailsTarget: CopyDetailsTarget | null;
  takeConfirm: TakeConfirmTarget | null;
  takeFollowUp: TakeFollowUpTarget | null;

  setDeleteOpen: (open: boolean) => void;
  setClearInboxOpen: (open: boolean) => void;
  setEditOpen: (open: boolean) => void;
  setShareOpen: (open: boolean) => void;
  setCopyDetailsTarget: (target: CopyDetailsTarget | null) => void;
  setTakeConfirm: (target: TakeConfirmTarget | null) => void;
  setTakeFollowUp: (target: TakeFollowUpTarget | null) => void;
  reset: () => void;
}

const CLOSED = {
  deleteOpen: false,
  clearInboxOpen: false,
  editOpen: false,
  shareOpen: false,
  copyDetailsTarget: null,
  takeConfirm: null,
  takeFollowUp: null,
} as const;

export const useCollectionOverlayStore = create<CollectionOverlayState>()((set) => ({
  ...CLOSED,

  setDeleteOpen: (open) => set({ deleteOpen: open }),
  setClearInboxOpen: (open) => set({ clearInboxOpen: open }),
  setEditOpen: (open) => set({ editOpen: open }),
  setShareOpen: (open) => set({ shareOpen: open }),
  setCopyDetailsTarget: (target) => set({ copyDetailsTarget: target }),
  setTakeConfirm: (target) => set({ takeConfirm: target }),
  setTakeFollowUp: (target) => set({ takeFollowUp: target }),
  reset: () => set({ ...CLOSED }),
}));

/**
 * Runs as unmount cleanup, not a mount-time reset: cleanup fires before the
 * next mount paints, so a leftover open dialog never flashes for a frame.
 */
export function useCloseCollectionOverlaysOnUnmount() {
  useEffect(
    () => () => {
      useCollectionOverlayStore.getState().reset();
    },
    [],
  );
}
