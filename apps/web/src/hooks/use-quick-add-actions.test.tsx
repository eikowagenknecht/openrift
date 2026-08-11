import type { CopyResponse } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubCopy, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

// Mock the copies mutation hooks so the dispose mutation rejects on demand,
// standing in for an expected server rejection (e.g. "This card is reserved in
// an active trade"). The real mutation machinery and its global onError toast
// are out of scope here — we only care that the hook's own dispose call never
// leaks an unhandled rejection.
const disposeMutateAsync = vi.fn();
const batchedAdd = vi.fn();
vi.mock("@/hooks/use-copies", () => ({
  useBatchedAddCopies: () => ({ add: batchedAdd, isPending: false }),
  useDisposeCopies: () => ({ mutateAsync: disposeMutateAsync, isPending: false }),
}));

// The copies collection is mocked per-test via this mutable array.
let copies: CopyResponse[] = [];
vi.mock("@/lib/copies-collection", () => ({
  useCopiesCollection: () => ({ toArray: copies }),
}));

const { useQuickAddActions } = await import("./use-quick-add-actions");
const { useAddModeStore } = await import("@/stores/add-mode-store");

const COLLECTION_ID = "11111111-1111-1111-1111-111111111111";

function personalCopy(printingId: string): CopyResponse {
  return stubCopy({
    id: "22222222-2222-2222-2222-222222222222",
    printingId,
    collectionId: COLLECTION_ID,
  });
}

// Regression: disposing a copy can fail for an expected reason (the copy is
// reserved in an active trade → the API 4xxs). The minus paths invoke
// disposeCopies.mutateAsync, whose callers are fire-and-forget (the onDecrement
// IIFE in route-decrement.ts and the popover's onRemoveFromCollection click
// prop), so a rejection that escapes the hook became an uncaught promise
// rejection. The hook must swallow it; the user-facing toast is fired by the
// global mutation onError handler.
describe("useQuickAddActions swallows expected dispose failures", () => {
  const resetAddMode = createStoreResetter(useAddModeStore);

  beforeEach(() => {
    resetAddMode();
    disposeMutateAsync.mockReset();
    disposeMutateAsync.mockRejectedValue(
      new Error("This card is reserved in an active trade — cancel the trade to free it."),
    );
    copies = [];
  });

  afterEach(() => {
    resetAddMode();
  });

  it("handleDisposeFromCollection resolves when the dispose mutation rejects", async () => {
    const printing = stubPrinting();
    copies = [personalCopy(printing.id)];
    const { result } = renderHook(() => useQuickAddActions(COLLECTION_ID, COLLECTION_ID));

    await expect(
      result.current.handleDisposeFromCollection(printing, COLLECTION_ID),
    ).resolves.toBeUndefined();
    expect(disposeMutateAsync).toHaveBeenCalledOnce();
  });

  it("tryUndoAdd resolves to 'done' when the single-collection dispose rejects", async () => {
    const printing = stubPrinting();
    copies = [personalCopy(printing.id)];
    const { result } = renderHook(() => useQuickAddActions(COLLECTION_ID, COLLECTION_ID));

    await expect(result.current.tryUndoAdd?.(printing)).resolves.toBe("done");
    expect(disposeMutateAsync).toHaveBeenCalledOnce();
  });
});

// The grid's digit-key shortcut ("press 3 to add three copies") reaches the
// hook through handleQuickAdd's `quantity` argument. Every click path leaves it
// undefined and must still add exactly one.
describe("useQuickAddActions handleQuickAdd quantity", () => {
  const resetAddMode = createStoreResetter(useAddModeStore);

  beforeEach(() => {
    resetAddMode();
    copies = [];
    batchedAdd.mockReset();
    let added = 0;
    batchedAdd.mockImplementation(() => {
      added += 1;
      return { result: Promise.resolve({ id: `copy-${added}` }) };
    });
  });

  afterEach(() => {
    resetAddMode();
  });

  it("adds one copy when no quantity is given", async () => {
    const printing = stubPrinting();
    const { result } = renderHook(() => useQuickAddActions(COLLECTION_ID, COLLECTION_ID));

    await result.current.handleQuickAdd?.(printing);

    expect(batchedAdd).toHaveBeenCalledOnce();
    expect(batchedAdd).toHaveBeenCalledWith(printing.id, COLLECTION_ID);
  });

  it("adds `quantity` copies, each recorded for undo", async () => {
    const printing = stubPrinting();
    const { result } = renderHook(() => useQuickAddActions(COLLECTION_ID, COLLECTION_ID));

    await result.current.handleQuickAdd?.(printing, undefined, 3);

    expect(batchedAdd).toHaveBeenCalledTimes(3);
    expect(useAddModeStore.getState().addedItems.get(printing.id)?.copyIds).toEqual([
      "copy-1",
      "copy-2",
      "copy-3",
    ]);
  });

  it("treats a nonsensical quantity as one copy", async () => {
    const printing = stubPrinting();
    const { result } = renderHook(() => useQuickAddActions(COLLECTION_ID, COLLECTION_ID));

    await result.current.handleQuickAdd?.(printing, undefined, 0);

    expect(batchedAdd).toHaveBeenCalledOnce();
  });
});
