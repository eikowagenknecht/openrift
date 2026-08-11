import { describe, expect, it } from "vitest";

import { parseDigitKey, parseMoveDigit } from "./parse-digit-key";

describe("parseDigitKey", () => {
  it("returns digits 1-9", () => {
    for (let digit = 1; digit <= 9; digit++) {
      expect(parseDigitKey(String(digit))).toBe(digit);
    }
  });

  it("returns null for 0", () => {
    expect(parseDigitKey("0")).toBeNull();
  });

  it("returns null for non-digit single characters", () => {
    expect(parseDigitKey("a")).toBeNull();
    expect(parseDigitKey(" ")).toBeNull();
    expect(parseDigitKey("²")).toBeNull();
  });

  it("returns null for named keys", () => {
    expect(parseDigitKey("Shift")).toBeNull();
    expect(parseDigitKey("ArrowUp")).toBeNull();
    expect(parseDigitKey("Unidentified")).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(parseDigitKey("")).toBeNull();
  });

  // Regression: synthetic keyup events from autofill
  // extensions arrive without a `key`, which used to crash on `.length`.
  it("returns null when key is undefined", () => {
    expect(parseDigitKey(undefined)).toBeNull();
  });
});

describe("parseMoveDigit", () => {
  it("returns digits 2-9", () => {
    for (let digit = 2; digit <= 9; digit++) {
      expect(parseMoveDigit(String(digit))).toBe(digit);
    }
  });

  it("returns null for 0 and 1", () => {
    expect(parseMoveDigit("0")).toBeNull();
    expect(parseMoveDigit("1")).toBeNull();
  });

  it("returns null for non-digit single characters", () => {
    expect(parseMoveDigit("a")).toBeNull();
    expect(parseMoveDigit("²")).toBeNull();
  });

  it("returns null for named keys", () => {
    expect(parseMoveDigit("Shift")).toBeNull();
    expect(parseMoveDigit("ArrowUp")).toBeNull();
  });

  it("returns null when key is undefined", () => {
    expect(parseMoveDigit(undefined)).toBeNull();
  });
});
