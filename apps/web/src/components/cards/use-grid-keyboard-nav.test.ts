import type { Printing } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { useSelectionStore } from "@/stores/selection-store";
import { createStoreResetter } from "@/test/store-helpers";

import { useGridKeyboardNav } from "./use-grid-keyboard-nav";

const p1 = { id: "p1", cardId: "c1" } as Printing;
const p2 = { id: "p2", cardId: "c2" } as Printing;

const items: CardViewerItem[] = [
  { id: p1.id, printing: p1 },
  { id: p2.id, printing: p2 },
];

let resetSelection: () => void;
let resetActions: () => void;
let resetAddMode: () => void;

beforeEach(() => {
  resetSelection = createStoreResetter(useSelectionStore);
  resetActions = createStoreResetter(useCardRowActionsStore);
  resetAddMode = createStoreResetter(useAddModeStore);
});

afterEach(() => {
  resetSelection();
  resetActions();
  resetAddMode();
  document.body.replaceChildren();
});

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, cancelable: true, ...init });
  globalThis.dispatchEvent(event);
  return event;
}

describe("useGridKeyboardNav: +/-", () => {
  it("`+` dispatches onIncrement for the selected card", () => {
    const onIncrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers("collection", { onIncrement });
    useSelectionStore.getState().selectCard(p1, items, "printing");

    renderHook(() => useGridKeyboardNav({ items }));
    const event = press("+");

    expect(onIncrement).toHaveBeenCalledWith(p1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("`=` is a no-shift alias for `+`", () => {
    const onIncrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers("collection", { onIncrement });
    useSelectionStore.getState().selectCard(p1, items, "printing");

    renderHook(() => useGridKeyboardNav({ items }));
    const event = press("=");

    expect(onIncrement).toHaveBeenCalledWith(p1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("`-` dispatches onDecrement for the selected card, anchored to its tile", () => {
    const onDecrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers("collection", { onDecrement });
    useSelectionStore.getState().selectCard(p2, items, "printing");

    // Mock the tile in the DOM so the anchor lookup succeeds — mirrors
    // CardThumbnail's `data-printing-id`.
    const tile = document.createElement("div");
    tile.dataset.printingId = p2.id;
    document.body.append(tile);

    renderHook(() => useGridKeyboardNav({ items }));
    press("-");

    expect(onDecrement).toHaveBeenCalledWith(p2, tile);
  });

  it("`-` passes undefined anchor when the tile element isn't in the DOM", () => {
    const onDecrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers("collection", { onDecrement });
    useSelectionStore.getState().selectCard(p1, items, "printing");

    renderHook(() => useGridKeyboardNav({ items }));
    press("-");

    expect(onDecrement).toHaveBeenCalledWith(p1, undefined);
  });

  it("skips +/- while the variant popover is open", () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers("collection", { onIncrement, onDecrement });
    useSelectionStore.getState().selectCard(p1, items, "printing");
    useAddModeStore.getState().openVariants(p1.cardId, document.createElement("div"), "add");

    renderHook(() => useGridKeyboardNav({ items }));
    press("+");
    press("-");

    expect(onIncrement).not.toHaveBeenCalled();
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it("does nothing when no card is selected", () => {
    const onIncrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers("collection", { onIncrement });

    renderHook(() => useGridKeyboardNav({ items }));
    const event = press("+");

    expect(onIncrement).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does nothing when add-mode handler is not registered", () => {
    useSelectionStore.getState().selectCard(p1, items, "printing");

    renderHook(() => useGridKeyboardNav({ items }));
    const event = press("+");

    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores Ctrl/Meta `+` / `-` so browser zoom still works", () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers("collection", { onIncrement, onDecrement });
    useSelectionStore.getState().selectCard(p1, items, "printing");

    renderHook(() => useGridKeyboardNav({ items }));
    press("+", { ctrlKey: true });
    press("-", { metaKey: true });

    expect(onIncrement).not.toHaveBeenCalled();
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it("ignores `+` / `-` while typing in an input", () => {
    const onIncrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers("collection", { onIncrement });
    useSelectionStore.getState().selectCard(p1, items, "printing");

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    renderHook(() => useGridKeyboardNav({ items }));
    press("+");

    expect(onIncrement).not.toHaveBeenCalled();
    input.remove();
  });
});
