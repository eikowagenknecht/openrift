import { describe, expect, it } from "vitest";

import { sectionAllowsPath } from "./admin-section-paths";

describe("sectionAllowsPath", () => {
  describe("custom-tags", () => {
    it.each([
      "/api/admin/v1/custom-tags",
      "/api/admin/v1/custom-tags/some-id",
      "/api/admin/v1/custom-tags/some-id/cards",
      "/api/admin/v1/custom-tags/assignments",
      "/api/admin/v1/custom-tag-categories",
      "/api/admin/v1/custom-tag-categories/some-id",
      "/api/admin/v1/cards/all-cards",
      "/api/admin/v1/cards/0197a1b2-0000-7000-a000-000000000001/custom-tags",
    ])("allows %s", (path) => {
      expect(sectionAllowsPath("custom-tags", path)).toBe(true);
    });

    it.each([
      // prefix must match on a segment boundary, not as a raw string prefix
      "/api/admin/v1/custom-tags-evil",
      "/api/admin/v1/custom-tag-categories-evil",
      // other admin surfaces stay closed
      "/api/admin/v1/me",
      "/api/admin/v1/users",
      "/api/admin/v1/admin-grants",
      "/api/admin/v1/cards",
      "/api/admin/v1/cards/some-id",
      "/api/admin/v1/cards/some-id/custom-tags/extra",
      "/api/admin/v1/feature-flags",
      "/api/admin/v1/site-settings",
    ])("rejects %s", (path) => {
      expect(sectionAllowsPath("custom-tags", path)).toBe(false);
    });
  });

  it("fails closed for unknown section slugs", () => {
    expect(sectionAllowsPath("not-a-section", "/api/admin/v1/custom-tags")).toBe(false);
    expect(sectionAllowsPath("", "/api/admin/v1/custom-tags")).toBe(false);
  });
});
