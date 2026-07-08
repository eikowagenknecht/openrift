import { describe, expect, it } from "vitest";

import { productSlugSchema, RESERVED_PRODUCT_SLUGS } from "./products.js";

describe("productSlugSchema", () => {
  it.each(["origins-starter-set", "abc", "kit-01", "0-a"])("accepts %s", (slug) => {
    expect(productSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each([
    "ab", // too short
    "Kit", // uppercase
    "-kit", // leading dash
    "kit_one", // underscore
    "kit one", // space
    "a".repeat(81), // too long
  ])("rejects %s", (slug) => {
    expect(productSlugSchema.safeParse(slug).success).toBe(false);
  });

  it("rejects every reserved slug", () => {
    for (const slug of RESERVED_PRODUCT_SLUGS) {
      expect(productSlugSchema.safeParse(slug).success).toBe(false);
    }
  });
});
