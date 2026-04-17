import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useCardSelection } from "./use-card-selection";

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
});
