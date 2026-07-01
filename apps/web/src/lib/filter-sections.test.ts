import type { AvailableFilters } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  getApplicableToggleableSections,
  keepToggleableSections,
  mergeHiddenSections,
  TOGGLEABLE_FILTER_SECTIONS,
} from "./filter-sections";

// Filter-panel sections the user can never hide, so they must never appear in
// the toggleable list. Mirrors the anchored sections in filter-panel-content.tsx.
const CORE_FILTER_SECTIONS = ["sets", "domains", "rarity", "types"] as const;

function makeAvailable(overrides: Partial<AvailableFilters> = {}): AvailableFilters {
  return {
    sets: [],
    supplementalSets: new Set(),
    domains: [],
    types: [],
    superTypes: [],
    rarities: [],
    artVariants: [],
    finishes: [],
    cardSizes: [],
    hasSigned: false,
    hasNonStandard: false,
    hasBanned: false,
    hasErrata: false,
    keywords: [],
    hasNullEnergy: false,
    hasNullMight: false,
    hasNullPower: false,
    markers: [],
    distributionChannels: [],
    energy: { min: 1, max: 7 },
    might: { min: 1, max: 7 },
    power: { min: 1, max: 7 },
    price: { min: 0, max: 1000 },
    ...overrides,
  };
}

describe("filter-sections", () => {
  describe("invariants", () => {
    it("never lists a core section as toggleable", () => {
      const toggleableKeys = new Set(TOGGLEABLE_FILTER_SECTIONS.map((section) => section.key));
      for (const core of CORE_FILTER_SECTIONS) {
        expect(toggleableKeys.has(core)).toBe(false);
      }
    });

    it("has a unique key for every toggleable section", () => {
      const keys = TOGGLEABLE_FILTER_SECTIONS.map((section) => section.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe("keepToggleableSections", () => {
    it("drops core and unknown keys, keeping only toggleable ones", () => {
      expect(keepToggleableSections(["sets", "domains", "price", "owned", "bogus"])).toEqual([
        "price",
        "owned",
      ]);
    });

    it("de-duplicates repeated keys", () => {
      expect(keepToggleableSections(["price", "price", "owned"])).toEqual(["price", "owned"]);
    });

    it("returns an empty array for an empty input", () => {
      expect(keepToggleableSections([])).toEqual([]);
    });
  });

  describe("mergeHiddenSections", () => {
    it("unions the surface hides with the user's toggleable hides", () => {
      const merged = mergeHiddenSections(new Set(["markers", "channels"]), ["price", "energy"]);
      expect(merged).toEqual(new Set(["markers", "channels", "price", "energy"]));
    });

    it("ignores core or unknown keys in the user list", () => {
      const merged = mergeHiddenSections(new Set(["markers"]), ["sets", "bogus", "price"]);
      expect(merged).toEqual(new Set(["markers", "price"]));
    });

    it("handles an undefined surface set", () => {
      expect(mergeHiddenSections(undefined, ["price"])).toEqual(new Set(["price"]));
    });
  });

  describe("getApplicableToggleableSections", () => {
    it("offers stat ranges and the owned bucket on a bare surface", () => {
      const applicable = getApplicableToggleableSections({
        availableFilters: makeAvailable(),
        customTagCategoryCount: 0,
      }).map((section) => section.key);
      // Stat sliders and owned always have content; price has a positive max.
      expect(applicable).toContain("energy");
      expect(applicable).toContain("power");
      expect(applicable).toContain("might");
      expect(applicable).toContain("price");
      expect(applicable).toContain("owned");
      // No supertypes/finishes/markers/etc. present, so they aren't offered.
      expect(applicable).not.toContain("superTypes");
      expect(applicable).not.toContain("markers");
      expect(applicable).not.toContain("signed");
    });

    it("offers a section only when it has content", () => {
      const applicable = getApplicableToggleableSections({
        availableFilters: makeAvailable({
          superTypes: ["unit"],
          finishes: ["foil", "nonfoil"],
          markers: [{ id: "m1", slug: "alpha", label: "Alpha", description: null }],
          hasSigned: true,
        }),
        availableLanguages: ["EN", "DE"],
        customTagCategoryCount: 2,
      }).map((section) => section.key);
      expect(applicable).toContain("superTypes");
      expect(applicable).toContain("finishes");
      expect(applicable).toContain("languages");
      expect(applicable).toContain("markers");
      expect(applicable).toContain("signed");
      expect(applicable).toContain("customTags");
    });

    it("does not offer single-value finish/art-variant/language sections", () => {
      const applicable = getApplicableToggleableSections({
        availableFilters: makeAvailable({ finishes: ["foil"], artVariants: ["std"] }),
        availableLanguages: ["EN"],
        customTagCategoryCount: 0,
      }).map((section) => section.key);
      expect(applicable).not.toContain("finishes");
      expect(applicable).not.toContain("artVariants");
      expect(applicable).not.toContain("languages");
    });

    it("excludes price when the catalog has no priced cards", () => {
      const applicable = getApplicableToggleableSections({
        availableFilters: makeAvailable({ price: { min: 0, max: 0 } }),
        customTagCategoryCount: 0,
      }).map((section) => section.key);
      expect(applicable).not.toContain("price");
    });

    it("never offers a section the surface already force-hides", () => {
      const applicable = getApplicableToggleableSections({
        availableFilters: makeAvailable({
          markers: [{ id: "m1", slug: "alpha", label: "Alpha", description: null }],
        }),
        surfaceHiddenSections: new Set(["markers", "owned"]),
        customTagCategoryCount: 0,
      }).map((section) => section.key);
      expect(applicable).not.toContain("markers");
      expect(applicable).not.toContain("owned");
    });

    it("returns sections in panel order", () => {
      const applicable = getApplicableToggleableSections({
        availableFilters: makeAvailable(),
        customTagCategoryCount: 0,
      });
      const order = TOGGLEABLE_FILTER_SECTIONS.map((section) => section.key);
      const indices = applicable.map((section) => order.indexOf(section.key));
      expect(indices).toEqual([...indices].sort((a, b) => a - b));
    });
  });
});
