import { describe, expect, it } from "bun:test";

import {
  ALL_SEARCH_FIELDS,
  DEFAULT_ENUM_ORDERS,
  DEFAULT_SEARCH_SCOPE,
  SEARCH_PREFIX_MAP,
} from "./types";
import { getOrientation } from "./utils";
import { WellKnown } from "./well-known";

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
  it("DEFAULT_ENUM_ORDERS contains all 6 enum keys", () => {
    expect(DEFAULT_ENUM_ORDERS).toHaveProperty("domains");
    expect(DEFAULT_ENUM_ORDERS).toHaveProperty("rarities");
    expect(DEFAULT_ENUM_ORDERS).toHaveProperty("artVariants");
    expect(DEFAULT_ENUM_ORDERS).toHaveProperty("finishes");
    expect(DEFAULT_ENUM_ORDERS).toHaveProperty("cardTypes");
    expect(DEFAULT_ENUM_ORDERS).toHaveProperty("superTypes");
  });

  it("DEFAULT_ENUM_ORDERS contains well-known values", () => {
    expect(DEFAULT_ENUM_ORDERS.domains).toContain(WellKnown.domain.COLORLESS);
    expect(DEFAULT_ENUM_ORDERS.finishes).toContain(WellKnown.finish.NORMAL);
    expect(DEFAULT_ENUM_ORDERS.finishes).toContain(WellKnown.finish.FOIL);
    expect(DEFAULT_ENUM_ORDERS.artVariants).toContain(WellKnown.artVariant.NORMAL);
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
