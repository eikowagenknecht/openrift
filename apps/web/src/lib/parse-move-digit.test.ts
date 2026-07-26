import { describe, expect, it } from "vitest";

import { parseMoveDigit } from "./parse-move-digit";

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
    expect(parseMoveDigit(" ")).toBeNull();
    expect(parseMoveDigit("²")).toBeNull();
  });

  it("returns null for named keys", () => {
    expect(parseMoveDigit("Shift")).toBeNull();
    expect(parseMoveDigit("ArrowUp")).toBeNull();
    expect(parseMoveDigit("Unidentified")).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(parseMoveDigit("")).toBeNull();
  });

  // Regression for OPENRIFT-SSR-26: synthetic keyup events from autofill
  // extensions arrive without a `key`, which used to crash on `.length`.
  it("returns null when key is undefined", () => {
    expect(parseMoveDigit(undefined)).toBeNull();
  });
});
