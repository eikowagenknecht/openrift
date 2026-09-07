import { WellKnown } from "@openrift/shared/well-known";
import { beforeEach, describe, expect, it } from "vitest";

import {
  CARD_HEIGHT_RATIO,
  nameStripBand,
  smallZoneGridStyles,
  stackStripGeometry,
} from "@/features/decks/components/deck-overview-geometry";
import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";

beforeEach(() => {
  resetIdCounter();
});

describe("nameStripBand", () => {
  it("gives units, spells and gear the same mid-card bar", () => {
    expect(nameStripBand("unit")).toEqual({ y0: 0.56, y1: 0.63 });
    expect(nameStripBand("spell")).toEqual(nameStripBand("unit"));
    expect(nameStripBand("gear")).toEqual(nameStripBand("unit"));
  });

  it("puts the legend and rune bars lower", () => {
    expect(nameStripBand("legend").y0).toBeGreaterThan(nameStripBand("unit").y0);
    expect(nameStripBand("rune")).toEqual(nameStripBand("legend"));
  });

  it("falls back to the unit bar for an unknown type", () => {
    expect(nameStripBand("token")).toEqual(nameStripBand("unit"));
  });

  it("returns a window that reads top-down", () => {
    for (const type of ["unit", "spell", "gear", "legend", "rune", "battlefield"]) {
      const band = nameStripBand(type);
      expect(band.y0).toBeLessThan(band.y1);
      expect(band.y0).toBeGreaterThan(0);
      expect(band.y1).toBeLessThan(1);
    }
  });
});

describe("stackStripGeometry", () => {
  const unit = stubDeckBuilderCard({ cardType: "unit" });
  const battlefield = stubDeckBuilderCard({ cardType: "battlefield" });

  it("sizes a portrait strip against one card width", () => {
    const geometry = stackStripGeometry(unit, "middle");
    expect(geometry.isLandscape).toBe(false);
    expect(geometry.widthRatio).toBe(1);
    expect(geometry.heightPerWidth).toBe(CARD_HEIGHT_RATIO);
    expect(geometry.cardHeightRatio).toBe(CARD_HEIGHT_RATIO);
  });

  it("sizes a landscape strip against a card's height", () => {
    const geometry = stackStripGeometry(battlefield, "middle");
    expect(geometry.isLandscape).toBe(true);
    expect(geometry.widthRatio).toBe(88 / 63);
    expect(geometry.heightPerWidth).toBe(63 / 88);
    expect(geometry.cardHeightRatio).toBe(1);
  });

  it("shows the whole top half down through the name bar on the pile's top card", () => {
    expect(stackStripGeometry(unit, "top").restFraction).toBe(nameStripBand("unit").y1);
  });

  it("shows the name bar alone on a buried card", () => {
    const band = nameStripBand("unit");
    expect(stackStripGeometry(unit, "middle").restFraction).toBeCloseTo(band.y1 - band.y0, 10);
  });

  it("keeps the resting corner the same absolute size in both orientations", () => {
    expect(stackStripGeometry(unit, "top").restRadius).toBe("calc(var(--deck-card-w) * 0.05)");
    expect(stackStripGeometry(battlefield, "top").restRadius).toBe(
      `calc(var(--deck-card-w) * ${(88 / 63) * 0.05})`,
    );
  });

  it("keeps the rest window inside the card", () => {
    for (const variant of ["top", "middle"] as const) {
      for (const card of [unit, battlefield]) {
        const geometry = stackStripGeometry(card, variant);
        expect(geometry.restFraction).toBeGreaterThan(0);
        expect(geometry.restFraction).toBeLessThan(1);
      }
    }
  });

  it("reads the orientation off the full type set, not the primary type", () => {
    const dualType = stubDeckBuilderCard({
      cardType: "unit",
      cardTypes: ["unit", WellKnown.cardType.BATTLEFIELD],
    });
    expect(stackStripGeometry(dualType, "top").isLandscape).toBe(true);
  });
});

describe("smallZoneGridStyles", () => {
  it("gives runes its own row below four columns", () => {
    expect(smallZoneGridStyles(3, false).runes).toEqual({ gridColumn: "span 3 / span 3" });
  });

  it("shares row one from four columns up, leaving one card each side", () => {
    expect(smallZoneGridStyles(5, false).runes).toEqual({ gridColumn: "span 3 / span 3" });
    expect(smallZoneGridStyles(5, false).legend).toEqual({ gridColumn: "span 1 / span 1" });
    expect(smallZoneGridStyles(5, false).champion).toEqual({ gridColumn: "span 1 / span 1" });
  });

  it("gives battlefields a full-width band outside stacks mode", () => {
    expect(smallZoneGridStyles(6, false).battlefield).toEqual({ gridColumn: "1 / -1" });
  });

  it("folds a stacked battlefield onto row one from six columns up", () => {
    const styles = smallZoneGridStyles(6, true);
    expect(styles.runes).toEqual({ gridColumn: "span 2 / span 2" });
    expect(styles.battlefield).toEqual({ gridColumn: "span 2 / span 2" });
  });

  it("keeps the full-width band for a stacked battlefield below six columns", () => {
    expect(smallZoneGridStyles(5, true).battlefield).toEqual({ gridColumn: "1 / -1" });
  });

  it("stacks every zone at the unmeasured single column", () => {
    const styles = smallZoneGridStyles(1, false);
    expect(styles.runes).toEqual({ gridColumn: "span 1 / span 1" });
    expect(styles.battlefield).toEqual({ gridColumn: "1 / -1" });
  });
});
