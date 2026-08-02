import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useCollectionOverlayStore } from "@/stores/collection-overlay-store";
import { stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

const resetStore = createStoreResetter(useCollectionOverlayStore);

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
});

describe("useCollectionOverlayStore", () => {
  it("starts with every overlay closed", () => {
    const state = useCollectionOverlayStore.getState();
    expect(state.quickAddOpen).toBe(false);
    expect(state.deleteOpen).toBe(false);
    expect(state.clearInboxOpen).toBe(false);
    expect(state.editOpen).toBe(false);
    expect(state.shareOpen).toBe(false);
    expect(state.copyDetailsTarget).toBeNull();
    expect(state.takeConfirm).toBeNull();
    expect(state.takeFollowUp).toBeNull();
  });

  it("toggles the quick-add palette", () => {
    // The Cmd+K handler toggles rather than opens, so it has to read through
    // the store rather than close over a boolean.
    useCollectionOverlayStore.getState().toggleQuickAdd();
    expect(useCollectionOverlayStore.getState().quickAddOpen).toBe(true);
    useCollectionOverlayStore.getState().toggleQuickAdd();
    expect(useCollectionOverlayStore.getState().quickAddOpen).toBe(false);
  });

  it("keeps the take confirm and follow-up slots independent", () => {
    // The take flow closes the confirm dialog and opens the follow-up in the
    // same success handler. Separate slots make that a handoff rather than a
    // race over one shared slot.
    const printing = stubPrinting();
    useCollectionOverlayStore
      .getState()
      .setTakeConfirm({ printing, availableCopyIds: ["copy-1"], initialQuantity: 1 });
    useCollectionOverlayStore.getState().setTakeConfirm(null);
    useCollectionOverlayStore
      .getState()
      .setTakeFollowUp({ printing, entries: [], takenQuantity: 1 });

    const state = useCollectionOverlayStore.getState();
    expect(state.takeConfirm).toBeNull();
    expect(state.takeFollowUp?.takenQuantity).toBe(1);
  });

  it("opening one overlay leaves the others alone", () => {
    useCollectionOverlayStore.getState().setEditOpen(true);
    useCollectionOverlayStore.getState().setShareOpen(true);

    const state = useCollectionOverlayStore.getState();
    expect(state.editOpen).toBe(true);
    expect(state.shareOpen).toBe(true);
  });

  it("reset closes everything, so a collection switch can't leave a stale dialog", () => {
    const printing = stubPrinting();
    useCollectionOverlayStore.getState().setQuickAddOpen(true);
    useCollectionOverlayStore.getState().setDeleteOpen(true);
    useCollectionOverlayStore.getState().setClearInboxOpen(true);
    useCollectionOverlayStore.getState().setEditOpen(true);
    useCollectionOverlayStore.getState().setShareOpen(true);
    useCollectionOverlayStore
      .getState()
      .setTakeConfirm({ printing, availableCopyIds: ["copy-1"], initialQuantity: 1 });
    useCollectionOverlayStore
      .getState()
      .setTakeFollowUp({ printing, entries: [], takenQuantity: 1 });

    useCollectionOverlayStore.getState().reset();

    const state = useCollectionOverlayStore.getState();
    expect(state.quickAddOpen).toBe(false);
    expect(state.deleteOpen).toBe(false);
    expect(state.clearInboxOpen).toBe(false);
    expect(state.editOpen).toBe(false);
    expect(state.shareOpen).toBe(false);
    expect(state.copyDetailsTarget).toBeNull();
    expect(state.takeConfirm).toBeNull();
    expect(state.takeFollowUp).toBeNull();
  });
});
