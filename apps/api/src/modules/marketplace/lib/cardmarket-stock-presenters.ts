import type { CardmarketUnresolvedReason } from "@openrift/shared/cardmarket-stock";
import { cardmarketLanguageName } from "@openrift/shared/cardmarket-stock";

import type { CardmarketProductPrintingRow } from "../repositories/cardmarket-stock.js";
import type { CardmarketStockResolution } from "./cardmarket-stock-resolve.js";

export interface CardmarketStockResolutionResponse {
  resolved: {
    idProduct: number;
    isFoil: boolean;
    amount: number;
    priceCents: number;
    comment: string;
    isSigned: boolean;
    isAltered: boolean;
    printingId: string;
    conditionSlug: string;
    language: string;
  }[];
  unresolved: {
    idProduct: number;
    isFoil: boolean;
    amount: number;
    reason: CardmarketUnresolvedReason;
    productName: string | null;
    languageName: string | null;
  }[];
}

export function presentCardmarketStockResolution(
  resolution: CardmarketStockResolution,
  productPrintings: readonly CardmarketProductPrintingRow[],
): CardmarketStockResolutionResponse {
  const productNames = new Map(productPrintings.map((p) => [p.externalId, p.productName]));

  return {
    resolved: resolution.resolved.map(({ row, printingId, conditionSlug, language }) => ({
      idProduct: row.idProduct,
      isFoil: row.isFoil,
      amount: row.amount,
      priceCents: row.priceCents,
      comment: row.comment,
      isSigned: row.isSigned,
      isAltered: row.isAltered,
      printingId,
      conditionSlug,
      language,
    })),
    unresolved: resolution.unresolved.map(({ row, reason }) => ({
      idProduct: row.idProduct,
      isFoil: row.isFoil,
      amount: row.amount,
      reason,
      productName: productNames.get(row.idProduct) ?? null,
      languageName: cardmarketLanguageName(row.idLanguage) ?? null,
    })),
  };
}
