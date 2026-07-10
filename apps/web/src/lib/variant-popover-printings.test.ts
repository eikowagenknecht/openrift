import type { Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { resolveVariantPopoverPrintings } from "@/lib/variant-popover-printings";
import { stubPrinting } from "@/test/factories";

const CARD_ID = "card-unyielding";

const enNormal = stubPrinting({ id: "en-normal", cardId: CARD_ID, language: "EN", setId: "ogn" });
const enFoil = stubPrinting({ id: "en-foil", cardId: CARD_ID, language: "EN", setId: "ogn" });
const enOtherSet = stubPrinting({ id: "en-other", cardId: CARD_ID, language: "EN", setId: "sup" });

function mapOf(printings: Printing[]): Map<string, Printing[]> {
  const map = new Map<string, Printing[]>();
  for (const printing of printings) {
    const list = map.get(printing.cardId) ?? [];
    list.push(printing);
    map.set(printing.cardId, list);
  }
  return map;
}

describe("resolveVariantPopoverPrintings", () => {
  it("returns undefined when no popover is open", () => {
    const catalog = mapOf([enNormal, enFoil]);
    expect(resolveVariantPopoverPrintings(catalog, catalog, null)).toBeUndefined();
  });

  it("uses the catalog projection when the card is present there", () => {
    const catalog = mapOf([enNormal, enFoil]);
    const languageScoped = mapOf([enNormal, enFoil, enOtherSet]);
    // Catalog wins even though the language-scoped map holds an extra variant.
    const result = resolveVariantPopoverPrintings(catalog, languageScoped, { cardId: CARD_ID });
    expect(result).toEqual([enNormal, enFoil]);
  });

  it("falls back to the language-scoped list when the catalog projection dropped the card", () => {
    // The group bulk box shows a card the viewer owns only in a filtered-out
    // language, so the owned-bucket catalog projection has no entry for it.
    const catalog = new Map<string, Printing[]>();
    const languageScoped = mapOf([enNormal, enFoil]);
    const result = resolveVariantPopoverPrintings(catalog, languageScoped, { cardId: CARD_ID });
    expect(result).toEqual([enNormal, enFoil]);
  });

  it("returns undefined when the card is in neither source", () => {
    expect(
      resolveVariantPopoverPrintings(new Map(), new Map(), { cardId: CARD_ID }),
    ).toBeUndefined();
  });

  it("scopes to a single printing when printingId is set", () => {
    const catalog = mapOf([enNormal, enFoil]);
    const result = resolveVariantPopoverPrintings(catalog, catalog, {
      cardId: CARD_ID,
      printingId: "en-foil",
    });
    expect(result).toEqual([enFoil]);
  });

  it("scopes to a set when setId is set", () => {
    const catalog = mapOf([enNormal, enFoil, enOtherSet]);
    const result = resolveVariantPopoverPrintings(catalog, catalog, {
      cardId: CARD_ID,
      setId: "ogn",
    });
    expect(result).toEqual([enNormal, enFoil]);
  });

  it("applies set scoping to the fallback list too", () => {
    const languageScoped = mapOf([enNormal, enFoil, enOtherSet]);
    const result = resolveVariantPopoverPrintings(new Map(), languageScoped, {
      cardId: CARD_ID,
      setId: "sup",
    });
    expect(result).toEqual([enOtherSet]);
  });
});
