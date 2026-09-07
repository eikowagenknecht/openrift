import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useTradeActionStore } from "./trade-action-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useTradeActionStore);
});

afterEach(() => {
  resetStore();
});

describe("useTradeActionStore", () => {
  it("starts empty", () => {
    const state = useTradeActionStore.getState();
    expect(state.pending.size).toBe(0);
    expect(state.optimisticStatus.size).toBe(0);
  });

  it("begin marks a trade in flight", () => {
    useTradeActionStore.getState().begin("trade-1");
    expect(useTradeActionStore.getState().pending.has("trade-1")).toBe(true);
    expect(useTradeActionStore.getState().optimisticStatus.has("trade-1")).toBe(false);
  });

  it("begin can record an optimistic status", () => {
    useTradeActionStore.getState().begin("trade-1", "reserved");
    expect(useTradeActionStore.getState().pending.has("trade-1")).toBe(true);
    expect(useTradeActionStore.getState().optimisticStatus.get("trade-1")).toBe("reserved");
  });

  it("settle clears both pending and optimistic state", () => {
    useTradeActionStore.getState().begin("trade-1", "reserved");
    useTradeActionStore.getState().settle("trade-1");
    expect(useTradeActionStore.getState().pending.has("trade-1")).toBe(false);
    expect(useTradeActionStore.getState().optimisticStatus.has("trade-1")).toBe(false);
  });

  it("tracks several trades independently", () => {
    useTradeActionStore.getState().begin("trade-1");
    useTradeActionStore.getState().begin("trade-2", "completed");
    useTradeActionStore.getState().settle("trade-1");
    const state = useTradeActionStore.getState();
    expect(state.pending.has("trade-1")).toBe(false);
    expect(state.pending.has("trade-2")).toBe(true);
    expect(state.optimisticStatus.get("trade-2")).toBe("completed");
  });

  it("builds a fresh Set/Map on change (so subscribers see a new reference)", () => {
    const before = useTradeActionStore.getState().pending;
    useTradeActionStore.getState().begin("trade-1");
    const after = useTradeActionStore.getState().pending;
    expect(after).not.toBe(before);
  });

  it("settle is a no-op (same state reference) when nothing was tracked", () => {
    const before = useTradeActionStore.getState();
    useTradeActionStore.getState().settle("unknown");
    expect(useTradeActionStore.getState()).toBe(before);
  });
});
