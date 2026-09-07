import type { TierRow } from "@openrift/shared/types/api/tier-list";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MutateOptions {
  onSuccess?: () => void;
}

const { mutation } = vi.hoisted(() => ({
  mutation: {
    mutate: vi.fn((_body: unknown, options?: MutateOptions) => options?.onSuccess?.()),
    isPending: false,
  },
}));

vi.mock("@/hooks/use-tier-lists", () => ({ useUpdateTierList: () => mutation }));

const { useTierListAutosave, AUTOSAVE_WAIT_MS } = await import("./use-tier-list-autosave");
const { useTierListBuilderStore } = await import("@/stores/tier-list-builder-store");
const { createStoreResetter } = await import("@/test/store-helpers");

const resetStore = createStoreResetter(useTierListBuilderStore);

const LIST_ID = "list-1";
const BOARD: TierRow[] = [
  { label: "S", cards: [] },
  { label: "A", cards: [] },
];

function loadBoard(listId = LIST_ID) {
  act(() => useTierListBuilderStore.getState().load(listId, BOARD));
}

function settle() {
  act(() => {
    vi.advanceTimersByTime(AUTOSAVE_WAIT_MS + 50);
  });
}

function lastSavedRows(): TierRow[] | undefined {
  const body = mutation.mutate.mock.calls.at(-1)?.[0] as { tiers: TierRow[] } | undefined;
  return body?.tiers;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetStore();
  mutation.isPending = false;
  mutation.mutate.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTierListAutosave", () => {
  it("saves the board once the drags stop", () => {
    renderHook(() => useTierListAutosave(LIST_ID));
    loadBoard();

    act(() => useTierListBuilderStore.getState().assign("card-1", 0));
    act(() => useTierListBuilderStore.getState().assign("card-2", 1));
    expect(mutation.mutate).not.toHaveBeenCalled();

    settle();

    expect(mutation.mutate).toHaveBeenCalledTimes(1);
    expect(lastSavedRows()?.[0]?.cards).toEqual([{ cardId: "card-1", printingId: null }]);
    expect(lastSavedRows()?.[1]?.cards).toEqual([{ cardId: "card-2", printingId: null }]);
  });

  it("sends nothing when the draft only just arrived from the server", () => {
    renderHook(() => useTierListAutosave(LIST_ID));
    loadBoard();

    settle();

    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it("clears the unsaved flag when the save lands", () => {
    renderHook(() => useTierListAutosave(LIST_ID));
    loadBoard();

    act(() => useTierListBuilderStore.getState().assign("card-1", 0));
    settle();

    expect(useTierListBuilderStore.getState().dirty).toBe(false);
  });

  it("keeps the board unsaved when a drag lands while the save is in flight", () => {
    let finish: (() => void) | undefined;
    mutation.mutate.mockImplementationOnce((_body, options) => {
      finish = () => options?.onSuccess?.();
    });
    renderHook(() => useTierListAutosave(LIST_ID));
    loadBoard();

    act(() => useTierListBuilderStore.getState().assign("card-1", 0));
    settle();
    act(() => useTierListBuilderStore.getState().assign("card-2", 1));
    act(() => finish?.());

    expect(useTierListBuilderStore.getState().dirty).toBe(true);
  });

  it("ignores a draft that belongs to another list", () => {
    renderHook(() => useTierListAutosave(LIST_ID));
    loadBoard("other-list");

    act(() => useTierListBuilderStore.getState().assign("card-1", 0));
    settle();

    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it("sends a queued save straight away when flushed", () => {
    const { result } = renderHook(() => useTierListAutosave(LIST_ID));
    loadBoard();

    act(() => useTierListBuilderStore.getState().assign("card-1", 0));
    act(() => result.current.flush());

    expect(mutation.mutate).toHaveBeenCalledTimes(1);
    expect(lastSavedRows()?.[0]?.cards).toHaveLength(1);
  });

  it("flushes on unmount with the board as it was when the save was queued", () => {
    const { unmount } = renderHook(() => useTierListAutosave(LIST_ID));
    loadBoard();

    act(() => useTierListBuilderStore.getState().assign("card-1", 0));
    act(() => useTierListBuilderStore.getState().reset());
    unmount();

    expect(mutation.mutate).toHaveBeenCalledTimes(1);
    expect(lastSavedRows()?.[0]?.cards).toEqual([{ cardId: "card-1", printingId: null }]);
  });

  it("reports the board as saving until the server has it", () => {
    const { result } = renderHook(() => useTierListAutosave(LIST_ID));
    loadBoard();
    expect(result.current.saving).toBe(false);

    act(() => useTierListBuilderStore.getState().assign("card-1", 0));
    expect(result.current.saving).toBe(true);

    settle();
    expect(result.current.saving).toBe(false);
  });
});
