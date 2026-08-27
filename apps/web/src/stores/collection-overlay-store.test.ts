import { renderHook } from "@testing-library/react";
import { StrictMode, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  useCloseCollectionOverlaysOnUnmount,
  useCollectionOverlayStore,
} from "@/stores/collection-overlay-store";
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
    expect(state.deleteOpen).toBe(false);
    expect(state.clearInboxOpen).toBe(false);
    expect(state.editOpen).toBe(false);
    expect(state.shareOpen).toBe(false);
    expect(state.copyDetailsTarget).toBeNull();
    expect(state.takeConfirm).toBeNull();
    expect(state.takeFollowUp).toBeNull();
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
    expect(state.deleteOpen).toBe(false);
    expect(state.clearInboxOpen).toBe(false);
    expect(state.editOpen).toBe(false);
    expect(state.shareOpen).toBe(false);
    expect(state.copyDetailsTarget).toBeNull();
    expect(state.takeConfirm).toBeNull();
    expect(state.takeFollowUp).toBeNull();
  });
});

describe("useCloseCollectionOverlaysOnUnmount", () => {
  /** Opens one slot of each kind — boolean, and the two object-valued targets. */
  function openEverything() {
    const printing = stubPrinting();
    useCollectionOverlayStore.getState().setDeleteOpen(true);
    useCollectionOverlayStore.getState().setClearInboxOpen(true);
    useCollectionOverlayStore.getState().setEditOpen(true);
    useCollectionOverlayStore.getState().setShareOpen(true);
    useCollectionOverlayStore.getState().setCopyDetailsTarget({
      copyIds: ["copy-1"],
      cardName: "Yasuo",
      printingByCopyId: new Map([["copy-1", printing]]),
    });
    useCollectionOverlayStore
      .getState()
      .setTakeConfirm({ printing, availableCopyIds: ["copy-1"], initialQuantity: 1 });
    useCollectionOverlayStore
      .getState()
      .setTakeFollowUp({ printing, entries: [], takenQuantity: 1 });
  }

  it("closes every overlay when the grid unmounts", () => {
    // The store outlives the grid, and the grid's mount-time reset only runs
    // after paint. Clearing on unmount is what keeps a returning viewer from
    // seeing one frame of the dialog they left open.
    const { unmount } = renderHook(() => {
      useCloseCollectionOverlaysOnUnmount();
    });
    openEverything();

    unmount();

    const state = useCollectionOverlayStore.getState();
    expect(state.deleteOpen).toBe(false);
    expect(state.clearInboxOpen).toBe(false);
    expect(state.editOpen).toBe(false);
    expect(state.shareOpen).toBe(false);
    expect(state.copyDetailsTarget).toBeNull();
    expect(state.takeConfirm).toBeNull();
    expect(state.takeFollowUp).toBeNull();
  });

  it("leaves open overlays alone while the grid stays mounted", () => {
    // Cleanup-only: a dialog must survive re-renders of the grid underneath it.
    const { rerender } = renderHook(() => {
      useCloseCollectionOverlaysOnUnmount();
    });
    useCollectionOverlayStore.getState().setEditOpen(true);

    rerender();

    expect(useCollectionOverlayStore.getState().editOpen).toBe(true);
  });

  it("survives StrictMode's double-invoked mount", () => {
    // Dev StrictMode runs mount → unmount → mount, so the cleanup fires once
    // before the viewer can do anything. Nothing opens an overlay in that
    // window, and reset() is idempotent, so state set afterwards has to stick.
    const { unmount } = renderHook(
      () => {
        useCloseCollectionOverlaysOnUnmount();
      },
      { wrapper: ({ children }) => createElement(StrictMode, null, children) },
    );
    useCollectionOverlayStore.getState().setShareOpen(true);
    expect(useCollectionOverlayStore.getState().shareOpen).toBe(true);

    unmount();

    expect(useCollectionOverlayStore.getState().shareOpen).toBe(false);
  });
});
