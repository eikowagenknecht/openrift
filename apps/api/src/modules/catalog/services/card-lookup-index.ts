import type { CardSearchIndex } from "@openrift/shared/card-search";
import { buildCardIndex } from "@openrift/shared/card-search";
import { cardSearchAltNames } from "@openrift/shared/utils";

import type { Repos } from "../../../deps.js";
import type { CatalogCardRow } from "../repositories/catalog.js";
import { createContentAddressedCache } from "./catalog-assembly.js";

type LookupCard = CatalogCardRow & { altNames: string[] };

export type CardLookupIndex = CardSearchIndex<LookupCard>;

async function assembleCardLookupIndex(repos: Repos): Promise<CardLookupIndex> {
  const [cards, codes, aliases] = await Promise.all([
    repos.catalog.cards(),
    repos.catalog.printingCodes(),
    repos.catalog.nameAliases(),
  ]);
  const aliasesByCard = Map.groupBy(aliases, (row) => row.cardId);
  const withAltNames = cards.map((card) => ({
    ...card,
    altNames: cardSearchAltNames(
      card,
      (aliasesByCard.get(card.id) ?? []).map((row) => row.normName),
    ),
  }));
  return buildCardIndex(
    withAltNames,
    Map.groupBy(codes, (row) => row.cardId),
  );
}

/**
 * Shared by the chat endpoint and deck-check so a name found by one cannot miss in the other.
 * Cache key is a content-version probe, not a clock: an edit invalidates it immediately.
 */
export function createCardLookupIndexLoader(repos: Repos): () => Promise<CardLookupIndex> {
  return createContentAddressedCache(
    () => assembleCardLookupIndex(repos),
    () => repos.catalog.catalogContentVersion(),
  );
}
