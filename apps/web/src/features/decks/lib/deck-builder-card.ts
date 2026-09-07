import type { DeckCard } from "@openrift/shared/deck-rules";
import { copyLimitFor, formatHasSideboard } from "@openrift/shared/deck-rules";
import type { DeckCardResponse, PublicDeckCardResponse } from "@openrift/shared/types/api/deck";
import type { Card } from "@openrift/shared/types/catalog";
import type {
  CardType,
  DeckFormat,
  DeckZone,
  Domain,
  SuperType,
} from "@openrift/shared/types/enums";
import { WellKnown, isBaseBanFormat } from "@openrift/shared/well-known";

const EMPTY_ARRAY: string[] = [];

/**
 * Only the base banlist invalidates a deck; mode-scoped bans (e.g. 2v2) stay
 * a display-only ribbon since a deck carries no play-mode identity.
 */
export function isCardBanned(card: Pick<Card, "bans">): boolean {
  return card.bans.some((ban) => isBaseBanFormat(ban.formatId));
}

export const RUNE_TARGET = 12;

export const COPY_LIMIT_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.CHAMPION,
]);

export interface DeckBuilderCard {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
  cardName: string;
  cardType: CardType;
  cardTypes: CardType[];
  superTypes: SuperType[];
  domains: Domain[];
  tags: string[];
  keywords: string[];
  maxCopiesOverride: number | null;
  banned: boolean;
  energy: number | null;
  might: number | null;
  power: number | null;
}

export function deckCardKey(
  cardId: string,
  zone: DeckZone,
  preferredPrintingId: string | null,
): string {
  return `${cardId}|${zone}|${preferredPrintingId ?? ""}`;
}

/** Every field is already denormalized in the public payload; no catalog lookup needed. */
export function toBuilderCardFromPublic(card: PublicDeckCardResponse): DeckBuilderCard {
  return {
    cardId: card.cardId,
    zone: card.zone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
    cardName: card.cardName,
    cardType: card.cardType,
    cardTypes: card.cardTypes,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags,
    keywords: card.keywords,
    maxCopiesOverride: card.maxCopiesOverride,
    banned: card.banned,
    energy: card.energy,
    might: card.might,
    power: card.power,
  };
}

export function toRuleEngineCard(
  card: DeckBuilderCard,
  customTagAssignments: Record<string, readonly string[]>,
): DeckCard {
  return {
    cardId: card.cardId,
    zone: card.zone,
    quantity: card.quantity,
    cardName: card.cardName,
    cardType: card.cardType,
    cardTypes: card.cardTypes,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags,
    customTagSlugs: customTagAssignments[card.cardId] ?? [],
    keywords: card.keywords,
    maxCopiesOverride: card.maxCopiesOverride,
    banned: card.banned,
  };
}

export function getDeckCardKey(card: {
  cardId: string;
  zone: DeckZone;
  preferredPrintingId: string | null;
}): string {
  return deckCardKey(card.cardId, card.zone, card.preferredPrintingId);
}

const MOVE_TARGET_ORDER: readonly DeckZone[] = [
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
];

/**
 * Formats without a sideboard drop it as a target; it stays a valid source
 * so stray sideboard cards can still be moved out.
 */
export function getAllowedMoveTargets(
  card: {
    cardTypes: CardType[];
    superTypes: SuperType[];
    zone: DeckZone;
  },
  format: DeckFormat,
): DeckZone[] {
  return MOVE_TARGET_ORDER.filter(
    (zone) =>
      zone !== card.zone &&
      isCardAllowedInZone(card, zone) &&
      (zone !== WellKnown.deckZone.SIDEBOARD || formatHasSideboard(format)),
  );
}

export interface DeckMoveRow {
  zone: DeckZone;
  splitOne: boolean;
}

/**
 * Touch has no shift-click modifier, so a stack of several copies also gets
 * an explicit single-copy row per zone; otherwise splitting one off is
 * impossible where drag is also disabled.
 */
export function buildMoveRows(
  targets: readonly DeckZone[],
  quantity: number,
  offerSplitRows: boolean,
): DeckMoveRow[] {
  if (!offerSplitRows || quantity <= 1) {
    return targets.map((zone) => ({ zone, splitOne: false }));
  }
  return targets.flatMap((zone) => [
    { zone, splitOne: false },
    { zone, splitOne: true },
  ]);
}

export function isCardAllowedInZone(
  card: { cardTypes: CardType[]; superTypes: SuperType[] },
  zone: DeckZone,
): boolean {
  // Tokens (rule 133.7.c) are never registered in a deck, so no zone takes
  // one, overflow included.
  if (card.superTypes.includes(WellKnown.superType.TOKEN)) {
    return false;
  }
  switch (zone) {
    case WellKnown.deckZone.LEGEND: {
      return card.cardTypes.includes(WellKnown.cardType.LEGEND);
    }
    case WellKnown.deckZone.CHAMPION: {
      return (
        card.superTypes.includes(WellKnown.superType.CHAMPION) &&
        !card.cardTypes.includes(WellKnown.cardType.LEGEND)
      );
    }
    case WellKnown.deckZone.RUNES: {
      return card.cardTypes.includes(WellKnown.cardType.RUNE);
    }
    case WellKnown.deckZone.BATTLEFIELD: {
      return card.cardTypes.includes(WellKnown.cardType.BATTLEFIELD);
    }
    case WellKnown.deckZone.OVERFLOW: {
      // Any card type is welcome; the rule engine ignores overflow contents
      // entirely, so this never affects deck legality.
      return true;
    }
    case WellKnown.deckZone.MAIN:
    case WellKnown.deckZone.SIDEBOARD: {
      return (
        !card.cardTypes.includes(WellKnown.cardType.LEGEND) &&
        !card.cardTypes.includes(WellKnown.cardType.RUNE) &&
        !card.cardTypes.includes(WellKnown.cardType.BATTLEFIELD)
      );
    }
    default: {
      return false;
    }
  }
}

/**
 * Moves between two copy-limit zones (main/sideboard/champion) preserve the
 * cross-zone copy total, so the 3-copy cap doesn't apply there, including for
 * drops back into the source zone.
 */
export function isDeckZoneFullForDrag(args: {
  zone: DeckZone;
  draggedCard: { cardId: string; maxCopiesOverride: number | null };
  fromZone: DeckZone | null;
  allCards: readonly { cardId: string; zone: DeckZone; quantity: number }[];
  format: DeckFormat;
}): boolean {
  const { zone, draggedCard, fromZone, allCards, format } = args;
  const draggedCardId = draggedCard.cardId;
  if (format === WellKnown.deckFormat.FREEFORM) {
    return false;
  }
  // Formats without a sideboard reject drops into it. Drops from within the
  // sideboard stay allowed so putting a card back down doesn't discard it.
  if (
    zone === WellKnown.deckZone.SIDEBOARD &&
    !formatHasSideboard(format) &&
    fromZone !== WellKnown.deckZone.SIDEBOARD
  ) {
    return true;
  }
  if (COPY_LIMIT_ZONES.has(zone) && (fromZone === null || !COPY_LIMIT_ZONES.has(fromZone))) {
    const total = allCards
      .filter((entry) => entry.cardId === draggedCardId && COPY_LIMIT_ZONES.has(entry.zone))
      .reduce((sum, entry) => sum + entry.quantity, 0);
    if (total >= copyLimitFor(draggedCard)) {
      return true;
    }
  }
  if (zone === WellKnown.deckZone.BATTLEFIELD) {
    // Custom-region allows exactly one battlefield; moves within the zone
    // stay allowed so a reorder-drop doesn't get rejected.
    if (
      format === WellKnown.deckFormat.CUSTOM_REGION &&
      fromZone !== WellKnown.deckZone.BATTLEFIELD &&
      allCards.some((card) => card.zone === WellKnown.deckZone.BATTLEFIELD)
    ) {
      return true;
    }
    return allCards.some(
      (card) => card.cardId === draggedCardId && card.zone === WellKnown.deckZone.BATTLEFIELD,
    );
  }
  if (zone === WellKnown.deckZone.RUNES) {
    const runeTotal = allCards
      .filter((card) => card.zone === WellKnown.deckZone.RUNES)
      .reduce((sum, card) => sum + card.quantity, 0);
    return runeTotal >= RUNE_TARGET;
  }
  return false;
}

/**
 * In printings view, the card's canonical printing cell targets the null-art
 * row like the default-art row does elsewhere; every other printing pins to
 * its own id.
 */
export function cellPreferredPrintingId(
  view: "cards" | "printings",
  printingId: string,
  defaultPrintingId?: string | null,
): string | null {
  if (view !== "printings") {
    return null;
  }
  return printingId === defaultPrintingId ? null : printingId;
}

/**
 * A pinned row counts on its printing's cell; a default-art (null) row
 * counts on the card's canonical printing cell.
 */
export function buildDeckQuantityByCell(
  deckCards: readonly { cardId: string; quantity: number; preferredPrintingId: string | null }[],
  defaultPrintingFor: (cardId: string) => string | null | undefined,
): Map<string, number> {
  const byCell = new Map<string, number>();
  for (const card of deckCards) {
    const cellId = card.preferredPrintingId ?? defaultPrintingFor(card.cardId);
    if (!cellId) {
      continue;
    }
    byCell.set(cellId, (byCell.get(cellId) ?? 0) + card.quantity);
  }
  return byCell;
}

export function catalogCardToDeckBuilderCard(cardId: string, card: Card): DeckBuilderCard {
  return {
    cardId,
    zone: WellKnown.deckZone.MAIN,
    quantity: 1,
    preferredPrintingId: null,
    cardName: card.name,
    cardType: card.type,
    cardTypes: card.types,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags,
    keywords: card.keywords,
    maxCopiesOverride: card.maxCopiesOverride,
    banned: isCardBanned(card),
    energy: card.energy,
    might: card.might,
    power: card.power,
  };
}

export function toDeckBuilderCard(
  deckCard: DeckCardResponse,
  cardsById: Record<string, Card>,
): DeckBuilderCard | null {
  const card = cardsById[deckCard.cardId];
  if (!card) {
    return null;
  }
  return {
    cardId: deckCard.cardId,
    zone: deckCard.zone,
    quantity: deckCard.quantity,
    preferredPrintingId: deckCard.preferredPrintingId,
    cardName: card.name,
    cardType: card.type,
    cardTypes: card.types,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags ?? EMPTY_ARRAY,
    keywords: card.keywords ?? EMPTY_ARRAY,
    maxCopiesOverride: card.maxCopiesOverride ?? null,
    banned: isCardBanned(card),
    energy: card.energy,
    might: card.might,
    power: card.power,
  };
}

export function runeTotalOf(cards: DeckBuilderCard[]): number {
  let total = 0;
  for (const card of cards) {
    if (card.zone === WellKnown.deckZone.RUNES) {
      total += card.quantity;
    }
  }
  return total;
}

/**
 * At the RUNE_TARGET cap, an add is only valid when rebalanceRunes can
 * decrement an already-present opposite-domain rune of a dual-domain legend.
 */
export function canAddRune(card: DeckBuilderCard, deckCards: DeckBuilderCard[]): boolean {
  const runeTotal = runeTotalOf(deckCards);
  if (runeTotal < RUNE_TARGET) {
    return true;
  }
  const legend = deckCards.find((entry) => entry.zone === WellKnown.deckZone.LEGEND);
  if (!legend || legend.domains.length < 2) {
    return false;
  }
  const otherDomain = legend.domains.find((domain) => !card.domains.includes(domain));
  if (!otherDomain) {
    return false;
  }
  return deckCards.some(
    (entry) =>
      entry.zone === WellKnown.deckZone.RUNES &&
      entry.domains.some((domain) => domain === otherDomain),
  );
}
