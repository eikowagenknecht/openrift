import type { Printing } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardViewerItem } from "@/components/card-viewer-types";
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

beforeEach(() => {
  resetSelection = createStoreResetter(useSelectionStore);
  resetActions = createStoreResetter(useCardRowActionsStore);
});

afterEach(() => {
  resetSelection();
  resetActions();
});

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, cancelable: true, ...init });
  globalThis.dispatchEvent(event);
  return event;
}

describe("useGridKeyboardNav: +/-", () => {
  it("`+` dispatches onIncrement for the selected card", () => {
    const onIncrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers({ onIncrement });
    useSelectionStore.getState().selectCard(p1, items, "printing");

    renderHook(() => useGridKeyboardNav({ items }));
    const event = press("+");

    expect(onIncrement).toHaveBeenCalledWith(p1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("`-` dispatches onDecrement for the selected card", () => {
    const onDecrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers({ onDecrement });
    useSelectionStore.getState().selectCard(p2, items, "printing");

    renderHook(() => useGridKeyboardNav({ items }));
    press("-");

    expect(onDecrement).toHaveBeenCalledWith(p2);
  });

  it("does nothing when no card is selected", () => {
    const onIncrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers({ onIncrement });

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
    useCardRowActionsStore.getState().setHandlers({ onIncrement, onDecrement });
    useSelectionStore.getState().selectCard(p1, items, "printing");

    renderHook(() => useGridKeyboardNav({ items }));
    press("+", { ctrlKey: true });
    press("-", { metaKey: true });

    expect(onIncrement).not.toHaveBeenCalled();
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it("ignores `+` / `-` while typing in an input", () => {
    const onIncrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers({ onIncrement });
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
