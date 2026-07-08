import { describe, expect, it } from "vitest";

import { unwrapAuthResult } from "./use-api-keys";

describe("unwrapAuthResult", () => {
  it("returns data when there is no error", () => {
    const keys = [{ id: "k1" }];
    expect(unwrapAuthResult({ data: keys, error: null })).toBe(keys);
  });

  it("passes through null-ish data on success (204-style responses)", () => {
    expect(unwrapAuthResult({ data: null, error: null })).toBeNull();
  });

  it("throws the error message when the result carries an error", () => {
    expect(() =>
      unwrapAuthResult({ data: null, error: { message: "rate limited", statusText: "Too Many" } }),
    ).toThrow("rate limited");
  });

  it("falls back to statusText when the error has no message", () => {
    expect(() => unwrapAuthResult({ data: null, error: { statusText: "Unauthorized" } })).toThrow(
      "Unauthorized",
    );
  });
});
