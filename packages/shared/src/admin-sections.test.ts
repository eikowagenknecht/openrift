import { describe, expect, it } from "vitest";

import { ADMIN_SECTION_LABELS, ADMIN_SECTION_SLUGS, isAdminSectionSlug } from "./admin-sections.js";

describe("isAdminSectionSlug", () => {
  it("accepts every declared slug", () => {
    for (const slug of ADMIN_SECTION_SLUGS) {
      expect(isAdminSectionSlug(slug)).toBe(true);
    }
  });

  it("rejects an unknown slug", () => {
    expect(isAdminSectionSlug("users")).toBe(false);
  });

  it("rejects the empty string and inherited object keys", () => {
    expect(isAdminSectionSlug("")).toBe(false);
    expect(isAdminSectionSlug("toString")).toBe(false);
  });
});

describe("ADMIN_SECTION_LABELS", () => {
  it("labels exactly the declared slugs", () => {
    expect(Object.keys(ADMIN_SECTION_LABELS).toSorted()).toEqual(
      [...ADMIN_SECTION_SLUGS].toSorted(),
    );
  });

  it("has no empty label", () => {
    for (const label of Object.values(ADMIN_SECTION_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
