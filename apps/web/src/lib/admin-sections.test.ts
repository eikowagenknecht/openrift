import { ADMIN_SECTION_SLUGS } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { ADMIN_SECTION_ROUTES, adminSectionFromPathname } from "./admin-sections";

describe("adminSectionFromPathname", () => {
  it("extracts the section slug from a section route", () => {
    expect(adminSectionFromPathname("/admin/custom-tags")).toBe("custom-tags");
  });

  it("extracts the first segment from a nested section path", () => {
    expect(adminSectionFromPathname("/admin/custom-tags/whatever")).toBe("custom-tags");
  });

  it("returns null for the admin root", () => {
    expect(adminSectionFromPathname("/admin")).toBeNull();
    expect(adminSectionFromPathname("/admin/")).toBeNull();
  });

  it("returns null for non-admin paths", () => {
    expect(adminSectionFromPathname("/cards")).toBeNull();
    expect(adminSectionFromPathname("")).toBeNull();
  });
});

describe("ADMIN_SECTION_ROUTES", () => {
  it("round-trips every registered section through its route", () => {
    for (const slug of ADMIN_SECTION_SLUGS) {
      expect(adminSectionFromPathname(ADMIN_SECTION_ROUTES[slug])).toBe(slug);
    }
  });
});
