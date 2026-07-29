import { describe, expect, it } from "vitest";

import { buildSnapshot } from "./catalog-cache.js";
import { printingChoices, resolvePrinting } from "./printing-choice.js";
import {
  makeCard,
  makeCatalogResponse,
  makeInitResponse,
  makePricesResponse,
  makePrinting,
  makeSet,
} from "./test/factories.js";

const card = makeCard({ id: "c1" });

function snapshotWith(printings = defaultPrintings()) {
  return buildSnapshot(
    makeCatalogResponse([card], printings, [
      makeSet(),
      makeSet({ id: "set-2", slug: "SFB", name: "Spirit Blossom" }),
    ]),
    makePricesResponse(),
    makeInitResponse(),
  );
}

function defaultPrintings() {
  return [
    makePrinting({ id: "p1", cardId: "c1", canonicalRank: 1 }),
    makePrinting({
      id: "p2",
      cardId: "c1",
      canonicalRank: 2,
      setId: "set-2",
      shortCode: "SFB-011",
      publicCode: "SFB-011/120",
    }),
    makePrinting({
      id: "p3",
      cardId: "c1",
      canonicalRank: 3,
      shortCode: "OGN-202",
      publicCode: "OGN-202/298",
      language: "DE",
    }),
  ];
}

describe("printingChoices", () => {
  it("lists the default printing first, marked as default, with printing ids as values", () => {
    const choices = printingChoices(snapshotWith(), card, "");
    expect(choices.map((c) => c.value)).toEqual(["p1", "p2", "p3"]);
    expect(choices[0]?.name).toBe("OGN-202/298 · Origins (default)");
    expect(choices[1]?.name).toBe("SFB-011/120 · Spirit Blossom");
  });

  it("appends the language for non-EN printings", () => {
    const choices = printingChoices(snapshotWith(), card, "");
    expect(choices[2]?.name).toBe("OGN-202/298 · Origins · DE");
  });

  it("filters by the typed text against code and set name", () => {
    expect(printingChoices(snapshotWith(), card, "blossom").map((c) => c.value)).toEqual(["p2"]);
    expect(printingChoices(snapshotWith(), card, "sfb-011").map((c) => c.value)).toEqual(["p2"]);
  });

  it("returns empty for a card without printings", () => {
    expect(printingChoices(snapshotWith([]), card, "")).toEqual([]);
  });

  it("caps the choices at Discord's limit of 25", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      makePrinting({ id: `p${i}`, cardId: "c1", canonicalRank: i + 1 }),
    );
    expect(printingChoices(snapshotWith(many), card, "")).toHaveLength(25);
  });
});

describe("resolvePrinting", () => {
  it("returns the default printing for empty input", () => {
    expect(resolvePrinting(snapshotWith(), card, undefined)?.id).toBe("p1");
    expect(resolvePrinting(snapshotWith(), card, "  ")?.id).toBe("p1");
  });

  it("resolves a printing id from autocomplete", () => {
    expect(resolvePrinting(snapshotWith(), card, "p2")?.id).toBe("p2");
  });

  it("resolves short codes and public codes case-insensitively", () => {
    expect(resolvePrinting(snapshotWith(), card, "sfb-011")?.id).toBe("p2");
    expect(resolvePrinting(snapshotWith(), card, "SFB-011/120")?.id).toBe("p2");
  });

  it("resolves codes typed without separators, like the site's search", () => {
    expect(resolvePrinting(snapshotWith(), card, "sfb011")?.id).toBe("p2");
    expect(resolvePrinting(snapshotWith(), card, "sfb011120")?.id).toBe("p2");
  });

  it("falls back to the default printing for unrecognized input", () => {
    expect(resolvePrinting(snapshotWith(), card, "nonsense")?.id).toBe("p1");
  });

  it("returns undefined for a card without printings", () => {
    expect(resolvePrinting(snapshotWith([]), card, "anything")).toBeUndefined();
  });
});
