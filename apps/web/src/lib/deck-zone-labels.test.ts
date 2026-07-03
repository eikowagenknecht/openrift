import type { DeckFormat } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  ZONE_EMPTY_HINTS,
  ZONE_EXPECTED,
  ZONE_LABELS,
  zoneEmptyHint,
  zoneExpected,
  zoneLabel,
} from "./deck-zone-labels";

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

describe("zoneExpected", () => {
  it("targets a single battlefield in Custom-Region", () => {
    // Regression: the builder showed "1/3 battlefields" for Custom-Region
    // decks even though validation caps the zone at 1.
    expect(zoneExpected(WellKnown.deckZone.BATTLEFIELD, WellKnown.deckFormat.CUSTOM_REGION)).toBe(
      1,
    );
    expect(zoneExpected(WellKnown.deckZone.BATTLEFIELD, WellKnown.deckFormat.CONSTRUCTED)).toBe(3);
  });

  it("drops the sideboard target for formats without a sideboard", () => {
    expect(
      zoneExpected(WellKnown.deckZone.SIDEBOARD, WellKnown.deckFormat.CUSTOM_REGION),
    ).toBeUndefined();
    expect(zoneExpected(WellKnown.deckZone.SIDEBOARD, WellKnown.deckFormat.CONSTRUCTED)).toBe(
      ZONE_EXPECTED.sideboard,
    );
  });

  it("falls back to the constructed baseline for all other zones", () => {
    for (const format of [WellKnown.deckFormat.CONSTRUCTED, WellKnown.deckFormat.CUSTOM_REGION]) {
      expect(zoneExpected(WellKnown.deckZone.LEGEND, format)).toBe(1);
      expect(zoneExpected(WellKnown.deckZone.RUNES, format)).toBe(12);
      expect(zoneExpected(WellKnown.deckZone.MAIN, format)).toBe(39);
      expect(zoneExpected(WellKnown.deckZone.OVERFLOW, format)).toBeUndefined();
    }
  });

  it("sums to the format's full deck size across the required zones", () => {
    const requiredZones = [
      WellKnown.deckZone.LEGEND,
      WellKnown.deckZone.CHAMPION,
      WellKnown.deckZone.RUNES,
      WellKnown.deckZone.BATTLEFIELD,
      WellKnown.deckZone.MAIN,
    ];
    const totalFor = (format: DeckFormat) =>
      requiredZones.reduce((sum, zone) => sum + (zoneExpected(zone, format) ?? 0), 0);
    expect(totalFor(WellKnown.deckFormat.CONSTRUCTED)).toBe(56);
    expect(totalFor(WellKnown.deckFormat.CUSTOM_REGION)).toBe(54);
  });
});

describe("zoneEmptyHint", () => {
  it("asks for a single battlefield in Custom-Region", () => {
    expect(zoneEmptyHint(WellKnown.deckZone.BATTLEFIELD, WellKnown.deckFormat.CUSTOM_REGION)).toBe(
      "Choose a Battlefield card",
    );
    expect(zoneEmptyHint(WellKnown.deckZone.BATTLEFIELD, WellKnown.deckFormat.CONSTRUCTED)).toBe(
      "Choose 3 unique Battlefield cards",
    );
  });

  it("uses the baseline hint for other zones regardless of format", () => {
    expect(zoneEmptyHint(WellKnown.deckZone.LEGEND, WellKnown.deckFormat.CUSTOM_REGION)).toBe(
      ZONE_EMPTY_HINTS.legend,
    );
  });
});
