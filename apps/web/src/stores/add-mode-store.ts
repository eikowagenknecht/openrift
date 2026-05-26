import type { Printing } from "@openrift/shared";
import { create } from "zustand";

interface AddedEntry {
  printing: Printing;
  quantity: number;
  copyIds: string[];
  pendingCount: number;
}

/**
 * Why the popover knows how it was opened: when the user enters via a `-`
 * button or the `-` key, Enter inside the popover should remove the
 * highlighted variant. When they enter via the pill / add affordance, Enter
 * should add. Shift+Enter is always the inverse of the entry intent.
 */
export type VariantPopoverIntent = "add" | "remove";

interface AddModeState {
  addedItems: Map<string, AddedEntry>;
  variantPopover: {
    cardId: string;
    /** Optional setId — when present, the popover filters variants to this set. */
    setId?: string;
    intent: VariantPopoverIntent;
    anchorEl: HTMLElement;
  } | null;
  disposePicker: { printing: Printing; anchorEl: HTMLElement } | null;

  incrementPending: (printing: Printing) => void;
  decrementPending: (printingId: string) => void;
  recordAdd: (printing: Printing, copyId: string) => void;
  recordUndo: (printingId: string) => void;
  openVariants: (
    cardId: string,
    anchorEl: HTMLElement,
    intent: VariantPopoverIntent,
    setId?: string,
  ) => void;
  closeVariants: () => void;
  openDisposePicker: (printing: Printing, anchorEl: HTMLElement) => void;
  closeDisposePicker: () => void;
  reset: () => void;
}

export const useAddModeStore = create<AddModeState>()((set) => ({
  addedItems: new Map(),
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

  openVariants: (cardId, anchorEl, intent, setId) =>
    set({ variantPopover: { cardId, setId, intent, anchorEl } }),
  closeVariants: () => set({ variantPopover: null }),
  openDisposePicker: (printing, anchorEl) => set({ disposePicker: { printing, anchorEl } }),
  closeDisposePicker: () => set({ disposePicker: null }),
  reset: () =>
    set({
      addedItems: new Map(),
      variantPopover: null,
      disposePicker: null,
    }),
}));
