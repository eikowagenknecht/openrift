import { MARKETPLACE_LINKS } from "@openrift/shared/marketplace";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { describe, expect, it } from "vitest";

import { MARKETPLACE_META } from "./marketplace-meta";

const MARKETPLACES = Object.keys(MARKETPLACE_LINKS) as Marketplace[];

describe("MARKETPLACE_META", () => {
  it("covers every marketplace the shared links define", () => {
    expect(Object.keys(MARKETPLACE_META).toSorted()).toEqual(MARKETPLACES.toSorted());
  });

  it("gives every marketplace a served icon", () => {
    for (const marketplace of MARKETPLACES) {
      expect(MARKETPLACE_META[marketplace].icon).toMatch(/^\/images\/external\/.+\.webp$/u);
    }
  });

  it("keeps the shared label and affiliate flag", () => {
    for (const marketplace of MARKETPLACES) {
      expect(MARKETPLACE_META[marketplace].label).toBe(MARKETPLACE_LINKS[marketplace].label);
      expect(MARKETPLACE_META[marketplace].isAffiliate).toBe(
        MARKETPLACE_LINKS[marketplace].isAffiliate,
      );
    }
  });

  it("builds the same search url as the shared links", () => {
    for (const marketplace of MARKETPLACES) {
      expect(MARKETPLACE_META[marketplace].searchUrl("Summoner Skirmish")).toBe(
        MARKETPLACE_LINKS[marketplace].searchUrl("Summoner Skirmish"),
      );
    }
  });

  it("builds the same product url as the shared links", () => {
    for (const marketplace of MARKETPLACES) {
      expect(MARKETPLACE_META[marketplace].productUrl(123, "DE")).toBe(
        MARKETPLACE_LINKS[marketplace].productUrl(123, "DE"),
      );
    }
  });

  it("accepts a product url with no language", () => {
    for (const marketplace of MARKETPLACES) {
      expect(MARKETPLACE_META[marketplace].productUrl(123)).toContain("123");
    }
  });
});
