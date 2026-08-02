import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRowActionHandlers } from "@/hooks/use-row-action-handlers";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { createStoreResetter } from "@/test/store-helpers";

const resetStore = createStoreResetter(useCardRowActionsStore);

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
});

describe("useRowActionHandlers", () => {
  it("registers the surface's handlers on mount", () => {
    const onRowClick = vi.fn();
    renderHook(() => useRowActionHandlers("catalog", { onRowClick }));

    expect(useCardRowActionsStore.getState().owner).toBe("catalog");
    expect(useCardRowActionsStore.getState().handlers.onRowClick).toBe(onRowClick);
  });

  it("re-registers on every render so cells dispatch the freshest closure", () => {
    // The handlers close over per-render state (item lists, mutation results,
    // pending flags), so a stale registration would dispatch against data the
    // surface has already moved past.
    const { rerender } = renderHook(({ handler }) => useRowActionHandlers("list", handler), {
      initialProps: { handler: { onRowClick: vi.fn() } },
    });

    const fresh = vi.fn();
    rerender({ handler: { onRowClick: fresh } });

    expect(useCardRowActionsStore.getState().handlers.onRowClick).toBe(fresh);
  });

  it("clears the slot when the surface unmounts", () => {
    const { unmount } = renderHook(() => useRowActionHandlers("deck", { onRowClick: vi.fn() }));

    unmount();

    expect(useCardRowActionsStore.getState().owner).toBeNull();
    expect(useCardRowActionsStore.getState().handlers).toEqual({});
  });

  it("does not clear a registration another surface has already taken over", () => {
    // Route transitions mount the incoming surface before the outgoing one's
    // cleanup runs, so the late cleanup has to stand down.
    const outgoing = renderHook(() => useRowActionHandlers("catalog", { onRowClick: vi.fn() }));
    const successor = vi.fn();
    renderHook(() => useRowActionHandlers("collection", { onRowClick: successor }));

    outgoing.unmount();

    expect(useCardRowActionsStore.getState().owner).toBe("collection");
    expect(useCardRowActionsStore.getState().handlers.onRowClick).toBe(successor);
  });
});
