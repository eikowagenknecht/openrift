import { describe, expect, it } from "vitest";

import { isCountedZone } from "./deck-zones.js";
import { WellKnown } from "./well-known.js";

describe("isCountedZone", () => {
  it("counts every zone of the deck proper", () => {
    expect(isCountedZone(WellKnown.deckZone.LEGEND)).toBe(true);
    expect(isCountedZone(WellKnown.deckZone.CHAMPION)).toBe(true);
    expect(isCountedZone(WellKnown.deckZone.RUNES)).toBe(true);
    expect(isCountedZone(WellKnown.deckZone.BATTLEFIELD)).toBe(true);
    expect(isCountedZone(WellKnown.deckZone.MAIN)).toBe(true);
    expect(isCountedZone(WellKnown.deckZone.SIDEBOARD)).toBe(true);
  });

  it("leaves out the overflow parking zone", () => {
    expect(isCountedZone(WellKnown.deckZone.OVERFLOW)).toBe(false);
  });

  it("counts an unrecognized zone rather than dropping its cards", () => {
    expect(isCountedZone("not-a-zone")).toBe(true);
  });
});
