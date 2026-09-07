import { describe, expect, it } from "vitest";

import { scanArtKey } from "./scan-bank.js";

const base = { setSlug: "origins", name: "Jinx", artVariant: "normal", isOvernumbered: false };

describe("scanArtKey", () => {
  it("keys an overnumbered print apart from the in-total print of the same card", () => {
    expect(scanArtKey(base)).not.toBe(scanArtKey({ ...base, isOvernumbered: true }));
  });

  it("keys an overnumbered alt art apart from both the plain alt art and the plain print", () => {
    const keys = [
      scanArtKey(base),
      scanArtKey({ ...base, artVariant: "altart" }),
      scanArtKey({ ...base, artVariant: "altart", isOvernumbered: true }),
    ];
    expect(new Set(keys).size).toBe(3);
  });

  it("collapses a null art variant onto the empty segment", () => {
    expect(scanArtKey({ ...base, artVariant: null })).toBe("origins|Jinx||");
  });

  it("matches the scan script's four-segment key layout", () => {
    expect(scanArtKey({ ...base, isOvernumbered: true }).split("|")).toEqual([
      "origins",
      "Jinx",
      "normal",
      "over",
    ]);
  });
});
