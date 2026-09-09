import type { AvailableFilters } from "@openrift/shared/filters-available";
import { PREFERENCE_DEFAULTS } from "@openrift/shared/types/api/preferences";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOP_LEVEL_UNITS,
  FILTER_PLACEMENT_UNITS,
  getApplicablePlacementUnits,
  keepPlacementUnits,
  resolveTopLevelUnits,
} from "./filter-sections";

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
    hasOvernumbered: false,
    hasNonStandard: false,
    hasBanned: false,
    hasErrata: false,
    hasNoImage: false,
    keywords: [],
    tags: [],
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
    it("has a unique key for every placement unit", () => {
      const keys = FILTER_PLACEMENT_UNITS.map((unit) => unit.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("never maps one section to two units", () => {
      const sections = FILTER_PLACEMENT_UNITS.flatMap((unit) => [...unit.sections]);
      expect(new Set(sections).size).toBe(sections.length);
    });

    it("keeps every default top-level key a real unit", () => {
      const keys = new Set(FILTER_PLACEMENT_UNITS.map((unit) => unit.key));
      for (const key of PREFERENCE_DEFAULTS.topLevelFilters) {
        expect(keys.has(key)).toBe(true);
      }
    });
  });

  describe("keepPlacementUnits", () => {
    it("drops unknown keys and de-duplicates", () => {
      expect(keepPlacementUnits(["sets", "junk", "sets", "stats"])).toEqual(["sets", "stats"]);
    });

    it("returns an empty list for only-unknown input", () => {
      expect(keepPlacementUnits(["nope", ""])).toEqual([]);
    });
  });

  describe("resolveTopLevelUnits", () => {
    it("builds a sanitized set from the stored preference", () => {
      const units = resolveTopLevelUnits(["domains", "bogus", "price"]);
      expect(units.has("domains")).toBe(true);
      expect(units.has("price")).toBe(true);
      expect(units.has("bogus")).toBe(false);
    });
  });

  describe("getApplicablePlacementUnits", () => {
    it("offers only units with content on an empty surface", () => {
      const applicable = getApplicablePlacementUnits({
        availableFilters: makeAvailable(),
        customTagCategoryCount: 0,
      });
      const keys = applicable.map((unit) => unit.key);
      expect(keys).toEqual(["stats", "owned", "price"]);
    });

    it("offers a core unit once its dimension has options", () => {
      const applicable = getApplicablePlacementUnits({
        availableFilters: makeAvailable({ domains: ["fury"], sets: ["OGN"] }),
        customTagCategoryCount: 0,
      });
      const keys = new Set(applicable.map((unit) => unit.key));
      expect(keys.has("domains")).toBe(true);
      expect(keys.has("sets")).toBe(true);
      expect(keys.has("types")).toBe(false);
    });

    it("offers the variant unit when any of its sections has content", () => {
      const signedOnly = getApplicablePlacementUnits({
        availableFilters: makeAvailable({ hasSigned: true }),
        customTagCategoryCount: 0,
      });
      expect(signedOnly.map((unit) => unit.key)).toContain("variant");
    });

    it("respects the surface's own hides", () => {
      const applicable = getApplicablePlacementUnits({
        availableFilters: makeAvailable({
          markers: [{ id: "marker-m", slug: "m", label: "M", description: "" }],
        }),
        surfaceHiddenSections: new Set(["owned", "markers"]),
        customTagCategoryCount: 0,
      });
      const keys = new Set(applicable.map((unit) => unit.key));
      expect(keys.has("owned")).toBe(false);
      expect(keys.has("markers")).toBe(false);
    });

    it("gates the languages unit on the available list", () => {
      const single = getApplicablePlacementUnits({
        availableFilters: makeAvailable(),
        availableLanguages: ["EN"],
        customTagCategoryCount: 0,
      });
      expect(single.map((unit) => unit.key)).not.toContain("languages");
      const multi = getApplicablePlacementUnits({
        availableFilters: makeAvailable(),
        availableLanguages: ["EN", "DE"],
        customTagCategoryCount: 0,
      });
      expect(multi.map((unit) => unit.key)).toContain("languages");
    });
  });

  describe("DEFAULT_TOP_LEVEL_UNITS", () => {
    it("mirrors the shared preference default", () => {
      expect([...DEFAULT_TOP_LEVEL_UNITS].toSorted()).toEqual(
        [...PREFERENCE_DEFAULTS.topLevelFilters].toSorted(),
      );
    });
  });
});
