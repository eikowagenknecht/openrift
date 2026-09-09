import type { CardmarketStockRow } from "@openrift/shared/cardmarket-stock";
import { describe, expect, it } from "vitest";

import type { CardmarketProductPrintingRow } from "../repositories/cardmarket-stock.js";
import { resolveCardmarketStock } from "./cardmarket-stock-resolve.js";

function stockRow(overrides: Partial<CardmarketStockRow> = {}): CardmarketStockRow {
  return {
    idProduct: 904_070,
    isFoil: false,
    idLanguage: 1,
    idCondition: 2,
    amount: 1,
    priceCents: 250,
    comment: "",
    isSigned: false,
    isAltered: false,
    ...overrides,
  };
}

function productPrinting(
  overrides: Partial<CardmarketProductPrintingRow> = {},
): CardmarketProductPrintingRow {
  return {
    externalId: 904_070,
    finish: "normal",
    productName: "Ambessa, The Wolf",
    printingId: "printing-en",
    language: "EN",
    ...overrides,
  };
}

describe("resolveCardmarketStock", () => {
  it("resolves an article to the printing in its own language", () => {
    const result = resolveCardmarketStock(
      [stockRow({ idLanguage: 2 })],
      [
        productPrinting({ printingId: "printing-en", language: "EN" }),
        productPrinting({ printingId: "printing-fr", language: "FR" }),
      ],
    );

    expect(result.unresolved).toEqual([]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]).toMatchObject({
      printingId: "printing-fr",
      language: "FR",
      conditionSlug: "near-mint",
    });
  });

  it("keeps foil and normal articles on their own products", () => {
    const result = resolveCardmarketStock(
      [stockRow({ isFoil: true })],
      [
        productPrinting({ finish: "normal", printingId: "printing-normal" }),
        productPrinting({ finish: "foil", printingId: "printing-foil" }),
      ],
    );

    expect(result.resolved[0]?.printingId).toBe("printing-foil");
  });

  it("reports an article in a language Riftbound is not printed in", () => {
    const result = resolveCardmarketStock([stockRow({ idLanguage: 3 })], [productPrinting()]);

    expect(result.resolved).toEqual([]);
    expect(result.unresolved[0]?.reason).toBe("language-not-printed");
  });

  it("separates a product nobody mapped from a product it has never seen", () => {
    const unmapped = resolveCardmarketStock(
      [stockRow()],
      [productPrinting({ printingId: null, language: null })],
    );
    expect(unmapped.unresolved[0]?.reason).toBe("unmapped-product");

    const unknown = resolveCardmarketStock([stockRow({ idProduct: 999_999 })], [productPrinting()]);
    expect(unknown.unresolved[0]?.reason).toBe("unknown-product");
  });

  it("reports a mapped product with no printing in the article's language", () => {
    const result = resolveCardmarketStock(
      [stockRow({ idLanguage: 10 })],
      [productPrinting({ language: "EN" })],
    );

    expect(result.unresolved[0]?.reason).toBe("no-printing-in-language");
  });

  it("refuses to guess when one product and finish covers two printings in a language", () => {
    const result = resolveCardmarketStock(
      [stockRow({ isFoil: true })],
      [
        productPrinting({ finish: "foil", printingId: "printing-foil", language: "EN" }),
        productPrinting({ finish: "foil", printingId: "printing-metal", language: "EN" }),
      ],
    );

    expect(result.resolved).toEqual([]);
    expect(result.unresolved[0]?.reason).toBe("ambiguous-printing");
  });

  it("rejects a condition outside Cardmarket's seven tiers", () => {
    const result = resolveCardmarketStock([stockRow({ idCondition: 9 })], [productPrinting()]);

    expect(result.unresolved[0]?.reason).toBe("unknown-condition");
  });

  it("resolves and reports in one pass", () => {
    const result = resolveCardmarketStock(
      [stockRow(), stockRow({ idLanguage: 3 }), stockRow({ idProduct: 999_999 })],
      [productPrinting()],
    );

    expect(result.resolved).toHaveLength(1);
    expect(result.unresolved.map((u) => u.reason)).toEqual([
      "language-not-printed",
      "unknown-product",
    ]);
  });
});
