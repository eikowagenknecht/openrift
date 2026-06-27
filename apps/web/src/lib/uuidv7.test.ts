import { afterEach, describe, expect, it, vi } from "vitest";

import { uuidv7 } from "./uuidv7";

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

afterEach(() => {
  vi.useRealTimers();
});

describe("uuidv7", () => {
  it("produces the RFC 9562 v7 format (version and variant bits)", () => {
    const id = uuidv7();
    expect(id).toMatch(UUID_V7_PATTERN);
  });

  it("encodes the current unix-millisecond timestamp in the first 48 bits", () => {
    vi.useFakeTimers();
    const at = 1_750_000_000_000;
    vi.setSystemTime(at);

    const id = uuidv7();
    const timestampHex = id.slice(0, 8) + id.slice(9, 13);
    expect(Number.parseInt(timestampHex, 16)).toBe(at);
  });

  it("sorts lexicographically by generation time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_750_000_000_000);
    const earlier = uuidv7();
    vi.setSystemTime(1_750_000_000_001);
    const later = uuidv7();

    expect(earlier.localeCompare(later)).toBeLessThan(0);
  });

  it("does not collide across many generations in the same millisecond", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_750_000_000_000);
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(ids.size).toBe(1000);
  });
});
