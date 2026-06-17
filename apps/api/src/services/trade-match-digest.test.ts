import { describe, expect, it } from "vitest";

import { extractDigestWatermark } from "./trade-match-digest.js";

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
