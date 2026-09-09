import type { CardmarketStockRow } from "@openrift/shared/cardmarket-stock";
import { describe, expect, it } from "vitest";

import type { CardmarketProductPrintingRow } from "../repositories/cardmarket-stock.js";
import { presentCardmarketStockResolution } from "./cardmarket-stock-presenters.js";

const row: CardmarketStockRow = {
  idProduct: 904_070,
  isFoil: false,
  idLanguage: 3,
  idCondition: 2,
  amount: 2,
  priceCents: 250,
  comment: "stamped",
  isSigned: false,
  isAltered: false,
};

const productPrintings: CardmarketProductPrintingRow[] = [
  {
    externalId: 904_070,
    finish: "normal",
    productName: "Ambessa, The Wolf",
    printingId: null,
    language: null,
  },
];

describe("presentCardmarketStockResolution", () => {
  it("names the Cardmarket language an unresolved article claims", () => {
    const response = presentCardmarketStockResolution(
      { resolved: [], unresolved: [{ row, reason: "language-not-printed" }] },
      productPrintings,
    );

    expect(response.unresolved[0]).toEqual({
      idProduct: 904_070,
      isFoil: false,
      amount: 2,
      reason: "language-not-printed",
      productName: "Ambessa, The Wolf",
      languageName: "German",
    });
  });

  it("leaves the product name null when the pull never saw that product", () => {
    const response = presentCardmarketStockResolution(
      { resolved: [], unresolved: [{ row: { ...row, idProduct: 1 }, reason: "unknown-product" }] },
      productPrintings,
    );

    expect(response.unresolved[0]?.productName).toBeNull();
  });

  it("carries the article's own fields through to a resolved row", () => {
    const response = presentCardmarketStockResolution(
      {
        resolved: [
          {
            row: { ...row, idLanguage: 1 },
            printingId: "printing-en",
            conditionSlug: "near-mint",
            language: "EN",
          },
        ],
        unresolved: [],
      },
      productPrintings,
    );

    expect(response.resolved[0]).toEqual({
      idProduct: 904_070,
      isFoil: false,
      amount: 2,
      priceCents: 250,
      comment: "stamped",
      isSigned: false,
      isAltered: false,
      printingId: "printing-en",
      conditionSlug: "near-mint",
      language: "EN",
    });
  });
});
