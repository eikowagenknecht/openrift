import type { DeckFormat } from "@openrift/shared";
import { WellKnown, ZONE_EXPECTED } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  requiredZoneProgress,
  ZONE_EMPTY_HINTS,
  ZONE_LABELS,
  zoneEmptyHint,
  zoneEmptyReadOnlyLabel,
  zoneExpected,
  zoneLabel,
} from "./deck-zone-labels";

describe("zoneLabel", () => {
  it("returns the canonical descriptive label for known zones", () => {
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

describe("requiredZoneProgress", () => {
  it("sums quantities in required zones against the format total", () => {
    const cards = [
      { zone: WellKnown.deckZone.LEGEND, quantity: 1 },
      { zone: WellKnown.deckZone.RUNES, quantity: 12 },
      { zone: WellKnown.deckZone.MAIN, quantity: 30 },
      { zone: WellKnown.deckZone.SIDEBOARD, quantity: 8 },
      { zone: WellKnown.deckZone.OVERFLOW, quantity: 5 },
    ];
    expect(requiredZoneProgress(cards, WellKnown.deckFormat.CONSTRUCTED)).toEqual({
      progress: 43,
      total: 56,
    });
  });

  it("uses the Custom-Region total of 54 (single battlefield)", () => {
    expect(requiredZoneProgress([], WellKnown.deckFormat.CUSTOM_REGION)).toEqual({
      progress: 0,
      total: 54,
    });
  });
});

describe("zoneEmptyReadOnlyLabel", () => {
  it("states what's missing instead of prompting an action", () => {
    expect(zoneEmptyReadOnlyLabel(WellKnown.deckZone.LEGEND)).toBe("No Legend picked");
    expect(zoneEmptyReadOnlyLabel(WellKnown.deckZone.MAIN)).toBe("No cards");
  });

  it("covers every labelled zone", () => {
    for (const zone of Object.keys(ZONE_LABELS)) {
      const label = zoneEmptyReadOnlyLabel(zone as keyof typeof ZONE_LABELS);
      expect(label).toBeTruthy();
      expect(label).not.toBe("Empty");
    }
  });
});
