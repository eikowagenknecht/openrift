import { validateDeck, WellKnown } from "@openrift/shared";
import type {
  CardType,
  DeckCheckEntryCardResponse,
  DeckCheckMatchStatus,
  DeckViolation,
  DeckZone,
  Domain,
  SuperType,
} from "@openrift/shared";

import type { Repos } from "../deps.js";
import type { DeckCheckEntryCard } from "../repositories/deck-check.js";

/**
 * The card-line shape the advisory computation needs: satisfied both by stored
 * `deck_check_entry_cards` rows and by not-yet-persisted submission previews.
 */
export interface AdvisoryCardLine {
  rawName: string;
  zone: string;
  quantity: number;
  resolvedCardId: string | null;
  matchStatus: DeckCheckMatchStatus;
}

export interface EntryAdvisories {
  violations: DeckViolation[];
  typeCounts: { cardType: CardType; count: number }[];
  domainDistribution: { domain: Domain; count: number }[];
}

/**
 * Maps a stored entry-card row onto the response shape both the checker and
 * the player view render.
 * @returns The card-line response.
 */
export function toDeckCheckEntryCardResponse(row: DeckCheckEntryCard): DeckCheckEntryCardResponse {
  return {
    id: row.id,
    sortOrder: row.sortOrder,
    rawName: row.rawName,
    section: row.section,
    zone: row.zone as DeckZone,
    quantity: row.quantity,
    matchStatus: row.matchStatus,
    foundCopies: Array.from({ length: row.quantity }, (_copy, index) =>
      Boolean(row.foundCopies[index]),
    ),
    resolvedCardId: row.resolvedCardId,
    resolvedPrintingId: row.resolvedPrintingId,
  };
}

/**
 * Computes the advisory signals the checker and the player view share: the
 * deck-rules violations for the event's format, the allowed-sets findings, and
 * the deck-stat aggregates (same counting the deck list uses: main+champion
 * zones, legend/rune/battlefield types excluded from type counts).
 * @returns Violations and stat aggregates; none of them block a check.
 */
export async function buildEntryAdvisories(
  repos: Repos,
  event: { format: string | null; allowedSets: string[] | null },
  cards: AdvisoryCardLine[],
): Promise<EntryAdvisories> {
  const matchedIds = [
    ...new Set(
      cards.flatMap((card) =>
        card.matchStatus === "matched" && card.resolvedCardId ? [card.resolvedCardId] : [],
      ),
    ),
  ];
  const [enumRows, details, setSlugsByCard] = await Promise.all([
    repos.enums.all(),
    repos.deckCheck.getCardDetails(matchedIds),
    event.allowedSets && event.allowedSets.length > 0
      ? repos.deckCheck.getCardSetSlugs(matchedIds)
      : Promise.resolve(new Map<string, string[]>()),
  ]);

  const violations: DeckViolation[] = [];

  if (event.format) {
    const deckCards = cards.flatMap((card) => {
      const detail = card.resolvedCardId ? details.get(card.resolvedCardId) : undefined;
      if (!detail) {
        return [];
      }
      return [
        {
          cardId: detail.id,
          zone: card.zone as DeckZone,
          quantity: card.quantity,
          cardName: detail.name,
          cardType: detail.type as CardType,
          superTypes: detail.superTypes as SuperType[],
          domains: detail.domains as Domain[],
          tags: detail.tags,
          customTagSlugs: [],
          keywords: detail.keywords,
        },
      ];
    });
    violations.push(...validateDeck({ format: event.format, cards: deckCards }));
  }

  if (event.allowedSets && event.allowedSets.length > 0) {
    const allowed = new Set(event.allowedSets.map((setId) => setId.toLowerCase()));
    for (const card of cards) {
      if (!card.resolvedCardId || card.matchStatus !== "matched") {
        continue;
      }
      const cardSets = setSlugsByCard.get(card.resolvedCardId) ?? [];
      if (!cardSets.some((setId) => allowed.has(setId.toLowerCase()))) {
        violations.push({
          zone: "deck",
          code: "out-of-allowed-sets",
          message: `${card.rawName} is not from an allowed set`,
          cardId: card.resolvedCardId,
        });
      }
    }
  }

  const excludedTypes = new Set<string>([
    WellKnown.cardType.LEGEND,
    WellKnown.cardType.RUNE,
    WellKnown.cardType.BATTLEFIELD,
  ]);
  const countedZones = new Set<string>([WellKnown.deckZone.MAIN, WellKnown.deckZone.CHAMPION]);

  const typeCountMap = new Map<string, number>();
  const domainCountMap = new Map<string, number>();
  for (const card of cards) {
    const detail = card.resolvedCardId ? details.get(card.resolvedCardId) : undefined;
    if (!detail || !countedZones.has(card.zone)) {
      continue;
    }
    if (!excludedTypes.has(detail.type)) {
      typeCountMap.set(detail.type, (typeCountMap.get(detail.type) ?? 0) + card.quantity);
    }
    for (const domain of detail.domains) {
      domainCountMap.set(domain, (domainCountMap.get(domain) ?? 0) + card.quantity);
    }
  }

  return {
    violations,
    typeCounts: enumRows.cardTypes
      .map((row) => row.slug)
      .filter((type) => typeCountMap.has(type))
      .map((type) => ({ cardType: type as CardType, count: typeCountMap.get(type) ?? 0 })),
    domainDistribution: enumRows.domains
      .map((row) => row.slug)
      .filter((domain) => domainCountMap.has(domain))
      .map((domain) => ({ domain: domain as Domain, count: domainCountMap.get(domain) ?? 0 })),
  };
}
