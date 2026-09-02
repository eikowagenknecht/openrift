import { describe, expect, it } from "vitest";

import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it("renders sub-second spans in milliseconds", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("renders sub-minute spans in whole seconds", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(1499)).toBe("1s");
    expect(formatDuration(1500)).toBe("2s");
    expect(formatDuration(59_000)).toBe("59s");
  });

  it("renders a minute with no remainder as minutes alone", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(120_000)).toBe("2m");
  });

  it("appends the seconds remainder past a minute", () => {
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(3_723_000)).toBe("62m 3s");
  });
});
