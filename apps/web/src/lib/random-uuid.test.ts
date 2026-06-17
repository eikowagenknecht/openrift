import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { randomUuid } from "./random-uuid";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe("randomUuid", () => {
  const originalRandomUUID = crypto.randomUUID;

  afterEach(() => {
    // Restore the native method spied/removed in individual tests.
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      writable: true,
      value: originalRandomUUID,
    });
    vi.restoreAllMocks();
  });

  it("returns a v4 UUID using the native crypto.randomUUID when available", () => {
    const spy = vi.spyOn(crypto, "randomUUID");
    const id = randomUuid();
    expect(spy).toHaveBeenCalledOnce();
    expect(id).toMatch(UUID_V4_REGEX);
  });

  describe("when crypto.randomUUID is unavailable (insecure context / old Safari)", () => {
    beforeEach(() => {
      // Simulate a non-secure context where randomUUID is not a function.
      Object.defineProperty(crypto, "randomUUID", {
        configurable: true,
        writable: true,
        value: undefined,
      });
    });

    it("falls back to getRandomValues and still returns a valid v4 UUID", () => {
      const spy = vi.spyOn(crypto, "getRandomValues");
      const id = randomUuid();
      expect(spy).toHaveBeenCalled();
      expect(id).toMatch(UUID_V4_REGEX);
    });

    it("produces distinct values across calls", () => {
      const ids = new Set(Array.from({ length: 100 }, () => randomUuid()));
      expect(ids.size).toBe(100);
    });
  });
});
