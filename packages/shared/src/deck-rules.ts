import type { DeckFormatConfig } from "./types/api/deck.js";
import type { CardType, DeckFormat, DeckZone, Domain, SuperType } from "./types/enums.js";
import { WellKnown } from "./well-known.js";

export interface DeckCard {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  cardName: string;
  cardType: CardType;
  cardTypes: CardType[];
  superTypes: SuperType[];
  domains: Domain[];
  tags: string[];
  customTagSlugs: readonly string[];
  keywords: string[];
  maxCopiesOverride: number | null;
  banned: boolean;
}

export interface DeckState {
  format: DeckFormat;
  cards: DeckCard[];
  formatConfig?: DeckFormatConfig | null;
  championIdentifierTags?: ReadonlySet<string>;
}

export interface DeckViolation {
  zone: DeckZone | "deck";
  code: string;
  message: string;
  cardId?: string;
}

type DeckRule = (state: DeckState) => DeckViolation[];

function cardsInZone(cards: DeckCard[], zone: DeckZone): DeckCard[] {
  return cards.filter((card) => card.zone === zone);
}

function totalQuantity(cards: DeckCard[]): number {
  return cards.reduce((sum, card) => sum + card.quantity, 0);
}

export const UNLIMITED_COPIES = 0;

export function copyLimitFor(card: { maxCopiesOverride?: number | null }): number {
  const override = card.maxCopiesOverride;
  if (override === null || override === undefined) {
    return 3;
  }
  return override === UNLIMITED_COPIES ? Number.POSITIVE_INFINITY : override;
}

// Rules assume one row per card per zone (callers may feed several, e.g. one
// per printing), so rows are merged by summing quantities before rules run.
function aggregateByCardAndZone(cards: DeckCard[]): DeckCard[] {
  const byCardAndZone = new Map<string, DeckCard>();
  for (const card of cards) {
    const key = `${card.cardId}|${card.zone}`;
    const existing = byCardAndZone.get(key);
    if (existing) {
      existing.quantity += card.quantity;
    } else {
      byCardAndZone.set(key, { ...card });
    }
  }
  return [...byCardAndZone.values()];
}

export const legendExactlyOne: DeckRule = (state) => {
  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  const count = totalQuantity(legends);

  const [legend] = legends;
  if (count === 0 || legend === undefined) {
    return [
      { zone: WellKnown.deckZone.LEGEND, code: "LEGEND_REQUIRED", message: "A Legend is required" },
    ];
  }
  if (count > 1) {
    return [
      {
        zone: WellKnown.deckZone.LEGEND,
        code: "LEGEND_TOO_MANY",
        message: "Only one Legend is allowed",
      },
    ];
  }

  if (!legend.cardTypes.includes(WellKnown.cardType.LEGEND)) {
    return [
      {
        zone: WellKnown.deckZone.LEGEND,
        code: "LEGEND_WRONG_TYPE",
        message: `${legend.cardName} is not a Legend card`,
        cardId: legend.cardId,
      },
    ];
  }

  return [];
};

export const championExactlyOne: DeckRule = (state) => {
  const champions = cardsInZone(state.cards, WellKnown.deckZone.CHAMPION);
  const count = totalQuantity(champions);

  const [champion] = champions;
  if (count === 0 || champion === undefined) {
    return [
      {
        zone: WellKnown.deckZone.CHAMPION,
        code: "CHAMPION_REQUIRED",
        message: "A Chosen Champion is required",
      },
    ];
  }
  if (count > 1) {
    return [
      {
        zone: WellKnown.deckZone.CHAMPION,
        code: "CHAMPION_TOO_MANY",
        message: "Only one Chosen Champion is allowed",
      },
    ];
  }

  if (!champion.superTypes.includes(WellKnown.superType.CHAMPION)) {
    return [
      {
        zone: WellKnown.deckZone.CHAMPION,
        code: "CHAMPION_WRONG_TYPE",
        message: `${champion.cardName} does not have the Champion type`,
        cardId: champion.cardId,
      },
    ];
  }

  return [];
};

export const championSharesTagWithLegend: DeckRule = (state) => {
  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  const champions = cardsInZone(state.cards, WellKnown.deckZone.CHAMPION);

  const legend = legends.length === 1 ? legends[0] : undefined;
  const champion = champions.length === 1 ? champions[0] : undefined;
  if (legend === undefined || champion === undefined) {
    return [];
  }

  const legendTags = new Set(legend.tags);
  const hasOverlap = champion.tags.some((tag) => legendTags.has(tag));

  if (!hasOverlap) {
    return [
      {
        zone: WellKnown.deckZone.CHAMPION,
        code: "CHAMPION_LEGEND_MISMATCH",
        message: `${champion.cardName} does not match the Legend ${legend.cardName}`,
        cardId: champion.cardId,
      },
    ];
  }

  return [];
};

export const runesExactlyTwelve: DeckRule = (state) => {
  const runes = cardsInZone(state.cards, WellKnown.deckZone.RUNES);
  const count = totalQuantity(runes);

  if (count === 0) {
    return [
      {
        zone: WellKnown.deckZone.RUNES,
        code: "RUNES_REQUIRED",
        message: "12 Rune cards are required",
      },
    ];
  }
  if (count < 12) {
    return [
      {
        zone: WellKnown.deckZone.RUNES,
        code: "RUNES_TOO_FEW",
        message: `${count}/12 Rune cards — need ${12 - count} more`,
      },
    ];
  }
  if (count > 12) {
    return [
      {
        zone: WellKnown.deckZone.RUNES,
        code: "RUNES_TOO_MANY",
        message: `${count}/12 Rune cards — remove ${count - 12}`,
      },
    ];
  }

  return [];
};

export const runesAllTypeRune: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, WellKnown.deckZone.RUNES)) {
    if (!card.cardTypes.includes(WellKnown.cardType.RUNE)) {
      violations.push({
        zone: WellKnown.deckZone.RUNES,
        code: "RUNE_WRONG_TYPE",
        message: `${card.cardName} is not a Rune card`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

export const runesMatchLegendDomains: DeckRule = (state) => {
  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  const legend = legends.length === 1 ? legends[0] : undefined;
  if (legend === undefined) {
    return [];
  }

  const legendDomains = new Set(legend.domains);
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, WellKnown.deckZone.RUNES)) {
    const matchesDomain = card.domains.some((domain) => legendDomains.has(domain));
    if (!matchesDomain) {
      violations.push({
        zone: WellKnown.deckZone.RUNES,
        code: "RUNE_DOMAIN_MISMATCH",
        message: `${card.cardName} does not match the Legend's domains`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

// Main holds 39, not 40: the champion's slot is championExactlyOne's to
// report, so a full main with no champion is not also flagged here.
export const mainDeckExactly: DeckRule = (state) => {
  const count = totalQuantity(cardsInZone(state.cards, WellKnown.deckZone.MAIN));

  if (count < 39) {
    return [
      {
        zone: WellKnown.deckZone.MAIN,
        code: "MAIN_TOO_FEW",
        message: `${count}/39 main-deck cards — need ${39 - count} more`,
      },
    ];
  }
  if (count > 39) {
    return [
      {
        zone: WellKnown.deckZone.MAIN,
        code: "MAIN_TOO_MANY",
        message: `${count}/39 main-deck cards — remove ${count - 39}`,
      },
    ];
  }

  return [];
};

export const mainDeckCopyLimit: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, WellKnown.deckZone.MAIN)) {
    const limit = copyLimitFor(card);
    if (card.quantity > limit) {
      violations.push({
        zone: WellKnown.deckZone.MAIN,
        code: "MAIN_COPY_LIMIT",
        message: `${card.cardName} exceeds the ${limit}-copy limit (${card.quantity})`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

const mainDeckDomainMatch: DeckRule = (state) => {
  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  const legend = legends.length === 1 ? legends[0] : undefined;
  if (legend === undefined) {
    return [];
  }

  const allowedDomains = new Set([...legend.domains, WellKnown.domain.COLORLESS]);
  const violations: DeckViolation[] = [];

  for (const card of [
    ...cardsInZone(state.cards, WellKnown.deckZone.MAIN),
    ...cardsInZone(state.cards, WellKnown.deckZone.SIDEBOARD),
  ]) {
    const hasDisallowed = card.domains.some((domain) => !allowedDomains.has(domain));
    if (hasDisallowed) {
      violations.push({
        zone: card.zone,
        code: "DOMAIN_MISMATCH",
        message: `${card.cardName} has domains outside the Legend's colors`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

export const championCopyLimitAcrossZones: DeckRule = (state) => {
  const champions = cardsInZone(state.cards, WellKnown.deckZone.CHAMPION);
  const champion = champions.length === 1 ? champions[0] : undefined;
  if (champion === undefined) {
    return [];
  }

  const championCardId = champion.cardId;
  const mainCopies = cardsInZone(state.cards, WellKnown.deckZone.MAIN).find(
    (card) => card.cardId === championCardId,
  );

  if (mainCopies && mainCopies.quantity > copyLimitFor(mainCopies) - 1) {
    return [
      {
        zone: WellKnown.deckZone.MAIN,
        code: "CHAMPION_COPY_LIMIT",
        message: `${mainCopies.cardName} can have at most ${copyLimitFor(mainCopies) - 1} copies in the main deck (1 is the Chosen Champion)`,
        cardId: mainCopies.cardId,
      },
    ];
  }

  return [];
};

export const SIDEBOARD_MAXIMUM = 10;

export const sideboardMaximum: DeckRule = (state) => {
  const count = totalQuantity(cardsInZone(state.cards, WellKnown.deckZone.SIDEBOARD));

  if (count > SIDEBOARD_MAXIMUM) {
    return [
      {
        zone: WellKnown.deckZone.SIDEBOARD,
        code: "SIDEBOARD_TOO_MANY",
        message: `${count}/${SIDEBOARD_MAXIMUM} sideboard cards — remove ${count - SIDEBOARD_MAXIMUM}`,
      },
    ];
  }

  return [];
};

export const uniqueCopyLimit: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of [
    ...cardsInZone(state.cards, WellKnown.deckZone.MAIN),
    ...cardsInZone(state.cards, WellKnown.deckZone.SIDEBOARD),
  ]) {
    if (card.keywords.includes(WellKnown.keyword.UNIQUE) && card.quantity > 1) {
      violations.push({
        zone: card.zone,
        code: "UNIQUE_COPY_LIMIT",
        message: `${card.cardName} has the [Unique] keyword — only 1 copy allowed`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

// Cards can land here via a format switch or an imported list; they are
// flagged, never auto-moved.
export const sideboardNotAllowed: DeckRule = (state) => {
  const count = totalQuantity(cardsInZone(state.cards, WellKnown.deckZone.SIDEBOARD));

  if (count > 0) {
    return [
      {
        zone: WellKnown.deckZone.SIDEBOARD,
        code: "SIDEBOARD_NOT_ALLOWED",
        message: "This format has no sideboard — move these cards to the main deck or overflow",
      },
    ];
  }

  return [];
};

export const sideboardCopyLimit: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, WellKnown.deckZone.SIDEBOARD)) {
    const limit = copyLimitFor(card);
    if (card.quantity > limit) {
      violations.push({
        zone: WellKnown.deckZone.SIDEBOARD,
        code: "SIDEBOARD_COPY_LIMIT",
        message: `${card.cardName} exceeds the ${limit}-copy limit (${card.quantity})`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

const battlefieldExactlyOne: DeckRule = (state) => {
  const battlefields = cardsInZone(state.cards, WellKnown.deckZone.BATTLEFIELD);
  const count = totalQuantity(battlefields);

  if (count === 0) {
    return [
      {
        zone: WellKnown.deckZone.BATTLEFIELD,
        code: "BATTLEFIELD_REQUIRED",
        message: "A Battlefield card is required",
      },
    ];
  }
  if (count > 1) {
    return [
      {
        zone: WellKnown.deckZone.BATTLEFIELD,
        code: "BATTLEFIELD_TOO_MANY",
        message: `This format plays exactly 1 Battlefield — remove ${count - 1} of the ${count} in the deck`,
      },
    ];
  }

  return [];
};

export const battlefieldExactlyThree: DeckRule = (state) => {
  const battlefields = cardsInZone(state.cards, WellKnown.deckZone.BATTLEFIELD);
  const count = totalQuantity(battlefields);

  if (count === 0) {
    return [
      {
        zone: WellKnown.deckZone.BATTLEFIELD,
        code: "BATTLEFIELD_REQUIRED",
        message: "3 Battlefield cards are required",
      },
    ];
  }
  if (count < 3) {
    return [
      {
        zone: WellKnown.deckZone.BATTLEFIELD,
        code: "BATTLEFIELD_TOO_FEW",
        message: `${count}/3 Battlefield cards — need ${3 - count} more`,
      },
    ];
  }
  if (count > 3) {
    return [
      {
        zone: WellKnown.deckZone.BATTLEFIELD,
        code: "BATTLEFIELD_TOO_MANY",
        message: `${count}/3 Battlefield cards — remove ${count - 3}`,
      },
    ];
  }

  return [];
};

export const battlefieldAllTypeBattlefield: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, WellKnown.deckZone.BATTLEFIELD)) {
    if (!card.cardTypes.includes(WellKnown.cardType.BATTLEFIELD)) {
      violations.push({
        zone: WellKnown.deckZone.BATTLEFIELD,
        code: "BATTLEFIELD_WRONG_TYPE",
        message: `${card.cardName} is not a Battlefield card`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

export const battlefieldNoDuplicates: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, WellKnown.deckZone.BATTLEFIELD)) {
    if (card.quantity > 1) {
      violations.push({
        zone: WellKnown.deckZone.BATTLEFIELD,
        code: "BATTLEFIELD_DUPLICATE",
        message: `${card.cardName} — only 1 copy allowed in the battlefield zone`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

// Rule 103.2.d.1.
const signatureTotalLimit: DeckRule = (state) => {
  const signatureCards = [
    ...cardsInZone(state.cards, WellKnown.deckZone.MAIN),
    ...cardsInZone(state.cards, WellKnown.deckZone.SIDEBOARD),
  ].filter((card) => card.superTypes.includes(WellKnown.superType.SIGNATURE));

  const count = totalQuantity(signatureCards);

  if (count > 3) {
    return [
      {
        zone: "deck",
        code: "SIGNATURE_TOTAL_LIMIT",
        message: `${count} Signature cards — maximum is 3`,
      },
    ];
  }

  return [];
};

// Rule 103.2.d.2.
const signatureMatchesLegendTag: DeckRule = (state) => {
  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  const legend = legends.length === 1 ? legends[0] : undefined;
  if (legend === undefined) {
    return [];
  }

  const legendTags = new Set(legend.tags);
  const violations: DeckViolation[] = [];

  for (const card of [
    ...cardsInZone(state.cards, WellKnown.deckZone.MAIN),
    ...cardsInZone(state.cards, WellKnown.deckZone.SIDEBOARD),
  ]) {
    if (!card.superTypes.includes(WellKnown.superType.SIGNATURE)) {
      continue;
    }
    const hasMatchingTag = card.tags.some((tag) => legendTags.has(tag));
    if (!hasMatchingTag) {
      violations.push({
        zone: card.zone,
        code: "SIGNATURE_TAG_MISMATCH",
        message: `${card.cardName} does not match the Legend's Champion tag`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

// A Signature not tagged to the Legend needs matching champion copies (any
// printing) in the champion zone or main deck; sideboard doesn't count.
const signatureChampionCopiesInDeck: DeckRule = (state) => {
  const championIdSet = state.championIdentifierTags;
  if (!championIdSet || championIdSet.size === 0) {
    return [];
  }

  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  const legend = legends.length === 1 ? legends[0] : undefined;
  if (legend === undefined) {
    return [];
  }
  const legendTags = new Set(legend.tags);

  const championCopiesByTag = new Map<string, number>();
  for (const card of [
    ...cardsInZone(state.cards, WellKnown.deckZone.CHAMPION),
    ...cardsInZone(state.cards, WellKnown.deckZone.MAIN),
  ]) {
    if (!card.superTypes.includes(WellKnown.superType.CHAMPION)) {
      continue;
    }
    for (const tag of card.tags) {
      if (championIdSet.has(tag)) {
        championCopiesByTag.set(tag, (championCopiesByTag.get(tag) ?? 0) + card.quantity);
      }
    }
  }

  // Demand sums per tag so two Signatures of the same champion can't claim
  // the same copies; a multi-tag Signature goes to its best-supplied tag.
  const demandByTag = new Map<string, { copies: number; cards: DeckCard[] }>();
  for (const card of [
    ...cardsInZone(state.cards, WellKnown.deckZone.MAIN),
    ...cardsInZone(state.cards, WellKnown.deckZone.SIDEBOARD),
  ]) {
    if (!card.superTypes.includes(WellKnown.superType.SIGNATURE)) {
      continue;
    }
    const signatureChampionTags = card.tags.filter((tag) => championIdSet.has(tag));
    if (signatureChampionTags.length === 0) {
      // A Signature with no recognised champion-identifier tag is skipped, not blocked.
      continue;
    }
    if (signatureChampionTags.some((tag) => legendTags.has(tag))) {
      continue;
    }
    const [bestSuppliedTag] = signatureChampionTags.toSorted(
      (tagA, tagB) => (championCopiesByTag.get(tagB) ?? 0) - (championCopiesByTag.get(tagA) ?? 0),
    );
    if (bestSuppliedTag === undefined) {
      continue;
    }
    const demand = demandByTag.get(bestSuppliedTag) ?? { copies: 0, cards: [] };
    demand.copies += card.quantity;
    demand.cards.push(card);
    demandByTag.set(bestSuppliedTag, demand);
  }

  const violations: DeckViolation[] = [];
  for (const [tag, demand] of demandByTag) {
    const available = championCopiesByTag.get(tag) ?? 0;
    if (available >= demand.copies) {
      continue;
    }
    for (const card of demand.cards) {
      violations.push({
        zone: card.zone,
        code: "SIGNATURE_CHAMPION_COPIES",
        message: `${card.cardName} needs ${demand.copies} ${demand.copies === 1 ? "copy" : "copies"} of ${tag} in the deck (found ${available})`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

// `banned` only carries the base banlist; mode-scoped bans (e.g. 2v2) are
// deliberately not enforced here and stay a display-only ribbon.
export const noBannedCards: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of state.cards) {
    // Overflow is outside the deck proper; every rule ignores its contents.
    if (card.zone === WellKnown.deckZone.OVERFLOW) {
      continue;
    }
    if (card.banned) {
      violations.push({
        zone: card.zone,
        code: "CARD_BANNED",
        message: `${card.cardName} is banned.`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

// Tokens are game objects an effect creates during play (rule 133.7.c), not
// cards you register; an imported list or deck code can still name one.
export const noTokenCards: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of state.cards) {
    if (card.zone === WellKnown.deckZone.OVERFLOW) {
      continue;
    }
    if (card.superTypes.includes(WellKnown.superType.TOKEN)) {
      violations.push({
        zone: card.zone,
        code: "CARD_NOT_DECK_LEGAL",
        message: `${card.cardName} is a Token and can't be part of a deck.`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

function formatConfigTagSlugs(state: DeckState): readonly string[] {
  return state.formatConfig?.tagSlugs ?? [];
}

const formatTagRequired: DeckRule = (state) => {
  if (formatConfigTagSlugs(state).length > 0) {
    return [];
  }
  return [
    {
      zone: "deck",
      code: "FORMAT_TAG_REQUIRED",
      message: "Pick at least one region to start building",
    },
  ];
};

const cardsCarryFormatTag: DeckRule = (state) => {
  const allowed = formatConfigTagSlugs(state);
  if (allowed.length === 0) {
    return [];
  }
  const violations: DeckViolation[] = [];
  for (const card of state.cards) {
    // Runes carry no region tags; every rune is legal in a tag-locked deck.
    if (card.cardTypes.includes(WellKnown.cardType.RUNE)) {
      continue;
    }
    const ok = allowed.some((slug) => card.customTagSlugs.includes(slug));
    if (!ok) {
      violations.push({
        zone: card.zone,
        code: "CARD_NOT_IN_FORMAT_TAG",
        message: `${card.cardName} is not tagged for this format`,
        cardId: card.cardId,
      });
    }
  }
  return violations;
};

const CONSTRUCTED_RULES: DeckRule[] = [
  noBannedCards,
  noTokenCards,
  legendExactlyOne,
  championExactlyOne,
  championSharesTagWithLegend,
  runesExactlyTwelve,
  runesAllTypeRune,
  runesMatchLegendDomains,
  battlefieldExactlyThree,
  battlefieldAllTypeBattlefield,
  battlefieldNoDuplicates,
  mainDeckExactly,
  mainDeckCopyLimit,
  mainDeckDomainMatch,
  championCopyLimitAcrossZones,
  sideboardMaximum,
  sideboardCopyLimit,
  uniqueCopyLimit,
  signatureTotalLimit,
  signatureMatchesLegendTag,
];

// Tag rules run first so a missing tag pick reports before per-card noise.
const REGION_LOCKED_RULES: DeckRule[] = [
  formatTagRequired,
  cardsCarryFormatTag,
  noBannedCards,
  noTokenCards,
  legendExactlyOne,
  championExactlyOne,
  championSharesTagWithLegend,
  runesExactlyTwelve,
  runesAllTypeRune,
  battlefieldExactlyOne,
  battlefieldAllTypeBattlefield,
  battlefieldNoDuplicates,
  mainDeckExactly,
  mainDeckCopyLimit,
  championCopyLimitAcrossZones,
  sideboardNotAllowed,
  uniqueCopyLimit,
  signatureTotalLimit,
  signatureChampionCopiesInDeck,
];

export function formatHasSideboard(format: DeckFormat): boolean {
  return format !== WellKnown.deckFormat.CUSTOM_REGION;
}

export function validateDeck(state: DeckState): DeckViolation[] {
  let rules: DeckRule[];
  switch (state.format) {
    case WellKnown.deckFormat.FREEFORM: {
      return [];
    }
    case WellKnown.deckFormat.CUSTOM_REGION: {
      rules = REGION_LOCKED_RULES;
      break;
    }
    default: {
      rules = CONSTRUCTED_RULES;
      break;
    }
  }

  const aggregatedState: DeckState = { ...state, cards: aggregateByCardAndZone(state.cards) };
  const violations: DeckViolation[] = [];
  for (const rule of rules) {
    violations.push(...rule(aggregatedState));
  }
  return violations;
}
