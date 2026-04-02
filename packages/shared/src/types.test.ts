import { describe, expect, it } from "bun:test";

import {
  ALL_SEARCH_FIELDS,
  ART_VARIANT_ORDER,
  DEFAULT_SEARCH_SCOPE,
  DOMAIN_ORDER,
  FINISH_ORDER,
  RARITY_ORDER,
  SEARCH_PREFIX_MAP,
} from "./types";
import { getOrientation } from "./utils";

describe("getOrientation", () => {
  it("returns landscape for Battlefield", () => {
    expect(getOrientation("Battlefield")).toBe("landscape");
  });

  it("returns portrait for Unit", () => {
    expect(getOrientation("Unit")).toBe("portrait");
  });

  it("returns portrait for Spell", () => {
    expect(getOrientation("Spell")).toBe("portrait");
  });

  it("returns portrait for Legend", () => {
    expect(getOrientation("Legend")).toBe("portrait");
  });

  it("returns portrait for Rune", () => {
    expect(getOrientation("Rune")).toBe("portrait");
  });

  it("returns portrait for Gear", () => {
    expect(getOrientation("Gear")).toBe("portrait");
  });
});

describe("constants", () => {
  it("DOMAIN_ORDER has 7 domains with Colorless last", () => {
    expect(DOMAIN_ORDER).toHaveLength(7);
    expect(DOMAIN_ORDER.at(-1)).toBe("Colorless");
  });

  it("RARITY_ORDER has 5 rarities", () => {
    expect(RARITY_ORDER).toHaveLength(5);
    expect(RARITY_ORDER[0]).toBe("Common");
    expect(RARITY_ORDER.at(-1)).toBe("Showcase");
  });

  it("ART_VARIANT_ORDER has 3 variants", () => {
    expect(ART_VARIANT_ORDER).toEqual(["normal", "altart", "overnumbered"]);
  });

  it("FINISH_ORDER has 2 finishes", () => {
    expect(FINISH_ORDER).toEqual(["normal", "foil"]);
  });

  it("ALL_SEARCH_FIELDS includes all 8 fields", () => {
    expect(ALL_SEARCH_FIELDS).toHaveLength(8);
    expect(ALL_SEARCH_FIELDS).toContain("name");
    expect(ALL_SEARCH_FIELDS).toContain("flavorText");
    expect(ALL_SEARCH_FIELDS).toContain("type");
    expect(ALL_SEARCH_FIELDS).toContain("id");
  });

  it("DEFAULT_SEARCH_SCOPE includes all fields", () => {
    expect(DEFAULT_SEARCH_SCOPE).toEqual(ALL_SEARCH_FIELDS);
  });

  it("SEARCH_PREFIX_MAP maps prefixes to fields", () => {
    expect(SEARCH_PREFIX_MAP.n).toBe("name");
    expect(SEARCH_PREFIX_MAP.d).toBe("cardText");
    expect(SEARCH_PREFIX_MAP.k).toBe("keywords");
    expect(SEARCH_PREFIX_MAP.t).toBe("tags");
    expect(SEARCH_PREFIX_MAP.a).toBe("artist");
    expect(SEARCH_PREFIX_MAP.f).toBe("flavorText");
    expect(SEARCH_PREFIX_MAP.ty).toBe("type");
    expect(SEARCH_PREFIX_MAP.id).toBe("id");
  });
});
