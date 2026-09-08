import { WellKnown } from "@openrift/shared/well-known";
import { describe, expect, it } from "vitest";

import { stubDeckBuilderCard } from "@/test/factories";

import { deckZoneFilterPreset } from "./deck-zone-filters";

const legend = stubDeckBuilderCard({
  zone: WellKnown.deckZone.LEGEND,
  domains: ["fury", "calm"],
  tags: ["yasuo"],
});

describe("deckZoneFilterPreset", () => {
  it("filters the legend zone to legends and clears the stat ranges", () => {
    const preset = deckZoneFilterPreset(WellKnown.deckZone.LEGEND, [], "constructed", null);

    expect(preset.arrayFilters.types).toEqual([WellKnown.cardType.LEGEND]);
    expect(preset.arrayFilters.domains).toEqual([]);
    expect(preset.clearStatRanges).toBe(true);
    expect(preset.search).toBe("");
  });

  it("searches the legend's first tag in the champion zone", () => {
    const preset = deckZoneFilterPreset(WellKnown.deckZone.CHAMPION, [legend], "constructed", null);

    expect(preset.arrayFilters.superTypes).toEqual([WellKnown.superType.CHAMPION]);
    expect(preset.search).toBe("t:yasuo");
    expect(preset.clearStatRanges).toBe(false);
  });

  it("leaves the champion search empty when the legend has no tag", () => {
    const preset = deckZoneFilterPreset(
      WellKnown.deckZone.CHAMPION,
      [stubDeckBuilderCard({ zone: WellKnown.deckZone.LEGEND, tags: [] })],
      "constructed",
      null,
    );

    expect(preset.search).toBe("");
  });

  it("adds colorless to the legend domains outside the rune zone", () => {
    const main = deckZoneFilterPreset(WellKnown.deckZone.MAIN, [legend], "constructed", null);
    const runes = deckZoneFilterPreset(WellKnown.deckZone.RUNES, [legend], "constructed", null);

    expect(main.arrayFilters.domains).toEqual(["fury", "calm", WellKnown.domain.COLORLESS]);
    expect(runes.arrayFilters.domains).toEqual(["fury", "calm"]);
  });

  it("leaves the domains empty when there is no legend", () => {
    const preset = deckZoneFilterPreset(WellKnown.deckZone.MAIN, [], "constructed", null);

    expect(preset.arrayFilters.domains).toEqual([]);
  });

  it("drops the domain prefilter in Custom Region", () => {
    const main = deckZoneFilterPreset(
      WellKnown.deckZone.MAIN,
      [legend],
      WellKnown.deckFormat.CUSTOM_REGION,
      null,
    );
    const runes = deckZoneFilterPreset(
      WellKnown.deckZone.RUNES,
      [legend],
      WellKnown.deckFormat.CUSTOM_REGION,
      null,
    );

    expect(main.arrayFilters.domains).toEqual([]);
    expect(runes.arrayFilters.domains).toEqual([]);
  });

  it("carries the format's tag lock into every zone", () => {
    const config = { tagSlugs: ["bilgewater"] };

    for (const zone of [
      WellKnown.deckZone.LEGEND,
      WellKnown.deckZone.CHAMPION,
      WellKnown.deckZone.RUNES,
      WellKnown.deckZone.BATTLEFIELD,
      WellKnown.deckZone.MAIN,
      WellKnown.deckZone.SIDEBOARD,
      WellKnown.deckZone.OVERFLOW,
    ]) {
      const preset = deckZoneFilterPreset(zone, [legend], "constructed", config);
      expect(preset.arrayFilters.customTags).toEqual(["bilgewater"]);
      expect(preset.arrayFilters.superTypesEx).toEqual([WellKnown.superType.TOKEN]);
    }
  });

  it("lets the overflow zone hold battlefields alongside the main-deck types", () => {
    const main = deckZoneFilterPreset(WellKnown.deckZone.MAIN, [], "constructed", null);
    const overflow = deckZoneFilterPreset(WellKnown.deckZone.OVERFLOW, [], "constructed", null);

    expect(main.arrayFilters.types).not.toContain(WellKnown.cardType.BATTLEFIELD);
    expect(overflow.arrayFilters.types).toContain(WellKnown.cardType.BATTLEFIELD);
  });
});
