import { ADMIN_SECTION_SLUGS } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { ADMIN_SECTION_ROUTES, adminSectionForPathname } from "./admin-sections";

describe("adminSectionForPathname", () => {
  it("resolves a section route to its slug", () => {
    expect(adminSectionForPathname("/admin/custom-tags")).toBe("custom-tags");
    expect(adminSectionForPathname("/admin/products")).toBe("products");
    expect(adminSectionForPathname("/admin/cards")).toBe("card-review");
  });

  it("resolves nested paths under a section route", () => {
    expect(adminSectionForPathname("/admin/custom-tags/whatever")).toBe("custom-tags");
    expect(adminSectionForPathname("/admin/cards/some-card-slug")).toBe("card-review");
    expect(adminSectionForPathname("/admin/cards/new/some-name")).toBe("card-review");
  });

  it("matches on segment boundaries, not raw prefixes", () => {
    // /admin/card-types must not match card-review's /admin/cards
    expect(adminSectionForPathname("/admin/card-types")).toBeNull();
    expect(adminSectionForPathname("/admin/cardsX")).toBeNull();
  });

  it("excludes the manual-create pages from card-review", () => {
    expect(adminSectionForPathname("/admin/cards/create")).toBeNull();
    expect(adminSectionForPathname("/admin/cards/some-card/printings/create")).toBeNull();
  });

  it("returns null for the admin root", () => {
    expect(adminSectionForPathname("/admin")).toBeNull();
    expect(adminSectionForPathname("/admin/")).toBeNull();
  });

  it("returns null for non-admin and unmapped paths", () => {
    expect(adminSectionForPathname("/cards")).toBeNull();
    expect(adminSectionForPathname("/admin/sources")).toBeNull();
    expect(adminSectionForPathname("")).toBeNull();
  });
});

describe("ADMIN_SECTION_ROUTES", () => {
  it("round-trips every registered section through its route", () => {
    for (const slug of ADMIN_SECTION_SLUGS) {
      expect(adminSectionForPathname(ADMIN_SECTION_ROUTES[slug])).toBe(slug);
    }
  });
});
