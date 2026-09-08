import { describe, expect, it } from "vitest";

import { candidateCardFieldRules, printingFieldRules } from "./db-field-rules.js";

describe("printingFieldRules.language", () => {
  it("accepts the printed 2-letter uppercase codes", () => {
    expect(printingFieldRules.language.safeParse("EN").success).toBe(true);
    expect(printingFieldRules.language.safeParse("SC").success).toBe(true);
    expect(printingFieldRules.language.safeParse("FR").success).toBe(true);
  });

  it("rejects lowercase, which would reach the FK un-normalized", () => {
    const result = printingFieldRules.language.safeParse("en");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]!.message).toContain("2-letter uppercase");
  });

  it("rejects codes that are too long or too short", () => {
    expect(printingFieldRules.language.safeParse("ENG").success).toBe(false);
    expect(printingFieldRules.language.safeParse("E").success).toBe(false);
    expect(printingFieldRules.language.safeParse("").success).toBe(false);
  });

  it("rejects non-letters", () => {
    expect(printingFieldRules.language.safeParse("E1").success).toBe(false);
    expect(printingFieldRules.language.safeParse("E-").success).toBe(false);
  });

  it("composes with .nullable() / .optional() rather than restating the shape", () => {
    expect(printingFieldRules.language.nullable().safeParse(null).success).toBe(true);
    expect(printingFieldRules.language.optional().safeParse(undefined).success).toBe(true);
    expect(printingFieldRules.language.nullable().safeParse("en").success).toBe(false);
    expect(printingFieldRules.language.optional().safeParse("en").success).toBe(false);
  });
});

describe("candidateCardFieldRules.extraData", () => {
  it("passes for null", () => {
    expect(candidateCardFieldRules.extraData.safeParse(null).success).toBe(true);
  });

  it("passes for undefined", () => {
    expect(candidateCardFieldRules.extraData.safeParse(undefined).success).toBe(true);
  });

  it("fails for empty object", () => {
    expect(candidateCardFieldRules.extraData.safeParse({}).success).toBe(false);
  });

  it("passes for non-empty object", () => {
    expect(candidateCardFieldRules.extraData.safeParse({ key: "value" }).success).toBe(true);
  });

  it("fails for array", () => {
    expect(candidateCardFieldRules.extraData.safeParse([1, 2]).success).toBe(false);
  });

  it("fails for empty array", () => {
    expect(candidateCardFieldRules.extraData.safeParse([]).success).toBe(false);
  });

  it("passes for object with nested values", () => {
    expect(candidateCardFieldRules.extraData.safeParse({ nested: { key: "value" } }).success).toBe(
      true,
    );
  });

  it("passes for object with single key", () => {
    expect(candidateCardFieldRules.extraData.safeParse({ a: 1 }).success).toBe(true);
  });

  it("fails for a string value", () => {
    expect(candidateCardFieldRules.extraData.safeParse("hello").success).toBe(false);
  });

  it("fails for a number value", () => {
    expect(candidateCardFieldRules.extraData.safeParse(42).success).toBe(false);
  });

  it("fails for a boolean value", () => {
    expect(candidateCardFieldRules.extraData.safeParse(true).success).toBe(false);
  });
});
