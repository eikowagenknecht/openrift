import type { CardSearchIndex } from "@openrift/shared";
import { buildCardIndex, cardSearchAltNames } from "@openrift/shared";

import type { Repos } from "../deps.js";
import type { CatalogCardRow } from "../repositories/catalog.js";
import { createContentAddressedCache } from "./catalog-assembly.js";

/** A catalog card as the lookup index holds it, with its search aliases attached. */
type LookupCard = CatalogCardRow & { altNames: string[] };

export type CardLookupIndex = CardSearchIndex<LookupCard>;

/**
 * Reads the cards, their lookup codes and the curated name aliases, and folds
 * them into a ready-to-query index.
 *
 * @returns The assembled lookup index.
 */
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
 * A process-lived, content-addressed memo of the server-side card lookup index.
 *
 * This is the API's single answer to "which card did they mean?". The chat
 * endpoint ranks against it, and deck-check resolves decklist names against it,
 * so a name that finds a card in one cannot miss in the other. It is the same
 * index the pickers and the Discord bot build client-side, with the two things
 * only the server can supply folded in: the curated `card_name_aliases` keys,
 * and the colloquial Legend form derived from the card's tags.
 *
 * The whole catalogue has to be in memory for a lookup to be a scan over
 * pre-folded strings, so rebuilding it per request is out of the question. The
 * Discord bot solves this with a TTL refresh because it only talks to the API
 * over HTTP; server-side we can do better with the same helper the rule
 * catalogue uses. The memo is keyed on a cheap content-version probe rather
 * than a clock, so a card edit is visible on the next lookup with no staleness
 * window.
 *
 * @returns A zero-arg loader serving the memoized index.
 */
export function createCardLookupIndexLoader(repos: Repos): () => Promise<CardLookupIndex> {
  return createContentAddressedCache(
    () => assembleCardLookupIndex(repos),
    () => repos.catalog.catalogContentVersion(),
  );
}
