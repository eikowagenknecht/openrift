import { describe, expect, it } from "vitest";

import { orderSetsMainFirst } from "./set-order";

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
