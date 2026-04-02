import type { CardType, DeckFormat, DeckZone, Domain, SuperType } from "./types/enums.js";

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
  const legends = cardsInZone(state.cards, "legend");
  const count = totalQuantity(legends);

  if (count === 0) {
    return [{ zone: "legend", code: "LEGEND_REQUIRED", message: "A Legend is required" }];
  }
  if (count > 1) {
    return [{ zone: "legend", code: "LEGEND_TOO_MANY", message: "Only one Legend is allowed" }];
  }

  const legend = legends[0];
  if (legend.cardType !== "Legend") {
    return [
      {
        zone: "legend",
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
  const champions = cardsInZone(state.cards, "champion");
  const count = totalQuantity(champions);

  if (count === 0) {
    return [
      { zone: "champion", code: "CHAMPION_REQUIRED", message: "A Chosen Champion is required" },
    ];
  }
  if (count > 1) {
    return [
      {
        zone: "champion",
        code: "CHAMPION_TOO_MANY",
        message: "Only one Chosen Champion is allowed",
      },
    ];
  }

  const champion = champions[0];
  if (!champion.superTypes.includes("Champion")) {
    return [
      {
        zone: "champion",
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
  const legends = cardsInZone(state.cards, "legend");
  const champions = cardsInZone(state.cards, "champion");

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
        zone: "champion",
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
  const runes = cardsInZone(state.cards, "runes");
  const count = totalQuantity(runes);

  if (count === 0) {
    return [{ zone: "runes", code: "RUNES_REQUIRED", message: "12 Rune cards are required" }];
  }
  if (count < 12) {
    return [
      {
        zone: "runes",
        code: "RUNES_TOO_FEW",
        message: `${count}/12 Rune cards — need ${12 - count} more`,
      },
    ];
  }
  if (count > 12) {
    return [
      {
        zone: "runes",
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

  for (const card of cardsInZone(state.cards, "runes")) {
    if (card.cardType !== "Rune") {
      violations.push({
        zone: "runes",
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
  const legends = cardsInZone(state.cards, "legend");
  if (legends.length !== 1) {
    return [];
  }

  const legendDomains = new Set(legends[0].domains);
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, "runes")) {
    const matchesDomain = card.domains.some((domain) => legendDomains.has(domain));
    if (!matchesDomain) {
      violations.push({
        zone: "runes",
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
  const mainCount = totalQuantity(cardsInZone(state.cards, "main"));
  const championCount = totalQuantity(cardsInZone(state.cards, "champion"));
  const count = mainCount + championCount;

  if (count < 40) {
    return [
      {
        zone: "main",
        code: "MAIN_TOO_FEW",
        message: `${count}/40 main deck cards — need ${40 - count} more`,
      },
    ];
  }
  if (count > 40) {
    return [
      {
        zone: "main",
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

  for (const card of cardsInZone(state.cards, "main")) {
    if (card.quantity > 3) {
      violations.push({
        zone: "main",
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
  const legends = cardsInZone(state.cards, "legend");
  if (legends.length !== 1) {
    return [];
  }

  const allowedDomains = new Set([...legends[0].domains, "Colorless"]);
  const violations: DeckViolation[] = [];

  for (const card of [
    ...cardsInZone(state.cards, "main"),
    ...cardsInZone(state.cards, "sideboard"),
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
  const champions = cardsInZone(state.cards, "champion");
  if (champions.length !== 1) {
    return [];
  }

  const championCardId = champions[0].cardId;
  const mainCopies = cardsInZone(state.cards, "main").find(
    (card) => card.cardId === championCardId,
  );

  if (mainCopies && mainCopies.quantity > 2) {
    return [
      {
        zone: "main",
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
  const count = totalQuantity(cardsInZone(state.cards, "sideboard"));

  if (count > 8) {
    return [
      {
        zone: "sideboard",
        code: "SIDEBOARD_TOO_MANY",
        message: `${count}/8 sideboard cards — remove ${count - 8}`,
      },
    ];
  }

  return [];
};

// Max 3 copies of any card in the sideboard.
export const sideboardCopyLimit: DeckRule = (state) => {
  const violations: DeckViolation[] = [];

  for (const card of cardsInZone(state.cards, "sideboard")) {
    if (card.quantity > 3) {
      violations.push({
        zone: "sideboard",
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
  const battlefields = cardsInZone(state.cards, "battlefield");
  const count = totalQuantity(battlefields);

  if (count === 0) {
    return [
      {
        zone: "battlefield",
        code: "BATTLEFIELD_REQUIRED",
        message: "3 Battlefield cards are required",
      },
    ];
  }
  if (count < 3) {
    return [
      {
        zone: "battlefield",
        code: "BATTLEFIELD_TOO_FEW",
        message: `${count}/3 Battlefield cards — need ${3 - count} more`,
      },
    ];
  }
  if (count > 3) {
    return [
      {
        zone: "battlefield",
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

  for (const card of cardsInZone(state.cards, "battlefield")) {
    if (card.cardType !== "Battlefield") {
      violations.push({
        zone: "battlefield",
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

  for (const card of cardsInZone(state.cards, "battlefield")) {
    if (card.quantity > 1) {
      violations.push({
        zone: "battlefield",
        code: "BATTLEFIELD_DUPLICATE",
        message: `${card.cardName} — only 1 copy allowed in the battlefield zone`,
        cardId: card.cardId,
      });
    }
  }

  return violations;
};

// ── Rule Sets ───────────────────────────────────────────────────────────────

export const STANDARD_RULES: DeckRule[] = [
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
];

/**
 * Validates a deck against the rules for its format.
 *
 * @returns An array of violations. Empty means the deck is valid.
 */
export function validateDeck(state: DeckState): DeckViolation[] {
  if (state.format === "freeform") {
    return [];
  }

  const violations: DeckViolation[] = [];
  for (const rule of STANDARD_RULES) {
    violations.push(...rule(state));
  }
  return violations;
}
