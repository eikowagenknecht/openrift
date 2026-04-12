import type { Domain } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { comboKey, sortCombos } from "./stat-types";

const DOMAIN_ORDER: Domain[] = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order", "Colorless"];

describe("comboKey", () => {
  it("returns a single domain as-is", () => {
    expect(comboKey(["Fury"], DOMAIN_ORDER)).toBe("Fury");
  });

  it("sorts multi-domain combos by canonical order", () => {
    expect(comboKey(["Mind", "Fury"], DOMAIN_ORDER)).toBe("Fury+Mind");
    expect(comboKey(["Order", "Chaos"], DOMAIN_ORDER)).toBe("Chaos+Order");
  });

  it("handles three domains", () => {
    expect(comboKey(["Body", "Fury", "Calm"], DOMAIN_ORDER)).toBe("Fury+Calm+Body");
  });
});

describe("sortCombos", () => {
  it("returns empty array for empty set", () => {
    expect(sortCombos(new Set(), DOMAIN_ORDER)).toEqual([]);
  });

  it("sorts single-domain combos by canonical order", () => {
    const combos = sortCombos(new Set(["Mind", "Fury", "Calm"]), DOMAIN_ORDER);
    expect(combos.map((combo) => combo.key)).toEqual(["Fury", "Calm", "Mind"]);
  });

  it("includes domain arrays in results", () => {
    const combos = sortCombos(new Set(["Fury+Mind"]), DOMAIN_ORDER);
    expect(combos).toEqual([{ key: "Fury+Mind", domains: ["Fury", "Mind"] }]);
  });

  it("sorts singles before multi-domain at same average position", () => {
    // Fury is at index 0, Calm is at index 1, Fury+Calm average = 0.5
    // So Fury (0) comes before Fury+Calm (0.5) which comes before Calm (1)
    const combos = sortCombos(new Set(["Calm", "Fury", "Fury+Calm"]), DOMAIN_ORDER);
    expect(combos.map((combo) => combo.key)).toEqual(["Fury", "Fury+Calm", "Calm"]);
  });

  it("interleaves combos by average domain position", () => {
    const combos = sortCombos(new Set(["Chaos", "Fury", "Fury+Mind"]), DOMAIN_ORDER);
    // Fury = 0, Fury+Mind avg = (0+2)/2 = 1, Chaos = 4
    expect(combos.map((combo) => combo.key)).toEqual(["Fury", "Fury+Mind", "Chaos"]);
  });
});
