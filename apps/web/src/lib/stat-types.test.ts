import type { Domain } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { comboKey, sortCombos } from "./stat-types";

const DOMAIN_ORDER: Domain[] = ["fury", "calm", "mind", "body", "chaos", "order", "colorless"];

describe("comboKey", () => {
  it("returns a single domain as-is", () => {
    expect(comboKey(["fury"], DOMAIN_ORDER)).toBe("fury");
  });

  it("sorts multi-domain combos by canonical order", () => {
    expect(comboKey(["mind", "fury"], DOMAIN_ORDER)).toBe("fury+mind");
    expect(comboKey(["order", "chaos"], DOMAIN_ORDER)).toBe("chaos+order");
  });

  it("handles three domains", () => {
    expect(comboKey(["body", "fury", "calm"], DOMAIN_ORDER)).toBe("fury+calm+body");
  });
});

describe("sortCombos", () => {
  it("returns empty array for empty set", () => {
    expect(sortCombos(new Set(), DOMAIN_ORDER)).toEqual([]);
  });

  it("sorts single-domain combos by canonical order", () => {
    const combos = sortCombos(new Set(["mind", "fury", "calm"]), DOMAIN_ORDER);
    expect(combos.map((combo) => combo.key)).toEqual(["fury", "calm", "mind"]);
  });

  it("includes domain arrays in results", () => {
    const combos = sortCombos(new Set(["fury+mind"]), DOMAIN_ORDER);
    expect(combos).toEqual([{ key: "fury+mind", domains: ["fury", "mind"] }]);
  });

  it("sorts singles before multi-domain at same average position", () => {
    // Fury is at index 0, Calm is at index 1, fury+calm average = 0.5
    // So Fury (0) comes before fury+calm (0.5) which comes before Calm (1)
    const combos = sortCombos(new Set(["calm", "fury", "fury+calm"]), DOMAIN_ORDER);
    expect(combos.map((combo) => combo.key)).toEqual(["fury", "fury+calm", "calm"]);
  });

  it("interleaves combos by average domain position", () => {
    const combos = sortCombos(new Set(["chaos", "fury", "fury+mind"]), DOMAIN_ORDER);
    // Fury = 0, Fury+Mind avg = (0+2)/2 = 1, Chaos = 4
    expect(combos.map((combo) => combo.key)).toEqual(["fury", "fury+mind", "chaos"]);
  });
});
