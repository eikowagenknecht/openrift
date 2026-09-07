import { describe, expect, it } from "vitest";

import { DEFAULT_DOMAIN_COLORS, DOMAIN_COLOR_FALLBACK } from "./domain-colors.js";

describe("DEFAULT_DOMAIN_COLORS", () => {
  it("covers the six domains plus colorless", () => {
    expect(Object.keys(DEFAULT_DOMAIN_COLORS).toSorted()).toEqual([
      "body",
      "calm",
      "chaos",
      "colorless",
      "fury",
      "mind",
      "order",
    ]);
  });

  it("gives every domain a six-digit hex colour", () => {
    for (const color of Object.values(DEFAULT_DOMAIN_COLORS)) {
      expect(color).toMatch(/^#[\dA-F]{6}$/u);
    }
  });

  it("gives each coloured domain a distinct colour", () => {
    const colored = Object.entries(DEFAULT_DOMAIN_COLORS)
      .filter(([slug]) => slug !== "colorless")
      .map(([, color]) => color);
    expect(new Set(colored).size).toBe(colored.length);
  });

  it("uses the fallback grey for colorless", () => {
    expect(DEFAULT_DOMAIN_COLORS.colorless).toBe(DOMAIN_COLOR_FALLBACK);
  });
});
