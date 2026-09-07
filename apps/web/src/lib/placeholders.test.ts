import { afterEach, describe, expect, it, vi } from "vitest";

import { randomEmailPlaceholder } from "./placeholders";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("randomEmailPlaceholder", () => {
  it("picks the first name when the roll is 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(randomEmailPlaceholder()).toBe("nice.pulls@openrift.app");
  });

  it("picks the last name when the roll is just under 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);

    expect(randomEmailPlaceholder()).toBe("sleeve.first.ask.later@openrift.app");
  });

  it("always returns a dotted local part on the openrift.app domain", () => {
    for (let i = 0; i < 200; i++) {
      expect(randomEmailPlaceholder()).toMatch(/^[a-z]+(?:\.[a-z]+)*@openrift\.app$/u);
    }
  });

  it("varies across calls", () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomEmailPlaceholder()));

    expect(seen.size).toBeGreaterThan(1);
  });
});
