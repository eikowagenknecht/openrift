import { inferZone, validateDeck, WellKnown } from "@openrift/shared";
import type {
  CardType,
  DeckCheckEntryCardResponse,
  DeckCheckMatchStatus,
  DeckViolation,
  DeckZone,
  Domain,
  SuperType,
  ZoneSuggestion,
} from "@openrift/shared";

import type { Repos } from "../deps.js";
import type { DeckCheckEntryCard } from "../repositories/deck-check.js";

/**
 * The card-line shape the advisory computation needs: satisfied both by stored
 * `deck_check_entry_cards` rows and by not-yet-persisted submission previews.
 */
export interface AdvisoryCardLine {
  /** The entry-card row id; only persisted lines carry one, preview lines don't. */
  id?: string;
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
  zoneSuggestions: ZoneSuggestion[];
}

/** The card-detail shape {@link computeZoneSuggestions} reads, keyed by card id. */
interface CardDetail {
  name: string;
  type: string;
  superTypes: string[];
}

/**
 * The zones that accept exactly one card type (Legend → legend, Rune → runes,
 * Battlefield → battlefield). These are the only zones a card's type can be
 * checked against, so they bound what {@link computeZoneSuggestions} will touch.
 */
const TYPE_LOCKED_ZONES = new Set<string>([
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
]);

/**
 * Finds resolved lines that are mis-zoned relative to a type-locked zone, in
 * either direction:
 *  - a Legend / Rune / Battlefield sitting outside its zone (e.g. a Rune dumped
 *    in main) → move it into that zone, and
 *  - any card sitting inside a type-locked zone it doesn't belong to (e.g. a
 *    Spell parked in battlefield) → move it back to main.
 *
 * A move is only suggested when it involves a type-locked zone (as origin or
 * destination). Moves among the non-locked zones — a Unit in main vs sideboard
 * vs champion vs overflow — are a deckbuilding choice, never derivable from the
 * card type, so they're left alone: a custom-format deck is never auto-corrected,
 * only flagged for the judge to confirm.
 *
 * @returns One suggestion per mis-zoned line; empty when all are placed right.
 */
export function computeZoneSuggestions(
  cards: AdvisoryCardLine[],
  details: Map<string, CardDetail>,
): ZoneSuggestion[] {
  const suggestions: ZoneSuggestion[] = [];
  for (const card of cards) {
    if (!card.id || card.matchStatus !== "matched" || !card.resolvedCardId) {
      continue;
    }
    const detail = details.get(card.resolvedCardId);
    if (!detail) {
      continue;
    }
    const suggestedZone = inferZone(
      detail.type as CardType,
      detail.superTypes as SuperType[],
      "mainDeck",
    );
    if (suggestedZone === card.zone) {
      continue;
    }
    if (!TYPE_LOCKED_ZONES.has(suggestedZone) && !TYPE_LOCKED_ZONES.has(card.zone)) {
      continue;
    }
    suggestions.push({
      cardId: card.id,
      cardName: detail.name,
      currentZone: card.zone as DeckZone,
      suggestedZone,
    });
  }
  return suggestions;
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
    zoneSuggestions: computeZoneSuggestions(cards, details),
  };
}
