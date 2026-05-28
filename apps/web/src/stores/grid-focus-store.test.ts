import { beforeEach, describe, expect, it } from "vitest";

import { useGridFocusStore } from "./grid-focus-store";

beforeEach(() => {
  useGridFocusStore.setState({ selectedItemId: null, flashCardId: null });
});

describe("useGridFocusStore", () => {
  it("starts with both fields null", () => {
    const state = useGridFocusStore.getState();
    expect(state.selectedItemId).toBeNull();
    expect(state.flashCardId).toBeNull();
  });

  it("setSelectedItemId updates only that field", () => {
    useGridFocusStore.getState().setSelectedItemId("item-1");
    const state = useGridFocusStore.getState();
    expect(state.selectedItemId).toBe("item-1");
    expect(state.flashCardId).toBeNull();
  });

  it("setFlashCardId updates only that field", () => {
    useGridFocusStore.getState().setFlashCardId("card-1");
    const state = useGridFocusStore.getState();
    expect(state.flashCardId).toBe("card-1");
    expect(state.selectedItemId).toBeNull();
  });

  it("setting the same selectedItemId yields an identity-equal value via getState", () => {
    useGridFocusStore.getState().setSelectedItemId("item-1");
    const first = useGridFocusStore.getState().selectedItemId;
    useGridFocusStore.getState().setSelectedItemId("item-1");
    const second = useGridFocusStore.getState().selectedItemId;
    expect(second).toBe(first);
  });

  it("clearing selectedItemId sets it back to null without affecting flashCardId", () => {
    useGridFocusStore.getState().setSelectedItemId("item-1");
    useGridFocusStore.getState().setFlashCardId("card-1");
    useGridFocusStore.getState().setSelectedItemId(null);
    const state = useGridFocusStore.getState();
    expect(state.selectedItemId).toBeNull();
    expect(state.flashCardId).toBe("card-1");
  });
});
