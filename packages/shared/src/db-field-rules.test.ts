import { describe, expect, it } from "vitest";

import { printingFieldRules } from "./db-field-rules.js";

describe("printingFieldRules.language", () => {
  it("accepts the printed 2-letter uppercase codes", () => {
    expect(printingFieldRules.language.safeParse("EN").success).toBe(true);
    expect(printingFieldRules.language.safeParse("SC").success).toBe(true);
    expect(printingFieldRules.language.safeParse("FR").success).toBe(true);
  });

  it("rejects lowercase, which would reach the FK un-normalized", () => {
    const result = printingFieldRules.language.safeParse("en");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("2-letter uppercase");
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
