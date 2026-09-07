import type { Printing } from "@openrift/shared/types/catalog";
import { describe, expect, it } from "vitest";

import type { LoadedScanBank } from "@/lib/scan-bank";
import { buildScanPrintingIndex, finishSiblingsOf, resolveLock } from "@/lib/scan-resolve";
import { stubPrinting } from "@/test/factories";

function stubBank(artKeys: Record<string, string>): LoadedScanBank {
  return {
    bank: { keys: [], dim: 0, embeddings: new Float32Array() } as unknown as LoadedScanBank["bank"],
    artKeys: new Map(Object.entries(artKeys)),
    labels: {},
    bytes: 0,
    canonical: true,
  };
}

function withImage(printing: Printing, imageId: string): Printing {
  return { ...printing, images: [{ face: "front", imageId }] };
}

describe("buildScanPrintingIndex", () => {
  it("maps every image id to its printings and groups keys by artwork", () => {
    const normal = withImage(stubPrinting({ id: "p1", finish: "normal" }), "img-a");
    const foil = withImage(stubPrinting({ id: "p2", finish: "foil" }), "img-a");
    const other = withImage(stubPrinting({ id: "p3" }), "img-b");
    const index = buildScanPrintingIndex(
      [normal, foil, other],
      stubBank({ "img-a": "art-1", "img-b": "art-2" }),
    );
    expect(index.byImageId.get("img-a")).toEqual([normal, foil]);
    expect(index.byImageId.get("img-b")).toEqual([other]);
    expect(index.keysByArtKey.get("art-1")).toEqual(["img-a"]);
  });

  it("collects several keys of one artwork", () => {
    const index = buildScanPrintingIndex(
      [],
      stubBank({ "img-en": "art-1", "img-de": "art-1", "img-x": "art-2" }),
    );
    expect(index.keysByArtKey.get("art-1")).toEqual(["img-en", "img-de"]);
  });
});

describe("resolveLock", () => {
  const lock = (key: string, resolved: boolean) => ({ key, artKey: "art-1", resolved });

  it("auto-adds the only printing of a resolved lock", () => {
    const printing = withImage(stubPrinting({ id: "p1" }), "img-a");
    const index = buildScanPrintingIndex([printing], stubBank({ "img-a": "art-1" }));
    const resolution = resolveLock(lock("img-a", true), index);
    expect(resolution).toEqual({ kind: "auto", printing, finishSiblings: [] });
  });

  it("auto-adds the normal finish of a finish-only group and lists the foil sibling", () => {
    const shared = { shortCode: "OGN-001", cardId: "card-1" };
    const foil = withImage(stubPrinting({ id: "p-foil", finish: "foil", ...shared }), "img-a");
    const normal = withImage(
      stubPrinting({ id: "p-normal", finish: "normal", ...shared }),
      "img-a",
    );
    const index = buildScanPrintingIndex([foil, normal], stubBank({ "img-a": "art-1" }));
    const resolution = resolveLock(lock("img-a", true), index);
    expect(resolution.kind).toBe("auto");
    if (resolution.kind === "auto") {
      expect(resolution.printing.id).toBe("p-normal");
      expect(resolution.finishSiblings.map((sibling) => sibling.id)).toEqual(["p-foil"]);
    }
  });

  it("falls back to canonical rank when the group has no normal finish", () => {
    const shared = { shortCode: "OGN-002", cardId: "card-2" };
    const metal = withImage(
      stubPrinting({ id: "p-metal", finish: "metal", canonicalRank: 2, ...shared }),
      "img-a",
    );
    const foil = withImage(
      stubPrinting({ id: "p-foil", finish: "foil", canonicalRank: 1, ...shared }),
      "img-a",
    );
    const index = buildScanPrintingIndex([metal, foil], stubBank({ "img-a": "art-1" }));
    const resolution = resolveLock(lock("img-a", true), index);
    expect(resolution.kind).toBe("auto");
    if (resolution.kind === "auto") {
      expect(resolution.printing.id).toBe("p-foil");
    }
  });

  it("sends a resolved lock to the picker when the render is shared beyond finish", () => {
    const standard = withImage(
      stubPrinting({ id: "p-std", shortCode: "OGN-003", size: "standard" }),
      "img-a",
    );
    const oversized = withImage(
      stubPrinting({ id: "p-big", shortCode: "OGN-003", size: "oversized" }),
      "img-a",
    );
    const index = buildScanPrintingIndex([standard, oversized], stubBank({ "img-a": "art-1" }));
    const resolution = resolveLock(lock("img-a", true), index);
    expect(resolution.kind).toBe("picker");
    if (resolution.kind === "picker") {
      expect(resolution.candidates).toHaveLength(2);
    }
  });

  it("sends a resolved lock to the picker when an overnumbered sibling shares the render", () => {
    const inTotal = withImage(
      stubPrinting({ id: "p-in", shortCode: "OGN-003", isOvernumbered: false }),
      "img-a",
    );
    const overnumbered = withImage(
      stubPrinting({ id: "p-over", shortCode: "OGN-303", isOvernumbered: true }),
      "img-a",
    );
    const index = buildScanPrintingIndex([inTotal, overnumbered], stubBank({ "img-a": "art-1" }));
    const resolution = resolveLock(lock("img-a", true), index);
    expect(resolution.kind).toBe("picker");
    if (resolution.kind === "picker") {
      expect(resolution.candidates).toHaveLength(2);
    }
  });

  it("offers every printing of every render of the artwork for an unresolved lock", () => {
    const en = withImage(stubPrinting({ id: "p-en", language: "EN" }), "img-en");
    const de = withImage(stubPrinting({ id: "p-de", language: "DE" }), "img-de");
    const index = buildScanPrintingIndex(
      [en, de],
      stubBank({ "img-en": "art-1", "img-de": "art-1" }),
    );
    const resolution = resolveLock(lock("img-en", false), index);
    expect(resolution.kind).toBe("picker");
    if (resolution.kind === "picker") {
      expect(resolution.candidates.map((candidate) => candidate.id)).toEqual(["p-de", "p-en"]);
    }
  });

  it("resolves a language-only ambiguity to the preferred language", () => {
    const shared = { shortCode: "OGN-006", cardId: "card-6" };
    const en = withImage(stubPrinting({ id: "p-en", language: "EN", ...shared }), "img-en");
    const sc = withImage(stubPrinting({ id: "p-sc", language: "SC", ...shared }), "img-sc");
    const index = buildScanPrintingIndex(
      [en, sc],
      stubBank({ "img-en": "art-1", "img-sc": "art-1" }),
    );
    const resolution = resolveLock(lock("img-en", false), index, "EN");
    expect(resolution.kind).toBe("auto");
    if (resolution.kind === "auto") {
      expect(resolution.printing.id).toBe("p-en");
    }
  });

  it("keeps the finish default and siblings within the preferred language", () => {
    const shared = { shortCode: "OGN-007", cardId: "card-7" };
    const enFoil = withImage(
      stubPrinting({ id: "p-en-foil", finish: "foil", language: "EN", ...shared }),
      "img-en",
    );
    const enNormal = withImage(
      stubPrinting({ id: "p-en-normal", finish: "normal", language: "EN", ...shared }),
      "img-en",
    );
    const sc = withImage(
      stubPrinting({ id: "p-sc", finish: "normal", language: "SC", ...shared }),
      "img-sc",
    );
    const index = buildScanPrintingIndex(
      [enFoil, enNormal, sc],
      stubBank({ "img-en": "art-1", "img-sc": "art-1" }),
    );
    const resolution = resolveLock(lock("img-en", false), index, "EN");
    expect(resolution.kind).toBe("auto");
    if (resolution.kind === "auto") {
      expect(resolution.printing.id).toBe("p-en-normal");
      expect(resolution.finishSiblings.map((sibling) => sibling.id)).toEqual(["p-en-foil"]);
    }
  });

  it("still asks when the preferred language is not among the candidates", () => {
    const shared = { shortCode: "OGN-008", cardId: "card-8" };
    const sc = withImage(stubPrinting({ id: "p-sc", language: "SC", ...shared }), "img-sc");
    const de = withImage(stubPrinting({ id: "p-de", language: "DE", ...shared }), "img-de");
    const index = buildScanPrintingIndex(
      [sc, de],
      stubBank({ "img-sc": "art-1", "img-de": "art-1" }),
    );
    expect(resolveLock(lock("img-sc", false), index, "EN").kind).toBe("picker");
  });

  it("still asks when more than the language separates the candidates", () => {
    const en = withImage(
      stubPrinting({ id: "p-en", language: "EN", shortCode: "OGN-009", cardId: "card-9" }),
      "img-en",
    );
    const enAlt = withImage(
      stubPrinting({ id: "p-en-alt", language: "EN", shortCode: "ALT-009", cardId: "card-9" }),
      "img-en",
    );
    const sc = withImage(
      stubPrinting({ id: "p-sc", language: "SC", shortCode: "OGN-009", cardId: "card-9" }),
      "img-sc",
    );
    const index = buildScanPrintingIndex(
      [en, enAlt, sc],
      stubBank({ "img-en": "art-1", "img-sc": "art-1" }),
    );
    expect(resolveLock(lock("img-en", false), index, "EN").kind).toBe("picker");
  });

  it("overrides a resolved lock's language with the stated one", () => {
    const shared = { shortCode: "OGN-010", cardId: "card-10" };
    const sc = withImage(stubPrinting({ id: "p-sc", language: "SC", ...shared }), "img-sc");
    const en = withImage(stubPrinting({ id: "p-en", language: "EN", ...shared }), "img-en");
    const index = buildScanPrintingIndex(
      [sc, en],
      stubBank({ "img-sc": "art-1", "img-en": "art-1" }),
    );
    const resolution = resolveLock(lock("img-sc", true), index, "EN");
    expect(resolution.kind).toBe("auto");
    if (resolution.kind === "auto") {
      expect(resolution.printing.id).toBe("p-en");
    }
  });

  it("keeps the engine's language read when no language is stated", () => {
    const shared = { shortCode: "OGN-010", cardId: "card-10" };
    const sc = withImage(stubPrinting({ id: "p-sc", language: "SC", ...shared }), "img-sc");
    const en = withImage(stubPrinting({ id: "p-en", language: "EN", ...shared }), "img-en");
    const index = buildScanPrintingIndex(
      [sc, en],
      stubBank({ "img-sc": "art-1", "img-en": "art-1" }),
    );
    const resolution = resolveLock(lock("img-sc", true), index);
    expect(resolution.kind).toBe("auto");
    if (resolution.kind === "auto") {
      expect(resolution.printing.id).toBe("p-sc");
    }
  });

  it("keeps the engine's pick when the stated language has no such printing", () => {
    const shared = { shortCode: "OGN-011", cardId: "card-11" };
    const sc = withImage(stubPrinting({ id: "p-sc", language: "SC", ...shared }), "img-sc");
    const de = withImage(stubPrinting({ id: "p-de", language: "DE", ...shared }), "img-de");
    const index = buildScanPrintingIndex(
      [sc, de],
      stubBank({ "img-sc": "art-1", "img-de": "art-1" }),
    );
    const resolution = resolveLock(lock("img-sc", true), index, "EN");
    expect(resolution.kind).toBe("auto");
    if (resolution.kind === "auto") {
      expect(resolution.printing.id).toBe("p-sc");
    }
  });

  it("auto-adds the unmarked printing when a promo stamp is the only other difference", () => {
    const shared = { shortCode: "OGN-012", cardId: "card-12" };
    const normal = withImage(stubPrinting({ id: "p-normal", ...shared }), "img-a");
    const foil = withImage(stubPrinting({ id: "p-foil", finish: "foil", ...shared }), "img-a");
    const promo = withImage(
      stubPrinting({
        id: "p-promo",
        finish: "foil",
        markers: [{ id: "m-promo", slug: "promo", label: "Promo", description: null }],
        ...shared,
      }),
      "img-a",
    );
    const index = buildScanPrintingIndex([normal, foil, promo], stubBank({ "img-a": "art-1" }));
    const resolution = resolveLock(lock("img-a", false), index, "EN");
    expect(resolution.kind).toBe("auto");
    if (resolution.kind === "auto") {
      expect(resolution.printing.id).toBe("p-normal");
      expect(resolution.finishSiblings.map((sibling) => sibling.id)).toEqual(["p-foil"]);
    }
  });

  it("settles markers and language together", () => {
    const shared = { shortCode: "OGN-013", cardId: "card-13" };
    const en = withImage(stubPrinting({ id: "p-en", language: "EN", ...shared }), "img-en");
    const enPromo = withImage(
      stubPrinting({
        id: "p-en-promo",
        language: "EN",
        markers: [{ id: "m-promo", slug: "promo", label: "Promo", description: null }],
        ...shared,
      }),
      "img-en",
    );
    const sc = withImage(stubPrinting({ id: "p-sc", language: "SC", ...shared }), "img-sc");
    const index = buildScanPrintingIndex(
      [en, enPromo, sc],
      stubBank({ "img-en": "art-1", "img-sc": "art-1" }),
    );
    const resolution = resolveLock(lock("img-en", false), index, "EN");
    expect(resolution.kind).toBe("auto");
    if (resolution.kind === "auto") {
      expect(resolution.printing.id).toBe("p-en");
    }
  });

  it("still asks when the marked variant is from another set", () => {
    const promo = withImage(
      stubPrinting({
        id: "p-promo",
        shortCode: "PRM-001",
        cardId: "card-14",
        markers: [{ id: "m-promo", slug: "promo", label: "Promo", description: null }],
      }),
      "img-a",
    );
    const normal = withImage(
      stubPrinting({ id: "p-normal", shortCode: "OGN-014", cardId: "card-14" }),
      "img-a",
    );
    const index = buildScanPrintingIndex([promo, normal], stubBank({ "img-a": "art-1" }));
    expect(resolveLock(lock("img-a", false), index, "EN").kind).toBe("picker");
  });

  it("auto-adds an unresolved lock whose artwork has only one printing anyway", () => {
    const only = withImage(stubPrinting({ id: "p1" }), "img-a");
    const index = buildScanPrintingIndex([only], stubBank({ "img-a": "art-1" }));
    const resolution = resolveLock(lock("img-a", false), index);
    expect(resolution).toEqual({ kind: "auto", printing: only, finishSiblings: [] });
  });

  it("auto-adds the normal finish for an unresolved single-render artwork with a foil pair", () => {
    const shared = { shortCode: "OGN-005", cardId: "card-5" };
    const normal = withImage(
      stubPrinting({ id: "p-normal", finish: "normal", ...shared }),
      "img-a",
    );
    const foil = withImage(stubPrinting({ id: "p-foil", finish: "foil", ...shared }), "img-a");
    const index = buildScanPrintingIndex([normal, foil], stubBank({ "img-a": "art-1" }));
    const resolution = resolveLock(lock("img-a", false), index);
    expect(resolution.kind).toBe("auto");
    if (resolution.kind === "auto") {
      expect(resolution.printing.id).toBe("p-normal");
      expect(resolution.finishSiblings.map((sibling) => sibling.id)).toEqual(["p-foil"]);
    }
  });

  it("reports unknown when the catalog has no printing for the render", () => {
    const index = buildScanPrintingIndex([], stubBank({ "img-a": "art-1" }));
    expect(resolveLock(lock("img-a", true), index)).toEqual({ kind: "unknown" });
    expect(resolveLock(lock("img-a", false), index)).toEqual({ kind: "unknown" });
  });
});

describe("finishSiblingsOf", () => {
  it("returns same-variant printings of the render, excluding the printing itself", () => {
    const shared = { shortCode: "OGN-004", cardId: "card-4" };
    const normal = withImage(
      stubPrinting({ id: "p-normal", finish: "normal", ...shared }),
      "img-a",
    );
    const foil = withImage(stubPrinting({ id: "p-foil", finish: "foil", ...shared }), "img-a");
    const otherLanguage = withImage(
      stubPrinting({ id: "p-de", finish: "foil", language: "DE", ...shared }),
      "img-a",
    );
    const index = buildScanPrintingIndex(
      [normal, foil, otherLanguage],
      stubBank({ "img-a": "art-1" }),
    );
    expect(finishSiblingsOf(normal, index).map((sibling) => sibling.id)).toEqual(["p-foil"]);
    expect(finishSiblingsOf(foil, index).map((sibling) => sibling.id)).toEqual(["p-normal"]);
  });
});
