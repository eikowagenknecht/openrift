import { describe, expect, it } from "bun:test";

import { ALL_SEARCH_FIELDS, DEFAULT_SEARCH_SCOPE, SEARCH_PREFIX_MAP } from "./types";
import { snapshotHeadline } from "./types/api/pricing";
import { getOrientation } from "./utils";

describe("getOrientation", () => {
  it("returns landscape for Battlefield", () => {
    expect(getOrientation("battlefield")).toBe("landscape");
  });

  it("returns portrait for Unit", () => {
    expect(getOrientation("unit")).toBe("portrait");
  });

  it("returns portrait for Spell", () => {
    expect(getOrientation("spell")).toBe("portrait");
  });

  it("returns portrait for Legend", () => {
    expect(getOrientation("legend")).toBe("portrait");
  });

  it("returns portrait for Rune", () => {
    expect(getOrientation("rune")).toBe("portrait");
  });

  it("returns portrait for Gear", () => {
    expect(getOrientation("gear")).toBe("portrait");
  });
});

describe("constants", () => {
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

describe("snapshotHeadline", () => {
  it("returns market for TCGplayer snapshots", () => {
    expect(snapshotHeadline({ date: "2026-04-01", market: 4.52, low: 3.25 })).toBe(4.52);
  });

  it("returns market for Cardmarket snapshots", () => {
    expect(snapshotHeadline({ date: "2026-04-01", market: 3.8, low: 2.5 })).toBe(3.8);
  });

  it("returns zeroLow for CardTrader when present — the Zero-eligible price is the headline", () => {
    expect(snapshotHeadline({ date: "2026-04-01", zeroLow: 4.2, low: 3.9 })).toBe(4.2);
  });

  it("falls back to overall low for CardTrader when zeroLow is null", () => {
    expect(snapshotHeadline({ date: "2026-04-01", zeroLow: null, low: 3.9 })).toBe(3.9);
  });

  it("returns zeroLow for CardTrader when low is null (all sellers are Zero-eligible)", () => {
    expect(snapshotHeadline({ date: "2026-04-01", zeroLow: 4.2, low: null })).toBe(4.2);
  });
});
