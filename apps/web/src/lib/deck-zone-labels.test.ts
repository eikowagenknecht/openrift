import { describe, expect, it } from "vitest";

import { ZONE_EMPTY_HINTS, ZONE_EXPECTED, ZONE_LABELS, zoneLabel } from "./deck-zone-labels";

describe("zoneLabel", () => {
  it("returns the canonical descriptive label for known zones", () => {
    // Regression: a divergent local copy used "Champion"/"Main"; the canonical
    // labels are more descriptive and must be the single source of truth.
    expect(zoneLabel("champion")).toBe("Chosen Champion");
    expect(zoneLabel("main")).toBe("Main Deck");
    expect(zoneLabel("battlefield")).toBe("Battlefields");
  });

  it("matches the ZONE_LABELS map for every known zone", () => {
    for (const [zone, label] of Object.entries(ZONE_LABELS)) {
      expect(zoneLabel(zone)).toBe(label);
    }
  });

  it("falls back to the raw value for unknown zones", () => {
    expect(zoneLabel("nonsense")).toBe("nonsense");
    expect(zoneLabel("")).toBe("");
  });
});

describe("zone constants", () => {
  it("expects 56 cards across the fixed required zones", () => {
    const requiredTotal = (["legend", "champion", "runes", "battlefield", "main"] as const).reduce(
      (sum, zone) => sum + (ZONE_EXPECTED[zone] ?? 0),
      0,
    );
    expect(requiredTotal).toBe(56);
  });

  it("has an empty-state hint for every labelled zone", () => {
    for (const zone of Object.keys(ZONE_LABELS)) {
      expect(ZONE_EMPTY_HINTS[zone as keyof typeof ZONE_EMPTY_HINTS]).toBeTruthy();
    }
  });
});
