import { describe, expect, it } from "vitest";

import { createsCycle } from "./deck-lineage.js";

const family = [
  { id: "root", predecessorDeckId: null },
  { id: "middle", predecessorDeckId: "root" },
  { id: "leaf", predecessorDeckId: "middle" },
  { id: "loner", predecessorDeckId: null },
];

describe("createsCycle", () => {
  it("allows pointing at an unrelated member", () => {
    expect(createsCycle(family, "loner", "leaf")).toBe(false);
  });

  it("allows pointing at an ancestor's ancestor", () => {
    expect(createsCycle(family, "leaf", "root")).toBe(false);
  });

  it("rejects pointing at a direct descendant", () => {
    expect(createsCycle(family, "root", "middle")).toBe(true);
  });

  it("rejects pointing at a deeper descendant", () => {
    expect(createsCycle(family, "root", "leaf")).toBe(true);
  });

  it("treats an unknown predecessor as no lineage at all", () => {
    expect(createsCycle(family, "root", "missing")).toBe(false);
  });

  it("terminates on a family that already holds a loop", () => {
    const looped = [
      { id: "a", predecessorDeckId: "b" },
      { id: "b", predecessorDeckId: "a" },
      { id: "c", predecessorDeckId: null },
    ];
    expect(createsCycle(looped, "c", "a")).toBe(false);
  });
});
