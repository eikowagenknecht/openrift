import type { DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";

import type { Repos } from "../../../deps.js";
import type { CardNameIndex } from "../../candidates/services/candidate-links.js";
import { resolveCardIdByName } from "../../candidates/services/candidate-links.js";
import { defaultMetaDeckName } from "../lib/meta-event-naming.js";
import { PLAYLOLTCG_PROVIDER } from "../lib/playloltcg-catalog.js";
import { TOPDECK_PROVIDER } from "../lib/topdeck-catalog.js";
import { UVSGAMES_PROVIDER } from "../lib/uvsgames-catalog.js";
import { listStatusFor, withSingleChampion } from "../lib/uvsgames-transform.js";
import type { MetaArchivedDeckInput, MetaDeckCardInput } from "../repositories/meta-decks.js";
import { deckCardMergeKey, mergeDeckCards } from "../repositories/meta-decks.js";
import type { MetaEventSourceRow } from "../repositories/meta-sources.js";
import type { StandingFacts } from "./meta-promote-shared.js";

export type SourceDeckLines = Map<string, { zone: string; quantity: number; cardName: string }[]>;

/**
 * Deck ids are only unique within a provider, so the map that holds every
 * linked mirror's lists is keyed by both.
 */
function deckLineKey(provider: string, sourceDeckId: string): string {
  return `${provider}:${sourceDeckId}`;
}

/** Every held decklist for the event's linked mirrors, one query per provider. */
export async function loadDeckLines(
  repos: Repos,
  sources: readonly MetaEventSourceRow[],
  providers: ReadonlySet<string>,
): Promise<SourceDeckLines> {
  const lines: SourceDeckLines = new Map();
  for (const source of sources) {
    if (source.externalId === null) {
      continue;
    }
    if (source.provider === UVSGAMES_PROVIDER && providers.has(UVSGAMES_PROVIDER)) {
      for (const [deckId, rows] of await repos.uvsgamesResults.decklistCards(source.externalId)) {
        lines.set(deckLineKey(UVSGAMES_PROVIDER, deckId), rows);
      }
    }
    if (source.provider === PLAYLOLTCG_PROVIDER && providers.has(PLAYLOLTCG_PROVIDER)) {
      const activityShopId = Number(source.externalId);
      if (Number.isInteger(activityShopId)) {
        for (const [deckId, rows] of await repos.playloltcgResults.decklistCards(activityShopId)) {
          lines.set(deckLineKey(PLAYLOLTCG_PROVIDER, deckId), rows);
        }
      }
    }
    if (source.provider === TOPDECK_PROVIDER && providers.has(TOPDECK_PROVIDER)) {
      for (const [deckId, rows] of await repos.topdeckResults.decklistCards(source.externalId)) {
        lines.set(deckLineKey(TOPDECK_PROVIDER, deckId), rows);
      }
    }
  }
  return lines;
}

/** An unresolved decklist line yields no deck, never a partial one. */
export function buildDeck(
  standing: StandingFacts,
  playerName: string,
  legendCardId: string | null,
  format: string,
  eventName: string,
  deckLines: SourceDeckLines,
  cardIndex: CardNameIndex,
  unresolved: Set<string>,
  mergedLines: Set<string>,
): MetaArchivedDeckInput | null {
  if (standing.sourceDeckId === null) {
    return null;
  }
  const lines = withSingleChampion(
    deckLines.get(deckLineKey(standing.provider, standing.sourceDeckId)) ?? [],
  );
  if (lines.length === 0) {
    return null;
  }

  const cards: MetaDeckCardInput[] = [];
  const sourceNames = new Map<string, Set<string>>();
  for (const line of lines) {
    const cardId = resolveCardIdByName(cardIndex, line.cardName);
    if (cardId === null) {
      unresolved.add(line.cardName);
      return null;
    }
    const card = {
      cardId,
      zone: line.zone as DeckZone,
      quantity: line.quantity,
      preferredPrintingId: null,
    };
    cards.push(card);
    const key = deckCardMergeKey(card);
    const names = sourceNames.get(key);
    if (names === undefined) {
      sourceNames.set(key, new Set([line.cardName]));
    } else {
      names.add(line.cardName);
    }
  }

  const hasLegend = cards.some((card) => card.zone === WellKnown.deckZone.LEGEND);
  if (!hasLegend && legendCardId !== null) {
    cards.push({
      cardId: legendCardId,
      zone: WellKnown.deckZone.LEGEND as DeckZone,
      quantity: 1,
      preferredPrintingId: null,
    });
  }

  const lineCounts = new Map<string, number>();
  for (const card of cards) {
    const key = deckCardMergeKey(card);
    lineCounts.set(key, (lineCounts.get(key) ?? 0) + 1);
  }
  const folded = mergeDeckCards(cards);
  for (const card of folded) {
    const key = deckCardMergeKey(card);
    const count = lineCounts.get(key) ?? 1;
    if (count > 1) {
      const names = [...(sourceNames.get(key) ?? new Set([card.cardId]))].sort();
      mergedLines.add(`${names.join(" / ")} (${card.zone}): ${count} lines -> ${card.quantity}`);
    }
  }

  return {
    name: defaultMetaDeckName(standing.legendName, playerName, eventName),
    format,
    formatConfig: null,
    cards: folded,
    listStatus: listStatusFor(
      lines.map((line) => ({ name: line.cardName, zone: line.zone, quantity: line.quantity })),
      standing.legendName,
    ),
  };
}
