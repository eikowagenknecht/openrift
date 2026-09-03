import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { buildRunesByDomain } from "./deck-runes-by-domain";

const RUNE = WellKnown.cardType.RUNE;

describe("buildRunesByDomain", () => {
  it("groups rune cards under each of their domains", () => {
    const rune = stubPrinting({ card: { types: [RUNE], domains: ["fury", "calm"] } });
    const nonRune = stubPrinting({ card: { types: ["unit"], domains: ["fury"] } });
    const byDomain = buildRunesByDomain([rune, nonRune]);

    expect(byDomain.get("fury")).toHaveLength(1);
    expect(byDomain.get("calm")).toHaveLength(1);
    expect(byDomain.get("fury")?.[0].cardId).toBe(rune.cardId);
  });

  // ADR-037: rune membership is set-based, so a multi-type card that includes
  // Rune as a secondary type is still collected. Reading the scalar `type`
  // (its primary) would drop it.
  it("includes a multi-type card that has Rune as a secondary type", () => {
    const multi = stubPrinting({ card: { types: ["unit", RUNE], domains: ["order"] } });
    const byDomain = buildRunesByDomain([multi]);

    expect(byDomain.get("order")).toHaveLength(1);
    expect(byDomain.get("order")?.[0].cardId).toBe(multi.cardId);
  });

  it("returns an empty map when there are no runes", () => {
    const byDomain = buildRunesByDomain([stubPrinting({ card: { types: ["unit"] } })]);
    expect(byDomain.size).toBe(0);
  });
});
