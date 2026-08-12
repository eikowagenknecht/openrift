import { describe, expect, it } from "vitest";

import { orderSetsMainFirst, setIndexById } from "./set-order.js";

describe("orderSetsMainFirst", () => {
  it("moves main sets ahead of supplemental ones", () => {
    const sets = [
      { id: "supp-1", setType: "supplemental" as const },
      { id: "main-1", setType: "main" as const },
    ];
    expect(orderSetsMainFirst(sets).map((set) => set.id)).toEqual(["main-1", "supp-1"]);
  });

  it("preserves source (release) order within each set type (stable sort)", () => {
    const sets = [
      { id: "supp-1", setType: "supplemental" as const },
      { id: "main-1", setType: "main" as const },
      { id: "supp-2", setType: "supplemental" as const },
      { id: "main-2", setType: "main" as const },
    ];
    expect(orderSetsMainFirst(sets).map((set) => set.id)).toEqual([
      "main-1",
      "main-2",
      "supp-1",
      "supp-2",
    ]);
  });

  it("leaves an already-ordered list unchanged", () => {
    const sets = [
      { id: "main-1", setType: "main" as const },
      { id: "supp-1", setType: "supplemental" as const },
    ];
    expect(orderSetsMainFirst(sets).map((set) => set.id)).toEqual(["main-1", "supp-1"]);
  });

  it("does not mutate the input array", () => {
    const sets = [
      { id: "supp-1", setType: "supplemental" as const },
      { id: "main-1", setType: "main" as const },
    ];
    orderSetsMainFirst(sets);
    expect(sets.map((set) => set.id)).toEqual(["supp-1", "main-1"]);
  });

  it("treats sets with no setType as a single group, preserving their order", () => {
    const sets: { id: string; setType?: "main" | "supplemental" }[] = [
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ];
    expect(orderSetsMainFirst(sets).map((set) => set.id)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array unchanged", () => {
    expect(orderSetsMainFirst([])).toEqual([]);
  });
});

describe("setIndexById", () => {
  it("indexes sets main-first, in catalog order within each type", () => {
    const indexes = setIndexById([
      { id: "promo", setType: "supplemental" },
      { id: "origins", setType: "main" },
      { id: "sands", setType: "main" },
    ]);
    expect(indexes.get("origins")).toBe(0);
    expect(indexes.get("sands")).toBe(1);
    expect(indexes.get("promo")).toBe(2);
  });

  it("has no entry for an unknown set", () => {
    expect(setIndexById([{ id: "origins", setType: "main" }]).get("nope")).toBeUndefined();
  });

  it("indexes sets with no setType in source order", () => {
    const indexes = setIndexById([{ id: "a" }, { id: "b" }]);
    expect(indexes.get("a")).toBe(0);
    expect(indexes.get("b")).toBe(1);
  });

  it("returns an empty lookup for no sets", () => {
    expect(setIndexById([]).size).toBe(0);
  });
});
