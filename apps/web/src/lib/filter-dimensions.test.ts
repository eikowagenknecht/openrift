import type { AvailableFilters } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type {
  FilterDimensionAvailability,
  FilterDimensionLabels,
  FilterDimensionState,
} from "@/lib/filter-dimensions";
import {
  activeFilterDimensionLabels,
  countActiveFilterDimensions,
  FILTER_DIMENSIONS,
  filterDimension,
  sectionHasContent,
  visibleFilterDimensions,
} from "@/lib/filter-dimensions";
import { FILTER_PLACEMENT_UNITS } from "@/lib/filter-sections";

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
    price: { min: 0, max: 0 },
    ...overrides,
  };
}

const AVAILABILITY: FilterDimensionAvailability = {
  availableFilters: makeAvailable(),
  customTagCategoryCount: 0,
};

/** Every filter-state field the registry reads, all empty. */
const EMPTY_STATE = {
  languages: [],
  languagesEx: [],
  sets: [],
  setsEx: [],
  domains: [],
  domainsEx: [],
  rarities: [],
  raritiesEx: [],
  types: [],
  typesEx: [],
  superTypes: [],
  superTypesEx: [],
  superTypesPresence: null,
  artVariants: [],
  artVariantsEx: [],
  finishes: [],
  finishesEx: [],
  signed: null,
  overnumbered: null,
  standard: null,
  energyMin: null,
  energyMax: null,
  mightMin: null,
  mightMax: null,
  powerMin: null,
  powerMax: null,
  markers: [],
  markersEx: [],
  markersPresence: null,
  cardSizes: [],
  channels: [],
  channelsEx: [],
  channelsPresence: null,
  customTags: [],
  customTagsEx: [],
  customTagsPresence: null,
  tags: [],
  tagsEx: [],
  tagsPresence: null,
  keywords: [],
  keywordsEx: [],
  keywordsPresence: null,
  banned: null,
  errata: null,
  owned: [],
  ownedCountMin: null,
  ownedCountMax: null,
  priceMin: null,
  priceMax: null,
} as unknown as FilterDimensionState;

const state = (overrides: Partial<FilterDimensionState>): FilterDimensionState => ({
  ...EMPTY_STATE,
  ...overrides,
});

/** Identity resolvers, so a test asserts on the raw slug it passed in. */
const IDENTITY_LABELS: FilterDimensionLabels = {
  language: (value) => value,
  set: (value) => value,
  domain: (value) => value,
  rarity: (value) => value,
  type: (value) => value,
  superType: (value) => value,
  artVariant: (value) => value,
  finish: (value) => value,
  marker: (value) => value,
  channel: (value) => value,
  customTag: (value) => value,
  ownedBucket: (value) => value,
};

const everything = () => true;

describe("FILTER_DIMENSIONS", () => {
  it("gives every dimension a unique key", () => {
    const keys = FILTER_DIMENSIONS.map((dimension) => dimension.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only names placement units that exist", () => {
    const units = new Set(FILTER_PLACEMENT_UNITS.map((unit) => unit.key));
    for (const dimension of FILTER_DIMENSIONS) {
      expect(units, `dimension ${dimension.key}`).toContain(dimension.unit);
    }
  });

  it("only names section keys its unit declares", () => {
    for (const dimension of FILTER_DIMENSIONS) {
      const unit = FILTER_PLACEMENT_UNITS.find((entry) => entry.key === dimension.unit);
      expect(unit?.sections, `dimension ${dimension.key}`).toContain(dimension.section);
    }
  });

  it("covers every section of every placement unit", () => {
    const covered = new Set(FILTER_DIMENSIONS.map((dimension) => dimension.section));
    for (const unit of FILTER_PLACEMENT_UNITS) {
      for (const section of unit.sections) {
        expect(covered, `unit ${unit.key}`).toContain(section);
      }
    }
  });

  it("lists dimensions in the canonical placement-unit order", () => {
    const order = FILTER_PLACEMENT_UNITS.map((unit) => unit.key);
    const seen = FILTER_DIMENSIONS.map((dimension) => order.indexOf(dimension.unit));
    expect(seen).toEqual([...seen].toSorted((a, b) => a - b));
  });

  it("counts nothing and labels nothing for empty filter state", () => {
    expect(countActiveFilterDimensions(EMPTY_STATE, everything)).toBe(0);
    expect(activeFilterDimensionLabels(EMPTY_STATE, IDENTITY_LABELS, everything)).toEqual([]);
  });

  it("throws on an unknown dimension key", () => {
    expect(() => filterDimension("nope")).toThrow("Unknown filter dimension: nope");
  });
});

describe("countActiveFilterDimensions", () => {
  it("counts include values, exclude companions and the folded presence toggle", () => {
    const active = state({
      markers: ["alpha", "beta"],
      markersEx: ["gamma"],
      markersPresence: "any",
    });
    expect(countActiveFilterDimensions(active, everything)).toBe(4);
  });

  it("counts a set range once per range, not once per bound", () => {
    const active = state({ energyMin: 1, energyMax: 3, priceMin: 5 });
    expect(countActiveFilterDimensions(active, everything)).toBe(2);
  });

  it("splits the Owned unit into its buckets and its Copies range", () => {
    const active = state({ owned: ["full"], ownedCountMin: 2 });
    expect(countActiveFilterDimensions(active, (unit) => unit === "owned")).toBe(2);
  });

  it("ignores units outside the requested scope", () => {
    const active = state({ sets: ["OGN"], banned: true });
    expect(countActiveFilterDimensions(active, (unit) => unit === "banned")).toBe(1);
  });

  it("counts a selection whose dimension the surface hides", () => {
    // Placement is the only gate, so the More count never disagrees with what
    // "clear all filters" would drop.
    const active = state({ keywords: ["Deflect"] });
    expect(countActiveFilterDimensions(active, everything)).toBe(1);
  });
});

describe("activeFilterDimensionLabels", () => {
  it("prefixes excluded values with a minus", () => {
    const active = state({ types: ["unit"], typesEx: ["spell"] });
    expect(activeFilterDimensionLabels(active, IDENTITY_LABELS, everything)).toEqual([
      "unit",
      "−spell",
    ]);
  });

  it("names a flag, and negates it while it forbids", () => {
    expect(
      activeFilterDimensionLabels(state({ banned: true }), IDENTITY_LABELS, everything),
    ).toEqual(["Banned"]);
    expect(
      activeFilterDimensionLabels(state({ banned: false }), IDENTITY_LABELS, everything),
    ).toEqual(["−Banned"]);
  });

  it("names the overnumbered flag inside the Variant unit", () => {
    expect(
      activeFilterDimensionLabels(state({ overnumbered: false }), IDENTITY_LABELS, everything),
    ).toEqual(["−Overnumbered"]);
    expect(countActiveFilterDimensions(state({ overnumbered: true }), everything)).toBe(1);
  });

  it("names a presence toggle by its trait, negated for none", () => {
    expect(
      activeFilterDimensionLabels(state({ tagsPresence: "none" }), IDENTITY_LABELS, everything),
    ).toEqual(["−Has any tag"]);
  });

  it("names a range by its dimension, since it has no single value", () => {
    const active = state({ mightMax: 4, ownedCountMin: 1, priceMax: 20 });
    expect(activeFilterDimensionLabels(active, IDENTITY_LABELS, everything)).toEqual([
      "Might",
      "Copies",
      "Price",
    ]);
  });

  it("reads the Size axis as the Oversized tri-state", () => {
    expect(
      activeFilterDimensionLabels(state({ cardSizes: ["oversized"] }), IDENTITY_LABELS, everything),
    ).toEqual(["Oversized"]);
  });
});

describe("visibleFilterDimensions", () => {
  it("keeps the always-present axes when nothing else has content", () => {
    expect(visibleFilterDimensions(AVAILABILITY)).toEqual(
      new Set(["energy", "power", "might", "owned"]),
    );
  });

  it("drops an axis the surface hides", () => {
    const visible = visibleFilterDimensions(AVAILABILITY, new Set(["energy", "owned"]));
    expect(visible).toEqual(new Set(["power", "might"]));
  });

  it("admits an axis once its availability has content", () => {
    const withMarkers = {
      ...AVAILABILITY,
      availableFilters: makeAvailable({
        markers: [{ id: "1", slug: "alpha", label: "Alpha", description: null }],
      }),
    };
    expect(visibleFilterDimensions(withMarkers)).toContain("markers");
  });

  it("admits the Overnumbered axis once an overnumbered printing is available", () => {
    expect(visibleFilterDimensions(AVAILABILITY)).not.toContain("overnumbered");
    const withOvernumbered = {
      ...AVAILABILITY,
      availableFilters: makeAvailable({ hasOvernumbered: true }),
    };
    expect(visibleFilterDimensions(withOvernumbered)).toContain("overnumbered");
  });

  it("needs two languages before the Language axis applies", () => {
    expect(visibleFilterDimensions({ ...AVAILABILITY, availableLanguages: ["en"] })).not.toContain(
      "languages",
    );
    expect(
      visibleFilterDimensions({ ...AVAILABILITY, availableLanguages: ["en", "de"] }),
    ).toContain("languages");
  });

  it("shows Copies only once the viewer owns something", () => {
    expect(visibleFilterDimensions(AVAILABILITY)).not.toContain("copies");
    expect(visibleFilterDimensions({ ...AVAILABILITY, ownedCountMax: 3 })).toContain("copies");
  });
});

describe("sectionHasContent", () => {
  it("is true when any dimension covering the section has content", () => {
    // The Owned bucket row always applies, so the "owned" section does too even
    // with no Copies range to show.
    expect(sectionHasContent("owned", AVAILABILITY)).toBe(true);
  });

  it("is false for an unknown section", () => {
    expect(sectionHasContent("nope", AVAILABILITY)).toBe(false);
  });
});
