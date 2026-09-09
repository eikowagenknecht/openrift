import type {
  CardmarketStockRow,
  CardmarketUnresolvedReason,
} from "@openrift/shared/cardmarket-stock";
import {
  conditionSlugForCardmarket,
  printingLanguageForCardmarket,
} from "@openrift/shared/cardmarket-stock";
import { WellKnown } from "@openrift/shared/well-known";

import type { CardmarketProductPrintingRow } from "../repositories/cardmarket-stock.js";

export interface CardmarketResolvedRow {
  row: CardmarketStockRow;
  printingId: string;
  conditionSlug: string;
  language: string;
}

interface CardmarketUnresolvedRow {
  row: CardmarketStockRow;
  reason: CardmarketUnresolvedReason;
}

export interface CardmarketStockResolution {
  resolved: CardmarketResolvedRow[];
  unresolved: CardmarketUnresolvedRow[];
}

function productKey(externalId: number, finish: string): string {
  return `${externalId}::${finish}`;
}

// Cardmarket products are language-aggregate, so the article's own
// `idLanguage` picks among the printings behind one product.
export function resolveCardmarketStock(
  rows: readonly CardmarketStockRow[],
  productPrintings: readonly CardmarketProductPrintingRow[],
): CardmarketStockResolution {
  const byProduct = Map.groupBy(productPrintings, (p) => productKey(p.externalId, p.finish));

  const resolved: CardmarketResolvedRow[] = [];
  const unresolved: CardmarketUnresolvedRow[] = [];

  for (const row of rows) {
    const conditionSlug = conditionSlugForCardmarket(row.idCondition);
    if (conditionSlug === undefined) {
      unresolved.push({ row, reason: "unknown-condition" });
      continue;
    }
    const language = printingLanguageForCardmarket(row.idLanguage);
    if (language === undefined) {
      unresolved.push({ row, reason: "language-not-printed" });
      continue;
    }

    const finish = row.isFoil ? WellKnown.finish.FOIL : WellKnown.finish.NORMAL;
    const candidates = byProduct.get(productKey(row.idProduct, finish));
    if (candidates === undefined) {
      unresolved.push({ row, reason: "unknown-product" });
      continue;
    }

    const mapped = candidates.flatMap((c) =>
      c.printingId === null ? [] : [{ printingId: c.printingId, language: c.language }],
    );
    if (mapped.length === 0) {
      unresolved.push({ row, reason: "unmapped-product" });
      continue;
    }

    const printingIds = new Set(
      mapped.filter((c) => c.language === language).map((c) => c.printingId),
    );
    const [printingId] = printingIds;
    if (printingId === undefined) {
      unresolved.push({ row, reason: "no-printing-in-language" });
      continue;
    }
    if (printingIds.size > 1) {
      unresolved.push({ row, reason: "ambiguous-printing" });
      continue;
    }

    resolved.push({ row, printingId, conditionSlug, language });
  }

  return { resolved, unresolved };
}
