import type { Printing } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import {
  dispatchContextAction,
  dispatchExcludeFromRule,
  useCardRowActionsStore,
} from "./card-row-actions-store";

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

  it("dispatchContextAction forwards the itemId and action to the registered handler", () => {
    const onContextAction = vi.fn();
    useCardRowActionsStore.getState().setHandlers({ onContextAction });
    dispatchContextAction("item-1", "dispose");
    expect(onContextAction).toHaveBeenCalledWith("item-1", "dispose");
  });

  it("dispatchContextAction is a no-op when no handler is registered", () => {
    expect(() => dispatchContextAction("item-1", "move")).not.toThrow();
  });

  it("dispatchExcludeFromRule forwards the target to the registered handler", () => {
    const onExcludeFromRule = vi.fn();
    useCardRowActionsStore.getState().setHandlers({ onExcludeFromRule });
    dispatchExcludeFromRule({ kind: "card", cardId: "card-1" });
    expect(onExcludeFromRule).toHaveBeenCalledWith({ kind: "card", cardId: "card-1" });
  });

  it("dispatchExcludeFromRule is a no-op when no handler is registered", () => {
    expect(() => dispatchExcludeFromRule({ kind: "copy", copyId: "copy-1" })).not.toThrow();
  });
});
