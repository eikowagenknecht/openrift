import { describe, expect, it } from "vitest";

import { isValidKebabKey, isValidSlug } from "./admin-slug";

describe("isValidSlug", () => {
  it("accepts kebab-case slugs", () => {
    expect(isValidSlug("top-8")).toBe(true);
    expect(isValidSlug("bandle-city")).toBe(true);
  });

  it("accepts a single-letter slug (matches the server slug schema)", () => {
    expect(isValidSlug("a")).toBe(true);
  });

  it("rejects uppercase, leading digits, and trailing hyphens", () => {
    expect(isValidSlug("Top-8")).toBe(false);
    expect(isValidSlug("8ball")).toBe(false);
    expect(isValidSlug("top-")).toBe(false);
  });
});

describe("isValidKebabKey", () => {
  it("accepts multi-character kebab keys", () => {
    expect(isValidKebabKey("deck-builder")).toBe(true);
    expect(isValidKebabKey("umami-url")).toBe(true);
  });

  it("requires at least two leading characters (matches the server key schema)", () => {
    expect(isValidKebabKey("ab")).toBe(true);
    expect(isValidKebabKey("a")).toBe(false);
  });
});
