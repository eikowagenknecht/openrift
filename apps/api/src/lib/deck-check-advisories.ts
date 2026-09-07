import { validateDeck } from "@openrift/shared/deck-rules";
import type { DeckViolation } from "@openrift/shared/deck-rules";
import type { DeckCheckMatchStatus, ZoneSuggestion } from "@openrift/shared/types/api/deck-check";
import type { TournamentPlayMode } from "@openrift/shared/types/api/tournament";
import type { CardType, DeckZone, Domain, SuperType } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";
import { inferZone } from "@openrift/shared/zone-inference";

import type { Repos } from "../deps.js";

/**
 * The card-line shape the advisory computation needs: satisfied both by stored
 * `deck_check_entry_cards` rows and by not-yet-persisted submission previews.
 */
export interface AdvisoryCardLine {
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

interface CardDetail {
  name: string;
  type: string;
  types: string[];
  superTypes: string[];
}

/** The only zones {@link computeZoneSuggestions} checks a card's type against. */
const TYPE_LOCKED_ZONES = new Set<string>([
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
]);

/** A checked (imported) list carries no region/tag config, so these fire as noise without this filter. */
const REGION_CONFIG_CODES = new Set<string>(["FORMAT_TAG_REQUIRED", "CARD_NOT_IN_FORMAT_TAG"]);

/**
 * Only suggests moves into or out of a type-locked zone; moves among the
 * non-locked zones are a deckbuilding choice and are left alone.
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
      detail.types as CardType[],
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

/** Type counts use main+champion zones only; legend/rune/battlefield types are excluded. */
export async function buildEntryAdvisories(
  repos: Repos,
  event: { format: string | null; playMode: TournamentPlayMode; allowedSets: string[] | null },
  cards: AdvisoryCardLine[],
): Promise<EntryAdvisories> {
  const matchedIds = [
    ...new Set(
      cards.flatMap((card) =>
        card.matchStatus === "matched" && card.resolvedCardId ? [card.resolvedCardId] : [],
      ),
    ),
  ];
  // Banlists are additive per play mode: the base list covers all constructed
  // play, and a 2v2 event checks the 2v2-only additions on top.
  const banFormatIds =
    event.playMode === "2v2"
      ? [WellKnown.banFormat.CONSTRUCTED, WellKnown.banFormat.TWO_V_TWO]
      : [WellKnown.banFormat.CONSTRUCTED];
  const [enumRows, details, setSlugsByCard, championIdentifierTags, activeBans] = await Promise.all(
    [
      repos.enums.all(),
      repos.deckCheck.getCardDetails(matchedIds),
      event.allowedSets && event.allowedSets.length > 0
        ? repos.deckCheck.getCardSetSlugs(matchedIds)
        : Promise.resolve(new Map<string, string[]>()),
      // Only Custom-Region's signature rule consumes the champion-identifier
      // tag set — skip the query for every other format.
      event.format === WellKnown.deckFormat.CUSTOM_REGION
        ? repos.catalog.championIdentifierTags()
        : Promise.resolve([] as string[]),
      repos.cardBans.listActiveForCards(matchedIds, banFormatIds),
    ],
  );

  const violations: DeckViolation[] = [];

  const banned2v2 = new Set(
    activeBans
      .filter((ban) => ban.formatId === WellKnown.banFormat.TWO_V_TWO)
      .map((ban) => ban.cardId),
  );
  const bannedBase = new Set(
    activeBans
      .filter((ban) => ban.formatId === WellKnown.banFormat.CONSTRUCTED)
      .map((ban) => ban.cardId),
  );
  const flaggedBanned = new Set<string>();
  for (const card of cards) {
    if (!card.resolvedCardId || card.matchStatus !== "matched") {
      continue;
    }
    if (flaggedBanned.has(card.resolvedCardId)) {
      continue;
    }
    const base = bannedBase.has(card.resolvedCardId);
    const extra = banned2v2.has(card.resolvedCardId);
    if (!base && !extra) {
      continue;
    }
    flaggedBanned.add(card.resolvedCardId);
    violations.push({
      zone: "deck",
      code: "banned-card",
      message: base ? `${card.rawName} is banned` : `${card.rawName} is banned in 2v2`,
      cardId: card.resolvedCardId,
    });
  }

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
          cardTypes: detail.types as CardType[],
          superTypes: detail.superTypes as SuperType[],
          domains: detail.domains as Domain[],
          tags: detail.tags,
          customTagSlugs: [],
          keywords: detail.keywords,
          maxCopiesOverride: detail.maxCopiesOverride,
          // Always false: the banned-card violation is emitted above already,
          // and CARD_BANNED from the rule engine would double it.
          banned: false,
        },
      ];
    });
    violations.push(
      ...validateDeck({
        format: event.format,
        cards: deckCards,
        championIdentifierTags: new Set(championIdentifierTags),
      }).filter((violation) => !REGION_CONFIG_CODES.has(violation.code)),
    );
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
