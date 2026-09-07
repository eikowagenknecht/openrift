import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useLibraryToggle, useLibraryToggleStore } from "./library-toggle-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useLibraryToggleStore);
});

afterEach(() => {
  resetStore();
});

describe("useLibraryToggleStore", () => {
  it("starts with the library hidden on every surface", () => {
    expect(useLibraryToggleStore.getState().showLibrary).toEqual({
      collection: false,
      list: false,
    });
  });

  it("sets one scope without touching the other", () => {
    useLibraryToggleStore.getState().setShowLibrary("collection", true);

    expect(useLibraryToggleStore.getState().showLibrary).toEqual({
      collection: true,
      list: false,
    });
  });

  it("resets every scope", () => {
    useLibraryToggleStore.getState().setShowLibrary("collection", true);
    useLibraryToggleStore.getState().setShowLibrary("list", true);

    useLibraryToggleStore.getState().reset();

    expect(useLibraryToggleStore.getState().showLibrary).toEqual({
      collection: false,
      list: false,
    });
  });
});

describe("useLibraryToggle", () => {
  it("seeds from the entries-only default", () => {
    const { result } = renderHook(() => useLibraryToggle("collection"));

    expect(result.current[0]).toBe(false);
  });

  it("mirrors local changes into the store", () => {
    const { result } = renderHook(() => useLibraryToggle("collection"));

    act(() => result.current[1](true));

    expect(result.current[0]).toBe(true);
    expect(useLibraryToggleStore.getState().showLibrary.collection).toBe(true);
  });

  it("keeps the toggle on across a remount (switching collections)", () => {
    const first = renderHook(() => useLibraryToggle("collection"));
    act(() => first.result.current[1](true));
    first.unmount();

    const second = renderHook(() => useLibraryToggle("collection"));

    expect(second.result.current[0]).toBe(true);
  });

  it("keeps the toggle off across a remount when it was never turned on", () => {
    const first = renderHook(() => useLibraryToggle("collection"));
    act(() => first.result.current[1](true));
    act(() => first.result.current[1](false));
    first.unmount();

    const second = renderHook(() => useLibraryToggle("collection"));

    expect(second.result.current[0]).toBe(false);
  });

  it("keeps collection and list scopes independent", () => {
    const collection = renderHook(() => useLibraryToggle("collection"));
    act(() => collection.result.current[1](true));

    const list = renderHook(() => useLibraryToggle("list"));

    expect(list.result.current[0]).toBe(false);
    expect(collection.result.current[0]).toBe(true);
  });

  it("supports functional updates", () => {
    const { result } = renderHook(() => useLibraryToggle("list"));

    act(() => result.current[1]((prev) => !prev));

    expect(result.current[0]).toBe(true);
    expect(useLibraryToggleStore.getState().showLibrary.list).toBe(true);
  });
});
