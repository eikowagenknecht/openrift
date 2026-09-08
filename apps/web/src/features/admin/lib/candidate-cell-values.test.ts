import { describe, expect, it } from "vitest";

import { formatValue, hasValue } from "./candidate-cell-values";

describe("hasValue", () => {
  it("rejects null, undefined and the empty string", () => {
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
    expect(hasValue("")).toBe(false);
  });

  it("rejects an empty array but accepts a filled one", () => {
    expect(hasValue([])).toBe(false);
    expect(hasValue(["fury"])).toBe(true);
  });

  it("accepts zero and false", () => {
    expect(hasValue(0)).toBe(true);
    expect(hasValue(false)).toBe(true);
  });
});

describe("formatValue", () => {
  it("renders an em dash for a missing value or an empty array", () => {
    expect(formatValue(null)).toBe("—");
    expect(formatValue(undefined)).toBe("—");
    expect(formatValue([])).toBe("—");
  });

  it("joins arrays with commas", () => {
    expect(formatValue(["fury", "calm"])).toBe("fury, calm");
  });

  it("renders booleans as Yes and No", () => {
    expect(formatValue(true)).toBe("Yes");
    expect(formatValue(false)).toBe("No");
  });

  it("serializes objects as JSON", () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });

  it("appends a non-empty suffix in parentheses", () => {
    expect(formatValue("OGN", "Origins")).toBe("OGN (Origins)");
    expect(formatValue("OGN", "")).toBe("OGN");
    expect(formatValue("OGN", null)).toBe("OGN");
  });

  it("appends a suffix to a missing value too", () => {
    expect(formatValue(null, "Origins")).toBe("— (Origins)");
  });
});
