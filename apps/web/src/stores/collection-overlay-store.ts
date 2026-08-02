import type { Printing } from "@openrift/shared";
import { useEffect } from "react";
import { create } from "zustand";

import type { CopyDetailsTarget } from "@/components/collection/copy-details-dialog";
import type { WishEntryFlat } from "@/hooks/use-wish-entries";

/**
 * The group "bulk box" take confirmation: every copy of the card the viewer
 * could claim, plus the quantity the stepper opens on.
 */
interface TakeConfirmTarget {
  printing: Printing;
  availableCopyIds: string[];
  initialQuantity: number;
}

/** Post-take wishlist cleanup for a card the viewer had wished for. */
interface TakeFollowUpTarget {
  printing: Printing;
  entries: WishEntryFlat[];
  takenQuantity: number;
}

/**
 * Open/close state for the dialogs mounted below the collection grid.
 *
 * These used to be eight useState slots in CollectionGrid, drilled through
 * CollectionGridOverlays as sixteen state-and-setter props. Holding them here
 * instead is the same move collection-grid.tsx already documents for the
 * variant popover: the grid opens a dialog without subscribing to whether it is
 * open, so a dialog opening no longer re-renders the virtualized grid.
 *
 * Slots stay separate rather than collapsing into one "active overlay" union —
 * the take flow hands off from the confirm dialog to the follow-up dialog, and
 * a single slot would make that handoff a state race.
 */
interface CollectionOverlayState {
  quickAddOpen: boolean;
  deleteOpen: boolean;
  clearInboxOpen: boolean;
  editOpen: boolean;
  shareOpen: boolean;
  copyDetailsTarget: CopyDetailsTarget | null;
  takeConfirm: TakeConfirmTarget | null;
  takeFollowUp: TakeFollowUpTarget | null;

  setQuickAddOpen: (open: boolean) => void;
  toggleQuickAdd: () => void;
  setDeleteOpen: (open: boolean) => void;
  setClearInboxOpen: (open: boolean) => void;
  setEditOpen: (open: boolean) => void;
  setShareOpen: (open: boolean) => void;
  setCopyDetailsTarget: (target: CopyDetailsTarget | null) => void;
  setTakeConfirm: (target: TakeConfirmTarget | null) => void;
  setTakeFollowUp: (target: TakeFollowUpTarget | null) => void;
  /** Close everything — used when the viewer switches collection. */
  reset: () => void;
}

const CLOSED = {
  quickAddOpen: false,
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

  setQuickAddOpen: (open) => set({ quickAddOpen: open }),
  toggleQuickAdd: () => set((state) => ({ quickAddOpen: !state.quickAddOpen })),
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
 * Closes every overlay when the collection grid unmounts.
 *
 * As eight `useState` slots these were closed by construction on every remount.
 * A module singleton is not: it keeps whatever was open when the grid went
 * away. The grid's own `reset()` runs in an effect body, which React flushes
 * *after* paint, so leaving /collections with a dialog up and coming back
 * rendered that dialog open for one frame — worst case `copyDetailsTarget`,
 * which paints copy rows belonging to the collection the viewer already left.
 * Clearing on the way out instead means the store is already clean before the
 * next mount renders, so there is no frame to catch.
 *
 * Cleanup rather than a second mount-time effect on purpose: a mount effect
 * would land after paint like the existing one and fix nothing.
 *
 * Correct under StrictMode's dev double-invoke (mount → unmount → mount): the
 * cleanup fires on the simulated unmount, but `reset()` is idempotent and
 * nothing can have opened an overlay in between — every opener is a user event
 * or a later effect. The empty dep array keeps the cleanup tied to unmount, so
 * it never runs mid-session and closes a dialog the viewer is using.
 * @returns Nothing.
 */
export function useCloseCollectionOverlaysOnUnmount() {
  useEffect(
    () => () => {
      useCollectionOverlayStore.getState().reset();
    },
    [],
  );
}
