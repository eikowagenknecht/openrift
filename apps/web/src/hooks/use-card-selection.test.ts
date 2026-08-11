import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useGridSelectionStore } from "@/stores/grid-selection-store";

import { useCardSelection } from "./use-card-selection";

beforeEach(() => {
  useGridSelectionStore.setState({ selected: new Set() });
});

describe("useCardSelection", () => {
  it("starts with an empty selection and no last-selected ID", () => {
    const { result } = renderHook(() => useCardSelection());
    expect(result.current.selected.size).toBe(0);
    expect(result.current.getLastSelectedItemId()).toBeNull();
  });

  it("toggleSelect adds then removes a copyId", () => {
    const { result } = renderHook(() => useCardSelection());
    act(() => result.current.toggleSelect("copy-1"));
    expect(result.current.selected.has("copy-1")).toBe(true);
    act(() => result.current.toggleSelect("copy-1"));
    expect(result.current.selected.has("copy-1")).toBe(false);
  });

  it("toggleStack selects all when none are selected, clears when all are selected", () => {
    const { result } = renderHook(() => useCardSelection());
    const ids = ["a", "b", "c"];

    act(() => result.current.toggleStack(ids));
    expect([...result.current.selected].toSorted()).toEqual(ids);

    act(() => result.current.toggleStack(ids));
    expect(result.current.selected.size).toBe(0);
  });

  it("toggleStack selects all when partially selected", () => {
    const { result } = renderHook(() => useCardSelection());
    act(() => result.current.toggleSelect("a"));
    act(() => result.current.toggleStack(["a", "b", "c"]));
    expect([...result.current.selected].toSorted()).toEqual(["a", "b", "c"]);
  });

  it("toggleSelectAll clears when everything is selected, selects all otherwise", () => {
    const { result } = renderHook(() => useCardSelection());
    const ids = ["a", "b", "c"];

    act(() => result.current.toggleSelectAll(ids));
    expect(result.current.selected.size).toBe(3);

    act(() => result.current.toggleSelectAll(ids));
    expect(result.current.selected.size).toBe(0);
  });

  it("addToSelection unions without removing existing IDs", () => {
    const { result } = renderHook(() => useCardSelection());
    act(() => result.current.toggleSelect("a"));
    act(() => result.current.addToSelection(["b", "c", "a"]));
    expect([...result.current.selected].toSorted()).toEqual(["a", "b", "c"]);
  });

  it("addToSelection with an empty list is a no-op", () => {
    const { result } = renderHook(() => useCardSelection());
    act(() => result.current.toggleSelect("a"));
    act(() => result.current.addToSelection([]));
    expect([...result.current.selected]).toEqual(["a"]);
  });

  it("clearSelection resets selection and the last-selected ID", () => {
    const { result } = renderHook(() => useCardSelection());
    act(() => result.current.toggleSelect("a"));
    act(() => result.current.setLastSelectedItemId("item-1"));
    expect(result.current.getLastSelectedItemId()).toBe("item-1");

    act(() => result.current.clearSelection());
    expect(result.current.selected.size).toBe(0);
    expect(result.current.getLastSelectedItemId()).toBeNull();
  });

  it("getLastSelectedItemId returns the latest value set via setLastSelectedItemId", () => {
    const { result } = renderHook(() => useCardSelection());
    act(() => result.current.setLastSelectedItemId("item-1"));
    expect(result.current.getLastSelectedItemId()).toBe("item-1");
    act(() => result.current.setLastSelectedItemId("item-2"));
    expect(result.current.getLastSelectedItemId()).toBe("item-2");
  });

  it("setLastSelectedItemId does not trigger a re-render (ref-backed)", () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useCardSelection();
    });
    const before = renderCount;
    act(() => result.current.setLastSelectedItemId("item-1"));
    expect(renderCount).toBe(before);
    expect(result.current.getLastSelectedItemId()).toBe("item-1");
  });

  // Regression: optimistic rows from useBatchedAddCopies live in the grid
  // with a `temp-` prefixed id until the add API returns. Selecting one and
  // disposing/moving used to 400 the API with an invalid uuid. The hook now
  // drops temp ids at every entry point.
  describe("temp copy ids are excluded from selection", () => {
    it("toggleSelect ignores a temp id", () => {
      const { result } = renderHook(() => useCardSelection());
      act(() => result.current.toggleSelect("temp-abc"));
      expect(result.current.selected.size).toBe(0);
    });

    it("toggleStack only selects the real ids in the stack", () => {
      const { result } = renderHook(() => useCardSelection());
      act(() => result.current.toggleStack(["a", "temp-b", "c"]));
      expect([...result.current.selected].toSorted()).toEqual(["a", "c"]);
    });

    it("toggleStack with only temp ids is a no-op", () => {
      const { result } = renderHook(() => useCardSelection());
      act(() => result.current.toggleSelect("real"));
      act(() => result.current.toggleStack(["temp-a", "temp-b"]));
      expect([...result.current.selected]).toEqual(["real"]);
    });

    it("toggleSelectAll filters temp ids out", () => {
      const { result } = renderHook(() => useCardSelection());
      act(() => result.current.toggleSelectAll(["a", "temp-b", "c"]));
      expect([...result.current.selected].toSorted()).toEqual(["a", "c"]);
    });

    it("addToSelection filters temp ids out", () => {
      const { result } = renderHook(() => useCardSelection());
      act(() => result.current.addToSelection(["a", "temp-b", "c"]));
      expect([...result.current.selected].toSorted()).toEqual(["a", "c"]);
    });
  });
});
