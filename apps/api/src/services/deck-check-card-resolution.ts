import { normalizeNameForIdentity, resolveCard } from "@openrift/shared";

import type { Repos } from "../deps.js";
import type { CardResolution } from "../repositories/deck-check.js";
import type { CardLookupIndex } from "./card-lookup-index.js";
import { createCardLookupIndexLoader } from "./card-lookup-index.js";

interface CardResolutionInput {
  name: string;
}

/**
 * The lookup key {@link resolveDeckCheckCards} results are keyed by.
 *
 * This is an identity key, not a search key: its only job is to collapse the
 * repeated spellings inside one batch onto a single lookup, and to let a caller
 * find its own line's result again. Matching itself is the ranked matcher's.
 *
 * @param name The raw name as written on the decklist.
 * @returns The normalized card name.
 */
export function cardResolutionKey(name: string): string {
  return normalizeNameForIdentity(name);
}

/** One index loader per `Repos`, so a batch does not rebuild the catalogue. */
const loaders = new WeakMap<Repos, () => Promise<CardLookupIndex>>();

/** @returns The memoized lookup-index loader for this app's repos. */
function loaderFor(repos: Repos): () => Promise<CardLookupIndex> {
  let loader = loaders.get(repos);
  if (!loader) {
    loader = createCardLookupIndexLoader(repos);
    loaders.set(repos, loader);
  }
  return loader;
}

const UNMATCHED: CardResolution = {
  resolvedCardId: null,
  resolvedPrintingId: null,
  matchStatus: "unmatched",
};

const AMBIGUOUS: CardResolution = {
  resolvedCardId: null,
  resolvedPrintingId: null,
  matchStatus: "ambiguous",
};

/**
 * Resolves the raw card names on a decklist against the catalogue.
 *
 * Runs against the shared in-memory lookup index, so a name that finds a card
 * in a picker, in chat or in the Discord bot finds the same card here. That
 * index carries the curated aliases and the colloquial Legend form, which this
 * used to reproduce with its own SQL and its own `legendComboResolutions`
 * helper. Exactly one candidate is `matched`, several are `ambiguous`, none is
 * `unmatched`. For a match the canonical printing is read purely to source a
 * thumbnail.
 *
 * @param repos The app's repositories.
 * @param inputs Distinct or repeated raw names; resolved in one batch.
 * @returns Resolutions keyed by {@link cardResolutionKey}.
 */
export async function resolveDeckCheckCards(
  repos: Repos,
  inputs: CardResolutionInput[],
): Promise<Map<string, CardResolution>> {
  const results = new Map<string, CardResolution>();
  // Deduplicated by identity key, but resolved from the raw name: the key
  // strips the punctuation the matcher wants to see.
  const byKey = new Map<string, string>();
  for (const input of inputs) {
    const key = cardResolutionKey(input.name);
    if (!byKey.has(key)) {
      byKey.set(key, input.name);
    }
  }
  if (byKey.size === 0) {
    return results;
  }

  const index = await loaderFor(repos)();
  const matchedCardByKey = new Map<string, string>();
  for (const [key, name] of byKey) {
    const resolution = resolveCard(index, name);
    if (resolution.status === "matched") {
      matchedCardByKey.set(key, resolution.card.id);
    } else {
      results.set(key, resolution.status === "ambiguous" ? AMBIGUOUS : UNMATCHED);
    }
  }

  const thumbnailByCard = await repos.deckCheck.canonicalPrintingByCard([
    ...new Set(matchedCardByKey.values()),
  ]);
  for (const [key, cardId] of matchedCardByKey) {
    results.set(key, {
      resolvedCardId: cardId,
      resolvedPrintingId: thumbnailByCard.get(cardId) ?? null,
      matchStatus: "matched",
    });
  }

  return results;
}
