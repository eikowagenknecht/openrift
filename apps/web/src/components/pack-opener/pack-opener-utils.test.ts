import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { isBoosterEligible } from "./pack-opener-utils";

describe("isBoosterEligible", () => {
  it("accepts a normal card with no markers", () => {
    expect(isBoosterEligible(stubPrinting({ card: { types: ["unit"] } }))).toBe(true);
  });

  it("rejects a card carrying any marker", () => {
    const printing = stubPrinting({
      card: { types: ["unit"] },
      markers: [{ id: "m-1", slug: "nexus", label: "Nexus", description: null }],
    });
    expect(isBoosterEligible(printing)).toBe(false);
  });

  it("rejects an 'other' type card (buff backsides are not standalone pulls)", () => {
    expect(isBoosterEligible(stubPrinting({ card: { types: ["other"] } }))).toBe(false);
  });

  // ADR-037: eligibility is set-membership, so a multi-type card that includes
  // "other" is still excluded even when "other" isn't its primary type.
  it("rejects a multi-type card that includes 'other' as a secondary type", () => {
    expect(isBoosterEligible(stubPrinting({ card: { types: ["unit", "other"] } }))).toBe(false);
  });
});
