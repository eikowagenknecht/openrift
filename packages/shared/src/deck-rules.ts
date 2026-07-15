import type { DeckFormatConfig } from "./types/api/deck.js";
import type { CardType, DeckFormat, DeckZone, Domain, SuperType } from "./types/enums.js";
import { WellKnown } from "./well-known.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface DeckCard {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  cardName: string;
  /** Primary type (`cardTypes[0]`); used only for display/sort bucketing. */
  cardType: CardType;
  /** Full ordered type set (ADR-037); rules check membership here. */
  cardTypes: CardType[];
  superTypes: SuperType[];
  domains: Domain[];
  tags: string[];
  /**
   * Admin-curated `custom_tags.slug` assignments for this card. Consumed by
   * tag-locked formats (e.g. Custom-Region) and ignored by everything else.
   */
  customTagSlugs: readonly string[];
  keywords: string[];
  /**
   * Per-card deck copy-limit override from `Card.maxCopiesOverride`. `null`
   * = normal rules (3 copies), `0` = unlimited ({@link UNLIMITED_COPIES}),
   * positive = cap at that value.
   */
  maxCopiesOverride: number | null;
}

export interface DeckState {
  format: DeckFormat;
  cards: DeckCard[];
  /**
   * Format-specific config plucked from `decks.format_config`. Each format
   * reads only the keys it cares about. `null` means the user hasn't picked
   * config yet (e.g. Custom-Region deck without a region) — rules treat this
   * as a "config required" violation rather than as "all checks pass".
   */
  formatConfig?: DeckFormatConfig | null;
  /**
   * Catalogue-derived set of tags that name a Champion (e.g. "Ivern",
   * "Karma"). Used by Custom-Region's signature-champion rule to tell
   * champion-identifier tags apart from region/utility tags during overlap
   * checks. Source of truth: distinct tags on Legend cards. Optional so
   * legacy callers (and Standard format) keep working without it.
   */
  championIdentifierTags?: ReadonlySet<string>;
}

export interface DeckViolation {
  zone: DeckZone | "deck";
  code: string;
  message: string;
  cardId?: string;
}

type DeckRule = (state: DeckState) => DeckViolation[];

// ── Helpers ─────────────────────────────────────────────────────────────────

function cardsInZone(cards: DeckCard[], zone: DeckZone): DeckCard[] {
  return cards.filter((card) => card.zone === zone);
}

function totalQuantity(cards: DeckCard[]): number {
  return cards.reduce((sum, card) => sum + card.quantity, 0);
}

/** `maxCopiesOverride` sentinel meaning "any number of copies". */
export const UNLIMITED_COPIES = 0;

/**
 * Resolves the per-name deck copy limit for a card: the card's
 * `maxCopiesOverride` when set (`UNLIMITED_COPIES` maps to `Infinity`),
 * otherwise the standard 3.
 *
 * @returns The maximum number of copies a deck may run of this card.
 */
export function copyLimitFor(card: { maxCopiesOverride?: number | null }): number {
  const override = card.maxCopiesOverride;
  if (override === null || override === undefined) {
    return 3;
  }
  return override === UNLIMITED_COPIES ? Number.POSITIVE_INFINITY : override;
}

// Callers feed one row per printing (deck builder) or per deck-list line
// (deck check), so the same card can arrive as several rows in one zone.
// Rules assume one row per card per zone: per-row quantity caps would
// undercount split copies, and per-card rules would emit the same violation
// twice. Merge rows by summing quantities; card metadata is identical across
// rows of the same cardId, so the first row's fields are kept.
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

// Max 3 copies of any card in the main deck (per-card override may lift this).
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

// Cards in main/sideboard must only have domains within the legend's domains (+ Colorless).
const mainDeckDomainMatch: DeckRule = (state) => {
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

  // The chosen copy counts toward the card's total limit, so main holds one less.
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

// Formats without a sideboard reject any card parked there. Cards can land in
// the sideboard via a format switch or an imported list with a sideboard
// section — they are flagged, never auto-moved, and the builder keeps the
// zone visible until the user empties it.
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

// Max 3 copies of any card in the sideboard (per-card override may lift this).
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

// Battlefield zone must have exactly 1 card (Custom-Region variant).
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

// Each Signature card that doesn't belong to the Legend's champion must be
// backed copy-for-copy by its champion in the deck: 3× "Death from Below" in
// a Miss Fortune deck needs 3 Pyke copies. Any printing or variant of the
// champion counts — matching is by champion-identifier tag, not card
// identity. Champion copies are counted from the champion zone and main deck
// only (sideboard champions don't back signatures). Signatures whose
// champion tag matches the Legend are exempt — the Legend itself vouches for
// them. Used by Custom-Region in place of signatureMatchesLegendTag. Falls
// back to a no-op when no championIdentifierTags set is provided (e.g.
// legacy callers).
const signatureChampionCopiesInDeck: DeckRule = (state) => {
  const championIdSet = state.championIdentifierTags;
  if (!championIdSet || championIdSet.size === 0) {
    return [];
  }

  const legends = cardsInZone(state.cards, WellKnown.deckZone.LEGEND);
  if (legends.length !== 1) {
    return [];
  }
  const legendTags = new Set(legends[0].tags);

  // Champion copies available per champion-identifier tag.
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

  // Signature copies required per champion-identifier tag. Demand is summed
  // per tag so two different Pyke signatures can't each claim the same Pyke
  // copies. A signature carrying several champion tags is attributed to its
  // best-supplied tag (most lenient reading of the "or" semantics).
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
      // Signature with no recognised champion-identifier tag — data oddity,
      // not something the user can fix. Skip rather than block the deck.
      continue;
    }
    if (signatureChampionTags.some((tag) => legendTags.has(tag))) {
      continue;
    }
    const bestSuppliedTag = signatureChampionTags.toSorted(
      (tagA, tagB) => (championCopiesByTag.get(tagB) ?? 0) - (championCopiesByTag.get(tagA) ?? 0),
    )[0];
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

// ── Tag-locked rules (custom-region and any future tag-locked format) ──────

/**
 * Reads the chosen tag slugs from `state.formatConfig`. The shape is
 * enforced at the API boundary (`validateFormatConfig` in the decks route),
 * so the rule trusts the type and just unwraps the optional.
 *
 * @returns The slug list, or an empty array if no config is set.
 */
function formatConfigTagSlugs(state: DeckState): readonly string[] {
  return state.formatConfig?.tagSlugs ?? [];
}

// Tag-locked formats are invalid until the user picks at least one tag.
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

// Every card across all zones must carry at least one of the chosen tags
// (OR-match). A deck locked to ["bandle-city", "neutral"] accepts cards
// tagged with either or both.
const cardsCarryFormatTag: DeckRule = (state) => {
  const allowed = formatConfigTagSlugs(state);
  if (allowed.length === 0) {
    return [];
  }
  const violations: DeckViolation[] = [];
  for (const card of state.cards) {
    // Runes carry no region tags and only provide generic power — every rune
    // is legal in a tag-locked deck. Count/type checks still apply via
    // runesExactlyTwelve / runesAllTypeRune.
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

// ── Rule Sets ───────────────────────────────────────────────────────────────

const CONSTRUCTED_RULES: DeckRule[] = [
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

// Custom-Region: constructed minus the two pure-domain rules, plus the two
// tag-locked rules. championSharesTagWithLegend stays (it's a tag rule, not
// a domain rule). The format has no sideboard, so the two sideboard-cap rules
// are replaced by sideboardNotAllowed. Order: tag rules first so a missing
// tag pick reports the load-bearing violation before per-card noise.
const REGION_LOCKED_RULES: DeckRule[] = [
  formatTagRequired,
  cardsCarryFormatTag,
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

/**
 * Whether decks of a format play a sideboard zone. Custom-Region has none:
 * the builder hides the zone (once empty), drops it as a move target, and
 * `sideboardNotAllowed` flags any cards still parked there.
 *
 * @returns true when the format allows sideboard cards.
 */
export function formatHasSideboard(format: DeckFormat): boolean {
  return format !== WellKnown.deckFormat.CUSTOM_REGION;
}

/**
 * Validates a deck against the rules for its format.
 *
 * @returns An array of violations. Empty means the deck is valid.
 */
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
