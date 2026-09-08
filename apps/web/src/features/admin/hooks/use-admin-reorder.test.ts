import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminReorderConfig } from "@/features/admin/hooks/use-admin-reorder";
import { useAdminReorder } from "@/features/admin/hooks/use-admin-reorder";
import type { ReorderMoves } from "@/features/admin/lib/admin-reorder";

const swapped = ["b", "a", "c"];

function makeMoves(overrides: Partial<ReorderMoves> = {}): ReorderMoves {
  return {
    moveTo: vi.fn(() => swapped),
    step: vi.fn(() => swapped),
    canDropOn: vi.fn(() => true),
    canStep: vi.fn(() => true),
    block: vi.fn(() => []),
    ...overrides,
  };
}

function dragStart(id: string): DragStartEvent {
  return { active: { id } } as unknown as DragStartEvent;
}

function dragEnd(activeId: string, overId?: string): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId === undefined ? null : { id: overId },
  } as unknown as DragEndEvent;
}

function renderReorder(reorder?: AdminReorderConfig, rowKeys = ["a", "b", "c"]) {
  return renderHook(
    (props: { reorder?: AdminReorderConfig; rowKeys: string[] }) => useAdminReorder(props),
    { initialProps: { reorder, rowKeys } },
  );
}

describe("useAdminReorder", () => {
  it("shows the source order before anything is moved", () => {
    const { result } = renderReorder({ moves: makeMoves(), onReorder: vi.fn() });

    expect(result.current.orderedKeys).toEqual(["a", "b", "c"]);
    expect(result.current.locked).toBe(false);
  });

  it("keeps showing the dropped order while the data prop still holds the old one", () => {
    let settle = () => {};
    // oxlint-disable-next-line promise/avoid-new -- a promise the test resolves by hand to hold the save open
    const pending = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const { result } = renderReorder({ moves: makeMoves(), onReorder: () => pending });

    act(() => {
      void result.current.commitReorder(swapped);
    });

    expect(result.current.orderedKeys).toEqual(swapped);
    expect(result.current.locked).toBe(true);
    settle();
  });

  it("drops the pending order once the data prop lands in the order that was requested", () => {
    // oxlint-disable-next-line promise/avoid-new -- a promise the test never resolves to hold the save open
    const pending = new Promise<void>(() => {});
    const { result, rerender } = renderReorder({ moves: makeMoves(), onReorder: () => pending });

    act(() => {
      void result.current.commitReorder(swapped);
    });
    rerender({ reorder: { moves: makeMoves(), onReorder: () => pending }, rowKeys: swapped });

    expect(result.current.orderedKeys).toEqual(swapped);
    expect(result.current.locked).toBe(false);
  });

  it("drops the pending order when the data prop lands in a different order", () => {
    // oxlint-disable-next-line promise/avoid-new -- a promise the test never resolves to hold the save open
    const pending = new Promise<void>(() => {});
    const { result, rerender } = renderReorder({ moves: makeMoves(), onReorder: () => pending });

    act(() => {
      void result.current.commitReorder(swapped);
    });
    rerender({
      reorder: { moves: makeMoves(), onReorder: () => pending },
      rowKeys: ["c", "a", "b"],
    });

    expect(result.current.orderedKeys).toEqual(["c", "a", "b"]);
    expect(result.current.locked).toBe(false);
  });

  it("locks moves while the caller reports its own mutation pending", () => {
    const { result } = renderReorder({ moves: makeMoves(), onReorder: vi.fn(), isPending: true });

    expect(result.current.locked).toBe(true);
  });

  it("falls back to the source order when the save is rejected", async () => {
    const onReorder = vi.fn().mockRejectedValue(new Error("nope"));
    const { result } = renderReorder({ moves: makeMoves(), onReorder });

    await act(async () => {
      await result.current.commitReorder(swapped);
    });

    expect(result.current.orderedKeys).toEqual(["a", "b", "c"]);
    expect(result.current.locked).toBe(false);
  });

  it("ignores a move the reorder math refused", async () => {
    const onReorder = vi.fn().mockResolvedValue(undefined);
    const { result } = renderReorder({ moves: makeMoves(), onReorder });

    await act(async () => {
      await result.current.commitReorder(null);
    });

    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.orderedKeys).toEqual(["a", "b", "c"]);
  });

  it("tracks the dragged row so the table can refuse invalid drop targets", () => {
    const { result } = renderReorder({ moves: makeMoves(), onReorder: vi.fn() });

    act(() => {
      result.current.handleDragStart(dragStart("a"));
    });
    expect(result.current.activeKey).toBe("a");

    act(() => {
      result.current.handleDragCancel();
    });
    expect(result.current.activeKey).toBeNull();
  });

  it("saves the order the drop asks for", () => {
    const moves = makeMoves();
    const onReorder = vi.fn().mockResolvedValue(undefined);
    const { result } = renderReorder({ moves, onReorder });

    act(() => {
      result.current.handleDragEnd(dragEnd("a", "b"));
    });

    expect(moves.moveTo).toHaveBeenCalledWith("a", "b");
    expect(onReorder).toHaveBeenCalledWith(swapped);
    expect(result.current.activeKey).toBeNull();
  });

  it("saves nothing when a row is dropped on itself", () => {
    const moves = makeMoves();
    const onReorder = vi.fn();
    const { result } = renderReorder({ moves, onReorder });

    act(() => {
      result.current.handleDragEnd(dragEnd("a", "a"));
    });

    expect(moves.moveTo).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("saves nothing when a row is dropped outside the list", () => {
    const moves = makeMoves();
    const onReorder = vi.fn();
    const { result } = renderReorder({ moves, onReorder });

    act(() => {
      result.current.handleDragEnd(dragEnd("a"));
    });

    expect(moves.moveTo).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("passes the rows straight through on a table that does not reorder", async () => {
    const { result } = renderReorder();

    await act(async () => {
      await result.current.commitReorder(swapped);
    });
    act(() => {
      result.current.handleDragEnd(dragEnd("a", "b"));
    });

    expect(result.current.orderedKeys).toEqual(["a", "b", "c"]);
    expect(result.current.locked).toBe(false);
  });
});
