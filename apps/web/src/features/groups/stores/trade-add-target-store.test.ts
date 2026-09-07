import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useTradeAddTargetStore } from "./trade-add-target-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useTradeAddTargetStore);
});

afterEach(() => {
  resetStore();
});

describe("useTradeAddTargetStore", () => {
  it("starts with no remembered target", () => {
    expect(useTradeAddTargetStore.getState().target).toBeNull();
  });

  it("remembers the picked collection", () => {
    useTradeAddTargetStore.getState().setTarget({ id: "col-1", name: "Trade binder" });
    expect(useTradeAddTargetStore.getState().target).toEqual({
      id: "col-1",
      name: "Trade binder",
    });
  });

  it("replaces an earlier choice", () => {
    const store = useTradeAddTargetStore.getState();
    store.setTarget({ id: "col-1", name: "Trade binder" });
    store.setTarget({ id: "col-2", name: "Shoebox" });
    expect(useTradeAddTargetStore.getState().target).toEqual({ id: "col-2", name: "Shoebox" });
  });

  it("clears back to the inbox default", () => {
    const store = useTradeAddTargetStore.getState();
    store.setTarget({ id: "col-1", name: "Trade binder" });
    store.setTarget(null);
    expect(useTradeAddTargetStore.getState().target).toBeNull();
  });

  describe("merge", () => {
    const merge = useTradeAddTargetStore.persist.getOptions().merge;

    function mergeInto(persisted: unknown): { target: unknown } {
      return merge?.(persisted, useTradeAddTargetStore.getState()) as { target: unknown };
    }

    it("restores a well-formed target", () => {
      expect(mergeInto({ target: { id: "col-1", name: "Trade binder" } }).target).toEqual({
        id: "col-1",
        name: "Trade binder",
      });
    });

    it("drops a target missing its name", () => {
      expect(mergeInto({ target: { id: "col-1" } }).target).toBeNull();
    });

    it("drops a non-object target", () => {
      expect(mergeInto({ target: "col-1" }).target).toBeNull();
    });

    it("survives an empty or absent blob", () => {
      expect(mergeInto({}).target).toBeNull();
      expect(mergeInto(null).target).toBeNull();
    });
  });
});
