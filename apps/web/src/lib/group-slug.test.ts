import { describe, expect, it } from "vitest";

import { deriveGroupSlug, groupSlugError } from "./group-slug";

describe("deriveGroupSlug", () => {
  it("lowercases and joins words with dashes", () => {
    expect(deriveGroupSlug("Tuesday Night Crew")).toBe("tuesday-night-crew");
  });

  it("drops punctuation and collapses the gaps it leaves", () => {
    expect(deriveGroupSlug("Piltover & Zaun -- Locals!")).toBe("piltover-zaun-locals");
  });

  it("returns an empty slug for a name with nothing slug-worthy in it", () => {
    expect(deriveGroupSlug("!!!")).toBe("");
    expect(deriveGroupSlug("")).toBe("");
  });

  it("truncates to the server's 30-character limit", () => {
    expect(deriveGroupSlug("a".repeat(40))).toBe("a".repeat(30));
  });

  it("trims a dash the truncation lands on", () => {
    // 30 characters would cut mid-gap and leave "…-", which the slug pattern rejects.
    expect(deriveGroupSlug(`${"a".repeat(29)} bravo`)).toBe("a".repeat(29));
  });
});

describe("groupSlugError", () => {
  it("accepts a well-formed slug", () => {
    expect(groupSlugError("tuesday-crew")).toBeNull();
    expect(groupSlugError("abc")).toBeNull();
    expect(groupSlugError("a".repeat(30))).toBeNull();
  });

  it("treats an empty slug as not-yet-filled rather than wrong", () => {
    expect(groupSlugError("")).toBeNull();
  });

  it("rejects a slug below the server minimum", () => {
    expect(groupSlugError("ab")).toBe("Use at least 3 characters");
  });

  it("rejects a slug above the server maximum", () => {
    expect(groupSlugError("a".repeat(31))).toBe("Use at most 30 characters");
  });

  it("rejects characters and shapes the pattern forbids", () => {
    expect(groupSlugError("Tuesday")).not.toBeNull();
    expect(groupSlugError("tuesday crew")).not.toBeNull();
    expect(groupSlugError("-tuesday")).not.toBeNull();
  });

  it("rejects the slugs the router reserves", () => {
    expect(groupSlugError("join")).toBe("That address is taken by OpenRift, pick another");
    expect(groupSlugError("settings")).toBe("That address is taken by OpenRift, pick another");
  });
});
