import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { talliedCount, useTradeTallyStore } from "./trade-tally-store";

const reset = createStoreResetter(useTradeTallyStore);

beforeEach(reset);
afterEach(reset);

describe("useTradeTallyStore", () => {
  it("records how many of a trade turned up", () => {
    useTradeTallyStore.getState().setCount("trade-1", 2);
    expect(useTradeTallyStore.getState().counts).toEqual({ "trade-1": 2 });
  });

  it("keeps a count of zero, which is a real answer", () => {
    useTradeTallyStore.getState().setCount("trade-1", 0);
    expect(useTradeTallyStore.getState().counts).toEqual({ "trade-1": 0 });
  });

  it("overwrites a trade's earlier count", () => {
    useTradeTallyStore.getState().setCount("trade-1", 3);
    useTradeTallyStore.getState().setCount("trade-1", 1);
    expect(useTradeTallyStore.getState().counts).toEqual({ "trade-1": 1 });
  });

  it("clears one trade without touching the others", () => {
    useTradeTallyStore.getState().setCount("trade-1", 1);
    useTradeTallyStore.getState().setCount("trade-2", 2);
    useTradeTallyStore.getState().clearCount("trade-1");
    expect(useTradeTallyStore.getState().counts).toEqual({ "trade-2": 2 });
  });

  it("clears a batch, which is what settling them does", () => {
    useTradeTallyStore.getState().setCount("trade-1", 1);
    useTradeTallyStore.getState().setCount("trade-2", 2);
    useTradeTallyStore.getState().setCount("trade-3", 3);
    useTradeTallyStore.getState().clearCounts(["trade-1", "trade-3"]);
    expect(useTradeTallyStore.getState().counts).toEqual({ "trade-2": 2 });
  });

  it("ignores ids it was never given", () => {
    useTradeTallyStore.getState().setCount("trade-1", 1);
    useTradeTallyStore.getState().clearCounts(["nothing-like-it"]);
    expect(useTradeTallyStore.getState().counts).toEqual({ "trade-1": 1 });
  });

  it("starts empty", () => {
    expect(useTradeTallyStore.getState().counts).toEqual({});
  });
});

describe("talliedCount", () => {
  it("settles the whole row when it was never tallied", () => {
    expect(talliedCount({}, "trade-1", 3)).toBe(3);
  });

  it("settles what was tallied", () => {
    expect(talliedCount({ "trade-1": 1 }, "trade-1", 3)).toBe(1);
  });

  it("keeps a tallied zero", () => {
    expect(talliedCount({ "trade-1": 0 }, "trade-1", 3)).toBe(0);
  });

  it("caps a stale tally at what is left of the row", () => {
    expect(talliedCount({ "trade-1": 3 }, "trade-1", 2)).toBe(2);
  });
});
