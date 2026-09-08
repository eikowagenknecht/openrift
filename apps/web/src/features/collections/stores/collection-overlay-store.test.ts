import { renderHook } from "@testing-library/react";
import { StrictMode, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  useCloseCollectionOverlaysOnUnmount,
  useCollectionOverlayStore,
} from "@/features/collections/stores/collection-overlay-store";
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
    expect(state.editOpen).toBe(false);
    expect(state.shareOpen).toBe(false);
    expect(state.importOpen).toBe(false);
    expect(state.exportOpen).toBe(false);
    expect(state.copyDetailsTarget).toBeNull();
    expect(state.takeConfirm).toBeNull();
    expect(state.takeFollowUp).toBeNull();
  });

  it("keeps the take confirm and follow-up slots independent, as a handoff rather than a shared-slot race", () => {
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
    useCollectionOverlayStore.getState().setEditOpen(true);
    useCollectionOverlayStore.getState().setShareOpen(true);
    useCollectionOverlayStore.getState().setImportOpen(true);
    useCollectionOverlayStore.getState().setExportOpen(true);
    useCollectionOverlayStore
      .getState()
      .setTakeConfirm({ printing, availableCopyIds: ["copy-1"], initialQuantity: 1 });
    useCollectionOverlayStore
      .getState()
      .setTakeFollowUp({ printing, entries: [], takenQuantity: 1 });

    useCollectionOverlayStore.getState().reset();

    const state = useCollectionOverlayStore.getState();
    expect(state.deleteOpen).toBe(false);
    expect(state.editOpen).toBe(false);
    expect(state.shareOpen).toBe(false);
    expect(state.importOpen).toBe(false);
    expect(state.exportOpen).toBe(false);
    expect(state.copyDetailsTarget).toBeNull();
    expect(state.takeConfirm).toBeNull();
    expect(state.takeFollowUp).toBeNull();
  });
});

describe("useCloseCollectionOverlaysOnUnmount", () => {
  function openEverything() {
    const printing = stubPrinting();
    useCollectionOverlayStore.getState().setDeleteOpen(true);
    useCollectionOverlayStore.getState().setEditOpen(true);
    useCollectionOverlayStore.getState().setShareOpen(true);
    useCollectionOverlayStore.getState().setImportOpen(true);
    useCollectionOverlayStore.getState().setExportOpen(true);
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

  it("closes every overlay when the grid unmounts, so a returning viewer never sees a stale open dialog", () => {
    const { unmount } = renderHook(() => {
      useCloseCollectionOverlaysOnUnmount();
    });
    openEverything();

    unmount();

    const state = useCollectionOverlayStore.getState();
    expect(state.deleteOpen).toBe(false);
    expect(state.editOpen).toBe(false);
    expect(state.shareOpen).toBe(false);
    expect(state.importOpen).toBe(false);
    expect(state.exportOpen).toBe(false);
    expect(state.copyDetailsTarget).toBeNull();
    expect(state.takeConfirm).toBeNull();
    expect(state.takeFollowUp).toBeNull();
  });

  it("leaves open overlays alone while the grid stays mounted", () => {
    const { rerender } = renderHook(() => {
      useCloseCollectionOverlaysOnUnmount();
    });
    useCollectionOverlayStore.getState().setEditOpen(true);

    rerender();

    expect(useCollectionOverlayStore.getState().editOpen).toBe(true);
  });

  it("survives StrictMode's mount → unmount → mount, keeping state set after the extra cleanup", () => {
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
