import type { Printing } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import {
  dispatchContextAction,
  dispatchExcludeFromRule,
  dispatchMoveCopyToCollection,
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
    expect(useCardRowActionsStore.getState().owner).toBeNull();
  });

  it("setHandlers records the owning surface alongside the handlers", () => {
    const onRowClick = vi.fn();
    useCardRowActionsStore.getState().setHandlers("catalog", { onRowClick });

    expect(useCardRowActionsStore.getState().owner).toBe("catalog");
    useCardRowActionsStore.getState().handlers.onRowClick?.(printing);
    expect(onRowClick).toHaveBeenCalledWith(printing);
  });

  it("setHandlers replaces (not merges) prior handlers", () => {
    const first = vi.fn();
    const second = vi.fn();
    useCardRowActionsStore.getState().setHandlers("catalog", { onRowClick: first });
    useCardRowActionsStore.getState().setHandlers("collection", { onIncrement: second });

    expect(useCardRowActionsStore.getState().handlers.onRowClick).toBeUndefined();
    useCardRowActionsStore.getState().handlers.onIncrement?.(printing);
    expect(second).toHaveBeenCalledWith(printing);
  });

  it("clearHandlers empties the slot for the surface that owns it", () => {
    useCardRowActionsStore.getState().setHandlers("list", { onRowClick: vi.fn() });
    useCardRowActionsStore.getState().clearHandlers("list");

    expect(useCardRowActionsStore.getState().owner).toBeNull();
    expect(useCardRowActionsStore.getState().handlers).toEqual({});
  });

  it("clearHandlers from a surface that no longer owns the slot is a no-op", () => {
    // React mounts the incoming surface before running the outgoing one's
    // cleanup, so an unconditional clear would wipe a registration that had
    // already been replaced and leave every row inert.
    const successor = vi.fn();
    useCardRowActionsStore.getState().setHandlers("catalog", { onRowClick: vi.fn() });
    useCardRowActionsStore.getState().setHandlers("collection", { onRowClick: successor });

    useCardRowActionsStore.getState().clearHandlers("catalog");

    expect(useCardRowActionsStore.getState().owner).toBe("collection");
    useCardRowActionsStore.getState().handlers.onRowClick?.(printing);
    expect(successor).toHaveBeenCalledWith(printing);
  });

  it("undefined handlers are a no-op without throwing", () => {
    expect(() => {
      useCardRowActionsStore.getState().handlers.onIncrement?.(printing);
    }).not.toThrow();
  });

  it("dispatchContextAction forwards the itemId and action to the registered handler", () => {
    const onContextAction = vi.fn();
    useCardRowActionsStore.getState().setHandlers("collection", { onContextAction });
    dispatchContextAction("item-1", "dispose");
    expect(onContextAction).toHaveBeenCalledWith("item-1", "dispose", undefined);
  });

  it("dispatchContextAction forwards the displayed printing for printing-scoped actions", () => {
    const onContextAction = vi.fn();
    useCardRowActionsStore.getState().setHandlers("collection", { onContextAction });
    const foilPrinting = stubPrinting({ id: "p-foil" });
    dispatchContextAction("item-1", "lend", foilPrinting);
    expect(onContextAction).toHaveBeenCalledWith("item-1", "lend", foilPrinting);
  });

  it("dispatchContextAction is a no-op when no handler is registered", () => {
    expect(() => dispatchContextAction("item-1", "move")).not.toThrow();
  });

  it("dispatchExcludeFromRule forwards the target to the registered handler", () => {
    const onExcludeFromRule = vi.fn();
    useCardRowActionsStore.getState().setHandlers("list", { onExcludeFromRule });
    dispatchExcludeFromRule({ kind: "card", cardId: "card-1" });
    expect(onExcludeFromRule).toHaveBeenCalledWith({ kind: "card", cardId: "card-1" });
  });

  it("dispatchExcludeFromRule is a no-op when no handler is registered", () => {
    expect(() => dispatchExcludeFromRule({ kind: "copy", copyId: "copy-1" })).not.toThrow();
  });

  it("dispatchMoveCopyToCollection forwards the copy id to the registered handler", () => {
    const onMoveCopyToCollection = vi.fn();
    useCardRowActionsStore.getState().setHandlers("list", { onMoveCopyToCollection });
    dispatchMoveCopyToCollection("copy-1");
    expect(onMoveCopyToCollection).toHaveBeenCalledWith("copy-1");
  });

  it("dispatchMoveCopyToCollection is a no-op when no handler is registered", () => {
    expect(() => dispatchMoveCopyToCollection("copy-1")).not.toThrow();
  });
});
