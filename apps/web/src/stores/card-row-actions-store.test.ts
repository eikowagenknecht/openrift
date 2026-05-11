import type { Printing } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useCardRowActionsStore } from "./card-row-actions-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useCardRowActionsStore);
});

afterEach(() => {
  resetStore();
});

const printing = { id: "p1" } as Printing;

describe("useCardRowActionsStore", () => {
  it("starts with no handlers registered", () => {
    expect(useCardRowActionsStore.getState().handlers).toEqual({});
  });

  it("setHandlers replaces the handler slot", () => {
    const onRowClick = vi.fn();
    useCardRowActionsStore.getState().setHandlers({ onRowClick });
    useCardRowActionsStore.getState().handlers.onRowClick?.(printing);
    expect(onRowClick).toHaveBeenCalledWith(printing);
  });

  it("setHandlers replaces (not merges) prior handlers", () => {
    const first = vi.fn();
    const second = vi.fn();
    useCardRowActionsStore.getState().setHandlers({ onRowClick: first });
    useCardRowActionsStore.getState().setHandlers({ onIncrement: second });

    expect(useCardRowActionsStore.getState().handlers.onRowClick).toBeUndefined();
    useCardRowActionsStore.getState().handlers.onIncrement?.(printing);
    expect(second).toHaveBeenCalledWith(printing);
  });

  it("undefined handlers are a no-op without throwing", () => {
    expect(() => {
      useCardRowActionsStore.getState().handlers.onIncrement?.(printing);
    }).not.toThrow();
  });
});
