import type { CardType, DeckFormat, DeckZone, Domain, SuperType } from "./types/enums.js";
import { WellKnown } from "./well-known.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface DeckCard {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  cardName: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  tags: string[];
  keywords: string[];
}

export interface DeckState {
  format: DeckFormat;
  cards: DeckCard[];
}

export interface DeckViolation {
  zone: DeckZone | "deck";
  code: string;
  message: string;
  cardId?: string;
}

export type DeckRule = (state: DeckState) => DeckViolation[];

// ── Helpers ─────────────────────────────────────────────────────────────────

function cardsInZone(cards: DeckCard[], zone: DeckZone): DeckCard[] {
  return cards.filter((card) => card.zone === zone);
}

function totalQuantity(cards: DeckCard[]): number {
  return cards.reduce((sum, card) => sum + card.quantity, 0);
}

// ── Rules ───────────────────────────────────────────────────────────────────

// Legend zone must have exactly 1 card of type Legend.
export const legendExactlyOne: DeckRule = (state) => {
  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  const count = totalQuantity(legends);

  if (count === 0) {
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

  const legend = legends[0];
  if (legend.cardType !== WellKnown.cardType.LEGEND) {
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

// Champion zone must have exactly 1 card with Champion super type.
export const championExactlyOne: DeckRule = (state) => {
  const champions = cardsInZone(state.cards, WellKnown.deckZone.CHAMPION);
  const count = totalQuantity(champions);

  if (count === 0) {
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

  const champion = champions[0];
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

// Champion's tags must overlap with the Legend's tags.
export const championSharesTagWithLegend: DeckRule = (state) => {
  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  const champions = cardsInZone(state.cards, WellKnown.deckZone.CHAMPION);

  if (legends.length !== 1 || champions.length !== 1) {
    return [];
  }

  const legend = legends[0];
  const champion = champions[0];
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

// Runes zone must have exactly 12 cards total.
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

// All cards in the runes zone must be type Rune.
export const runesAllTypeRune: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, WellKnown.deckZone.RUNES)) {
    if (card.cardType !== WellKnown.cardType.RUNE) {
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

// All runes must have a domain matching one of the Legend's 2 domains.
export const runesMatchLegendDomains: DeckRule = (state) => {
  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  if (legends.length !== 1) {
    return [];
  }

  const legendDomains = new Set(legends[0].domains);
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

// Main deck + champion zone must total exactly 40 cards.
export const mainDeckExactly: DeckRule = (state) => {
  const mainCount = totalQuantity(cardsInZone(state.cards, WellKnown.deckZone.MAIN));
  const championCount = totalQuantity(cardsInZone(state.cards, WellKnown.deckZone.CHAMPION));
  const count = mainCount + championCount;

  if (count < 40) {
    return [
      {
        zone: WellKnown.deckZone.MAIN,
        code: "MAIN_TOO_FEW",
        message: `${count}/40 main deck cards — need ${40 - count} more`,
      },
    ];
  }
  if (count > 40) {
    return [
      {
        zone: WellKnown.deckZone.MAIN,
        code: "MAIN_TOO_MANY",
        message: `${count}/40 main deck cards — remove ${count - 40}`,
      },
    ];
  }

  return [];
};

// Max 3 copies of any card in the main deck.
export const mainDeckCopyLimit: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, WellKnown.deckZone.MAIN)) {
    if (card.quantity > 3) {
      violations.push({
        zone: WellKnown.deckZone.MAIN,
        code: "MAIN_COPY_LIMIT",
        message: `${card.cardName} exceeds the 3-copy limit (${card.quantity})`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

// Cards in main/sideboard must only have domains within the legend's domains (+ Colorless).
export const mainDeckDomainMatch: DeckRule = (state) => {
  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  if (legends.length !== 1) {
    return [];
  }

  const allowedDomains = new Set([...legends[0].domains, WellKnown.domain.COLORLESS]);
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

// If a Champion card is in the champion zone, at most 2 more copies in main (3 total).
export const championCopyLimitAcrossZones: DeckRule = (state) => {
  const champions = cardsInZone(state.cards, WellKnown.deckZone.CHAMPION);
  if (champions.length !== 1) {
    return [];
  }

  const championCardId = champions[0].cardId;
  const mainCopies = cardsInZone(state.cards, WellKnown.deckZone.MAIN).find(
    (card) => card.cardId === championCardId,
  );

  if (mainCopies && mainCopies.quantity > 2) {
    return [
      {
        zone: WellKnown.deckZone.MAIN,
        code: "CHAMPION_COPY_LIMIT",
        message: `${mainCopies.cardName} can have at most 2 copies in the main deck (1 is the Chosen Champion)`,
        cardId: mainCopies.cardId,
      },
    ];
  }

  return [];
};

// Sideboard can have at most 8 cards.
export const sideboardMaximum: DeckRule = (state) => {
  const count = totalQuantity(cardsInZone(state.cards, WellKnown.deckZone.SIDEBOARD));

  if (count > 8) {
    return [
      {
        zone: WellKnown.deckZone.SIDEBOARD,
        code: "SIDEBOARD_TOO_MANY",
        message: `${count}/8 sideboard cards — remove ${count - 8}`,
      },
    ];
  }

  return [];
};

// Cards with the [Unique] keyword may only appear once across main + sideboard.
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

// Max 3 copies of any card in the sideboard.
export const sideboardCopyLimit: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, WellKnown.deckZone.SIDEBOARD)) {
    if (card.quantity > 3) {
      violations.push({
        zone: WellKnown.deckZone.SIDEBOARD,
        code: "SIDEBOARD_COPY_LIMIT",
        message: `${card.cardName} exceeds the 3-copy limit (${card.quantity})`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

// Battlefield zone must have exactly 3 cards.
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

// All cards in the battlefield zone must be type Battlefield.
export const battlefieldAllTypeBattlefield: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, WellKnown.deckZone.BATTLEFIELD)) {
    if (card.cardType !== WellKnown.cardType.BATTLEFIELD) {
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

// No duplicate cards in the battlefield zone (each must be unique).
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

// Total Signature cards across main deck + sideboard must not exceed 3 (rule 103.2.d.1).
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

// All Signature cards must share a Champion tag with the Legend (rule 103.2.d.2).
const signatureMatchesLegendTag: DeckRule = (state) => {
  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  if (legends.length !== 1) {
    return [];
  }

  const legendTags = new Set(legends[0].tags);
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

// ── Rule Sets ───────────────────────────────────────────────────────────────

export const CONSTRUCTED_RULES: DeckRule[] = [
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

/**
 * Validates a deck against the rules for its format.
 *
 * @returns An array of violations. Empty means the deck is valid.
 */
export function validateDeck(state: DeckState): DeckViolation[] {
  if (state.format === WellKnown.deckFormat.FREEFORM) {
    return [];
  }

  const violations: DeckViolation[] = [];
  for (const rule of CONSTRUCTED_RULES) {
    violations.push(...rule(state));
  }
  return violations;
}
