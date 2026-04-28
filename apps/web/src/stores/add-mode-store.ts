import type { Printing } from "@openrift/shared";
import { create } from "zustand";

interface AddedEntry {
  printing: Printing;
  quantity: number;
  copyIds: string[];
  pendingCount: number;
}

interface AddModeState {
  addedItems: Map<string, AddedEntry>;
  showAddedList: boolean;
  variantPopover: {
    cardId: string;
    /** Optional setId — when present, the popover filters variants to this set. */
    setId?: string;
    pos: { top: number; left: number };
  } | null;
  disposePicker: { printing: Printing; pos: { top: number; left: number } } | null;

  incrementPending: (printing: Printing) => void;
  decrementPending: (printingId: string) => void;
  recordAdd: (printing: Printing, copyId: string) => void;
  recordUndo: (printingId: string) => void;
  toggleAddedList: () => void;
  closeAddedList: () => void;
  openVariants: (cardId: string, pos: { top: number; left: number }, setId?: string) => void;
  closeVariants: () => void;
  openDisposePicker: (printing: Printing, pos: { top: number; left: number }) => void;
  closeDisposePicker: () => void;
  reset: () => void;
}

export const useAddModeStore = create<AddModeState>()((set) => ({
  addedItems: new Map(),
  showAddedList: false,
  variantPopover: null,
  disposePicker: null,

  incrementPending: (printing) =>
    set((state) => {
      const next = new Map(state.addedItems);
      const existing = state.addedItems.get(printing.id);
      // delete + set preserves insertion order (most recently touched last)
      next.delete(printing.id);
      next.set(printing.id, {
        printing,
        quantity: existing?.quantity ?? 0,
        copyIds: existing?.copyIds ?? [],
        pendingCount: (existing?.pendingCount ?? 0) + 1,
      });
      return { addedItems: next };
    }),

  decrementPending: (printingId) =>
    set((state) => {
      const existing = state.addedItems.get(printingId);
      if (!existing || existing.pendingCount <= 0) {
        return state;
      }
      const next = new Map(state.addedItems);
      const newPending = existing.pendingCount - 1;
      if (existing.quantity === 0 && newPending === 0) {
        next.delete(printingId);
      } else {
        next.set(printingId, { ...existing, pendingCount: newPending });
      }
      return { addedItems: next };
    }),

  recordAdd: (printing, copyId) =>
    set((state) => {
      const next = new Map(state.addedItems);
      const existing = state.addedItems.get(printing.id);
      // delete + set preserves insertion order (most recently touched last)
      next.delete(printing.id);
      next.set(printing.id, {
        printing,
        quantity: (existing?.quantity ?? 0) + 1,
        copyIds: [...(existing?.copyIds ?? []), copyId],
        pendingCount: existing?.pendingCount ?? 0,
      });
      return { addedItems: next };
    }),

  recordUndo: (printingId) =>
    set((state) => {
      const existing = state.addedItems.get(printingId);
      if (!existing) {
        return state;
      }
      const next = new Map(state.addedItems);
      const newCopyIds = existing.copyIds.slice(0, -1);
      if (newCopyIds.length === 0 && existing.pendingCount === 0) {
        next.delete(printingId);
      } else {
        next.delete(printingId);
        next.set(printingId, {
          ...existing,
          quantity: existing.quantity - 1,
          copyIds: newCopyIds,
        });
      }
      return { addedItems: next };
    }),

  toggleAddedList: () => set((state) => ({ showAddedList: !state.showAddedList })),
  closeAddedList: () => set({ showAddedList: false }),
  openVariants: (cardId, pos, setId) => set({ variantPopover: { cardId, setId, pos } }),
  closeVariants: () => set({ variantPopover: null }),
  openDisposePicker: (printing, pos) => set({ disposePicker: { printing, pos } }),
  closeDisposePicker: () => set({ disposePicker: null }),
  reset: () =>
    set({
      addedItems: new Map(),
      showAddedList: false,
      variantPopover: null,
      disposePicker: null,
    }),
}));
