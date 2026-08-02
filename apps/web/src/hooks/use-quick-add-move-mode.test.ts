import type { CollectionResponse, CopyResponse } from "@openrift/shared";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOVE_FROM_ANYWHERE } from "@/lib/move-sources";
import { stubCopy, stubPrinting } from "@/test/factories";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

// The move mutation rejects on demand, standing in for an expected server
// rejection (e.g. a copy reserved by a live trade). The global mutation onError
// toast is out of scope — what matters here is the session history rollback.
const moveMutateAsync = vi.fn();
let copies: CopyResponse[] = [];
vi.mock("@/hooks/use-copies", () => ({
  useCopies: () => ({ data: copies, isReady: true }),
  useMoveCopies: () => ({ mutateAsync: moveMutateAsync, isPending: false }),
}));

const { useQuickAddMoveMode, resolveSwapDirection } = await import("./use-quick-add-move-mode");

const collection = (id: string, name: string, extra?: Partial<CollectionResponse>) =>
  ({ id, name, groupId: null, isInbox: false, ...extra }) as CollectionResponse;

const INBOX = collection("inbox", "Inbox", { isInbox: true });
const BINDER = collection("binder", "Binder");
const DECKBOX = collection("deckbox", "Deckbox");
const ALL = [INBOX, BINDER, DECKBOX];

function renderMoveMode(collections: CollectionResponse[] = ALL, collectionId = DECKBOX.id) {
  return renderHook(() =>
    useQuickAddMoveMode({ collectionId, collections, selectionKey: "card:0" }),
  );
}

/** Puts the hook into move mode, which the palette's Move tab does. */
async function enterMoveMode(result: { current: { setMode: (mode: "add" | "move") => void } }) {
  await act(async () => {
    result.current.setMode("move");
  });
}

describe("resolveSwapDirection", () => {
  it("swaps two concrete collections and remembers the previous pair", () => {
    const next = resolveSwapDirection(
      { from: BINDER.id, to: DECKBOX.id, swapUndo: null },
      ALL,
      INBOX.id,
    );

    expect(next).toEqual({
      from: DECKBOX.id,
      to: BINDER.id,
      swapUndo: { from: BINDER.id, to: DECKBOX.id },
    });
  });

  it("replays the remembered pair on a second swap, restoring All collections", () => {
    const swapped = resolveSwapDirection(
      { from: MOVE_FROM_ANYWHERE, to: DECKBOX.id, swapUndo: null },
      ALL,
      INBOX.id,
    );
    // A plain value swap can't put "All collections" back in the From slot,
    // which is the whole reason swapUndo exists.
    expect(swapped).toEqual({
      from: DECKBOX.id,
      to: INBOX.id,
      swapUndo: { from: MOVE_FROM_ANYWHERE, to: DECKBOX.id },
    });

    expect(resolveSwapDirection(swapped!, ALL, INBOX.id)).toEqual({
      from: MOVE_FROM_ANYWHERE,
      to: DECKBOX.id,
      swapUndo: null,
    });
  });

  it("falls back to the first other collection when the inbox is the current target", () => {
    const next = resolveSwapDirection(
      { from: MOVE_FROM_ANYWHERE, to: INBOX.id, swapUndo: null },
      ALL,
      INBOX.id,
    );

    // Clearing the inbox out: the inbox can't be both sides, so the
    // destination becomes the first collection that isn't it.
    expect(next).toEqual({
      from: INBOX.id,
      to: BINDER.id,
      swapUndo: { from: MOVE_FROM_ANYWHERE, to: INBOX.id },
    });
  });

  it("returns null when From is anywhere and no other collection can take the target slot", () => {
    expect(
      resolveSwapDirection(
        { from: MOVE_FROM_ANYWHERE, to: INBOX.id, swapUndo: null },
        [INBOX],
        INBOX.id,
      ),
    ).toBeNull();
  });
});

describe("useQuickAddMoveMode", () => {
  beforeEach(() => {
    moveMutateAsync.mockReset();
    moveMutateAsync.mockResolvedValue(undefined);
    copies = [];
  });

  it("stays add-only with fewer than two collections", () => {
    const { result } = renderMoveMode([INBOX], INBOX.id);

    expect(result.current.canMove).toBe(false);
    // Even after switching the tab, one collection has nowhere to move to.
    expect(result.current.inMoveMode).toBe(false);
  });

  it("counts only copies outside the target, and drops reserved ones", async () => {
    const printing = stubPrinting();
    copies = [
      stubCopy({ id: "c1", printingId: printing.id, collectionId: BINDER.id }),
      stubCopy({ id: "c2", printingId: printing.id, collectionId: INBOX.id }),
      // Already in the target, so not movable.
      stubCopy({ id: "c3", printingId: printing.id, collectionId: DECKBOX.id }),
      // The move API rejects the whole batch for reserved copies.
      stubCopy({ id: "c4", printingId: printing.id, collectionId: BINDER.id, reserved: true }),
    ];
    const { result } = renderMoveMode();
    await enterMoveMode(result);

    expect(result.current.movableCounts?.[printing.id]).toBe(2);
    // Inbox first, then the rest by size — that ordering is what sourceIndex 0 means.
    expect(result.current.sourcesFor(printing.id).map((s) => s.collectionId)).toEqual([
      INBOX.id,
      BINDER.id,
    ]);
  });

  it("moves from the active source and records the move for undo", async () => {
    const printing = stubPrinting();
    copies = [
      stubCopy({ id: "c1", printingId: printing.id, collectionId: INBOX.id }),
      stubCopy({ id: "c2", printingId: printing.id, collectionId: BINDER.id }),
    ];
    const { result } = renderMoveMode();
    await enterMoveMode(result);

    await act(async () => {
      await result.current.moveOne(printing);
    });

    expect(moveMutateAsync).toHaveBeenCalledWith({
      copyIds: ["c1"],
      toCollectionId: DECKBOX.id,
    });
    expect(result.current.movedCount(printing.id)).toBe(1);
  });

  it("moves from the collection a source chip names, not the active one", async () => {
    const printing = stubPrinting();
    copies = [
      stubCopy({ id: "c1", printingId: printing.id, collectionId: INBOX.id }),
      stubCopy({ id: "c2", printingId: printing.id, collectionId: BINDER.id }),
    ];
    const { result } = renderMoveMode();
    await enterMoveMode(result);

    await act(async () => {
      await result.current.moveOne(printing, BINDER.id);
    });

    expect(moveMutateAsync).toHaveBeenCalledWith({
      copyIds: ["c2"],
      toCollectionId: DECKBOX.id,
    });
  });

  it("rolls the history back when the move rejects, so undo has nothing to replay", async () => {
    const printing = stubPrinting();
    copies = [stubCopy({ id: "c1", printingId: printing.id, collectionId: INBOX.id })];
    moveMutateAsync.mockRejectedValue(new Error("This card is reserved in an active trade."));
    const { result } = renderMoveMode();
    await enterMoveMode(result);

    await act(async () => {
      await result.current.moveOne(printing);
    });

    expect(result.current.movedCount(printing.id)).toBe(0);
  });

  it("sends the copy back where it came from, and restores the record when that rejects", async () => {
    const printing = stubPrinting();
    copies = [stubCopy({ id: "c1", printingId: printing.id, collectionId: BINDER.id })];
    const { result } = renderMoveMode();
    await enterMoveMode(result);

    await act(async () => {
      await result.current.moveOne(printing);
    });
    expect(result.current.movedCount(printing.id)).toBe(1);

    moveMutateAsync.mockRejectedValue(new Error("nope"));
    await act(async () => {
      await result.current.undoMove(printing);
    });

    // The undo failed, so the copy is still in the target and the history
    // entry must survive for a retry.
    expect(moveMutateAsync).toHaveBeenLastCalledWith({
      copyIds: ["c1"],
      toCollectionId: BINDER.id,
    });
    expect(result.current.movedCount(printing.id)).toBe(1);

    moveMutateAsync.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.undoMove(printing);
    });
    expect(result.current.movedCount(printing.id)).toBe(0);
  });

  it("does nothing when there is no copy to move or nothing left to undo", async () => {
    const printing = stubPrinting();
    const { result } = renderMoveMode();
    await enterMoveMode(result);

    await act(async () => {
      await result.current.moveOne(printing);
      await result.current.undoMove(printing);
    });

    expect(moveMutateAsync).not.toHaveBeenCalled();
  });

  it("clears the swap-undo pair when either dropdown is picked by hand", async () => {
    const { result } = renderMoveMode();
    await enterMoveMode(result);

    await act(async () => {
      result.current.handleSwapDirection();
    });
    expect(result.current.moveFrom).toBe(DECKBOX.id);
    expect(result.current.moveTo).toBe(INBOX.id);

    await act(async () => {
      result.current.chooseMoveTo(BINDER.id);
    });
    // The remembered pair described a direction the user has now edited, so a
    // swap starts fresh rather than replaying it.
    await act(async () => {
      result.current.handleSwapDirection();
    });
    expect(result.current.moveFrom).toBe(BINDER.id);
    expect(result.current.moveTo).toBe(DECKBOX.id);
  });

  it("resets the active source when the direction or the selected row changes", async () => {
    const { result, rerender } = renderHook(
      ({ selectionKey }) =>
        useQuickAddMoveMode({ collectionId: DECKBOX.id, collections: ALL, selectionKey }),
      { initialProps: { selectionKey: "card-a:0" } },
    );
    await enterMoveMode(result);

    await act(async () => {
      result.current.setSourceIndex(1);
    });
    expect(result.current.sourceIndex).toBe(1);

    await act(async () => {
      rerender({ selectionKey: "card-b:0" });
    });
    expect(result.current.sourceIndex).toBe(0);

    await act(async () => {
      result.current.setSourceIndex(1);
    });
    await act(async () => {
      result.current.chooseMoveFrom(BINDER.id);
    });
    expect(result.current.sourceIndex).toBe(0);
  });
});
