import { describe, expect, it } from "vitest";

import { extractDigestWatermark, isTradeMatchDigestNoop } from "./trade-match-digest.js";

describe("extractDigestWatermark", () => {
  it("reads a valid ISO timestamp from the stored result", () => {
    const iso = "2026-06-17T08:00:00.000Z";
    const watermark = extractDigestWatermark({ lastRunAt: iso });
    expect(watermark).toEqual(new Date(iso));
  });

  it("returns null when there is no prior result", () => {
    expect(extractDigestWatermark(null)).toBeNull();
    expect(extractDigestWatermark(undefined)).toBeNull();
  });

  it("returns null when the result lacks a usable lastRunAt", () => {
    expect(extractDigestWatermark({})).toBeNull();
    expect(extractDigestWatermark({ lastRunAt: 12_345 })).toBeNull();
    expect(extractDigestWatermark({ lastRunAt: "not-a-date" })).toBeNull();
    expect(extractDigestWatermark("string")).toBeNull();
  });
});

describe("isTradeMatchDigestNoop", () => {
  it("is a no-op when no recipient was emailed and no match was included", () => {
    expect(isTradeMatchDigestNoop({ recipients: 0, emailsSent: 0, matches: 0 })).toBe(true);
  });

  it("did work when at least one digest email went out", () => {
    expect(isTradeMatchDigestNoop({ recipients: 4, emailsSent: 2, matches: 9 })).toBe(false);
  });
});
