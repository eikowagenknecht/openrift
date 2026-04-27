import type { CatalogResponse } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";
import { createServerFn } from "@tanstack/react-start";

import { readCatalogFromServerCache } from "@/lib/catalog-query";

export interface FirstRowCard {
  printingId: string;
  cardName: string;
  thumbnail: string;
  full: string;
}

const FIRST_ROW_LIMIT = 12;

/**
 * Slim, SSR-only view of the first N catalog printings in canonical order
 * (battlefields excluded). Used to seed real `<img>` tags in the SSR HTML so
 * the browser's preload scanner can fetch the LCP image before hydration.
 * @param catalog The catalog response held in `serverCache`.
 * @param limit Maximum number of cards to return.
 * @returns Up to `limit` slim card entries, sorted by `canonicalRank`.
 */
export function extractFirstRow(catalog: CatalogResponse, limit: number): FirstRowCard[] {
  const result: FirstRowCard[] = [];
  const candidates: { printingId: string; canonicalRank: number; cardId: string }[] = [];

  for (const [printingId, printing] of Object.entries(catalog.printings)) {
    const card = catalog.cards[printing.cardId];
    if (!card || getOrientation(card.type) === "landscape") {
      continue;
    }
    candidates.push({ printingId, canonicalRank: printing.canonicalRank, cardId: printing.cardId });
  }

  candidates.sort((a, b) => a.canonicalRank - b.canonicalRank);

  for (const { printingId, cardId } of candidates) {
    if (result.length >= limit) {
      break;
    }
    const printing = catalog.printings[printingId];
    const card = catalog.cards[cardId];
    if (!printing || !card) {
      continue;
    }
    const front = printing.images.find((img) => img.face === "front") ?? printing.images[0];
    if (!front) {
      continue;
    }
    result.push({
      printingId,
      cardName: card.name,
      thumbnail: front.thumbnail,
      full: front.full,
    });
  }

  return result;
}

export const fetchFirstRowCards = createServerFn({ method: "GET" }).handler(
  async (): Promise<FirstRowCard[]> => {
    const catalog = await readCatalogFromServerCache();
    return extractFirstRow(catalog, FIRST_ROW_LIMIT);
  },
);
