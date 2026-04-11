import { describe, expect, it } from "vitest";

import { EMOJIS, HEADINGS, pick, SUBTEXTS } from "./error-message";

describe("pick", () => {
  it("returns the same element for the same seed", () => {
    expect(pick(HEADINGS, "abc")).toBe(pick(HEADINGS, "abc"));
    expect(pick(EMOJIS, "xyz:emoji")).toBe(pick(EMOJIS, "xyz:emoji"));
  });

  it("distributes across the array for varied seeds", () => {
    const seeds = Array.from({ length: 200 }, (_, index) => `seed-${index}`);
    const picked = new Set(seeds.map((seed) => pick(SUBTEXTS, seed)));
    expect(picked.size).toBeGreaterThan(1);
  });

  it("handles empty-string seeds", () => {
    expect(pick(HEADINGS, "")).toBe(HEADINGS[0]);
  });

  it("handles non-ASCII seeds deterministically", () => {
    expect(pick(HEADINGS, "über 💥")).toBe(pick(HEADINGS, "über 💥"));
  });
});
