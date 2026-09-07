import { describe, expect, it } from "vitest";

import { isFlushPrintingEventsResult } from "./use-flush-printing-events";

describe("isFlushPrintingEventsResult", () => {
  it("accepts a normal flush summary", () => {
    expect(isFlushPrintingEventsResult({ sent: 3, failed: 0 })).toBe(true);
  });

  it("accepts a summary with optional failures detail", () => {
    expect(
      isFlushPrintingEventsResult({
        sent: 2,
        failed: 1,
        failures: [{ channel: "newPrintings", status: 500, detail: "oops" }],
      }),
    ).toBe(true);
  });

  it("rejects null, undefined, and primitives", () => {
    expect(isFlushPrintingEventsResult(null)).toBe(false);
    expect(isFlushPrintingEventsResult(undefined)).toBe(false);
    expect(isFlushPrintingEventsResult("done")).toBe(false);
    expect(isFlushPrintingEventsResult(7)).toBe(false);
  });

  it("rejects objects with missing or wrong-typed counts", () => {
    expect(isFlushPrintingEventsResult({ sent: 3 })).toBe(false);
    expect(isFlushPrintingEventsResult({ failed: 0 })).toBe(false);
    expect(isFlushPrintingEventsResult({ sent: "3", failed: 0 })).toBe(false);
    expect(isFlushPrintingEventsResult({})).toBe(false);
  });
});
