import type {
  Card,
  CardType,
  DeckCard,
  DeckCardResponse,
  DeckFormat,
  DeckZone,
  Domain,
  SuperType,
} from "@openrift/shared";
import { WellKnown, copyLimitFor, formatHasSideboard, isBaseBanFormat } from "@openrift/shared";

const EMPTY_ARRAY: string[] = [];

/**
 * Whether a catalog card is banned in a way that invalidates a deck. Only the
 * base banlist counts — mode-scoped bans (e.g. 2v2) stay a display-only
 * ribbon, since a deck carries no play-mode identity.
 * @returns True when the card is on the base banlist.
 */
export function isCardBanned(card: Pick<Card, "bans">): boolean {
  return card.bans.some((ban) => isBaseBanFormat(ban.formatId));
}

/** A complete deck holds this many runes; rune adds stop once the total reaches it. */
export const RUNE_TARGET = 12;

// Zones whose copies share the 3-copy cap. Overflow is intentionally excluded:
// it is a free "park here" holding area, so its copies neither count toward the
// cap nor are capped themselves.
export const COPY_LIMIT_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.CHAMPION,
]);

export interface DeckBuilderCard {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  /** Printing pinned for display, or null for "default art". */
  preferredPrintingId: string | null;
  cardName: string;
  /** Primary type (`cardTypes[0]`); used for display/sort bucketing only. */
  cardType: CardType;
  /** Full ordered type set (ADR-037); zone gating checks membership here. */
  cardTypes: CardType[];
  superTypes: SuperType[];
  domains: Domain[];
  tags: string[];
  keywords: string[];
  /** Per-card deck copy-limit override (`Card.maxCopiesOverride`); null = normal 3-copy rule. */
  maxCopiesOverride: number | null;
  /** True when the card is on the base banlist; drives the `CARD_BANNED` rule violation. */
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

/**
 * Projects a builder card into the rule-engine's `DeckCard` shape, stitching
 * in the catalog-side custom-tag slugs for tag-locked formats. Centralises
 * the field-by-field copy that `DeckOverview` and `useDeckViolations` both
 * need so adding a new rule-engine field stays a one-line change.
 *
 * @returns The `DeckCard` to feed into `validateDeck`.
 */
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

// Display order for the "Move to" context menu — mirrors the sidebar zone
// order (legend → champion → runes → battlefield → main → sideboard → overflow).
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
 * Lists zones a card can be moved into via the context menu — every zone where
 * its type is allowed, minus its current zone, in display order. Formats
 * without a sideboard drop it as a target; it stays a valid source so stray
 * sideboard cards can still be moved out.
 *
 * @returns Allowed target zones for the move-to menu.
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

/**
 * Checks whether a card is allowed in a given zone based on its type/supertypes.
 *
 * @returns true if the card's type is valid for the zone
 */
export function isCardAllowedInZone(
  card: { cardTypes: CardType[]; superTypes: SuperType[] },
  zone: DeckZone,
): boolean {
  // Tokens are created by effects during play (rule 133.7.c), never registered
  // in a deck — so no zone takes one, overflow included. This is the gate the
  // add strips, drag-and-drop, and the "move to" menu all read.
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
      // Overflow is a free "park here" holding area: any card type is welcome,
      // including Legends, Runes, and Battlefields. The rule engine ignores
      // overflow contents entirely (see deck-rules.ts), so this never affects
      // deck legality.
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
 * Determines whether dropping the currently dragged card into `zone` would
 * exceed a zone's capacity (3-copy cap, 12-rune cap, battlefield uniqueness).
 *
 * Moves between two copy-limit zones (main/sideboard/champion) preserve the
 * cross-zone copy total, so the 3-copy cap doesn't apply there — including
 * for drops back into the source zone, which would otherwise force the user
 * to discard the card. Drops from a non-copy-limit source (overflow, or the
 * card browser) still count toward the cap, since overflow copies don't
 * count toward the total and nothing else caps the add.
 *
 * @returns true if the zone should reject the drop.
 */
export function isDeckZoneFullForDrag(args: {
  zone: DeckZone;
  draggedCard: { cardId: string; maxCopiesOverride: number | null };
  /** Source zone of the dragged card, or null when the drag started in the card browser. */
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
    // Custom-region allows exactly one battlefield: the zone is full as soon
    // as any battlefield sits there. Moves within the zone stay allowed so a
    // reorder-drop doesn't get rejected.
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
 * In the deck builder's printings view, decides which `preferredPrintingId` a
 * given printing cell's add/remove should target. Cards view always operates on
 * the default-art (null) row. In printings view the card's canonical printing
 * cell also targets the null-art row — matching how the deck list and the
 * "change printing" menu treat default art — while every other printing pins to
 * its own id.
 *
 * @returns The `preferredPrintingId` to add/remove against (null = default art).
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
 * Sums deck quantities onto the printing cell each row belongs to. A pinned row
 * counts on its printing's cell; a default-art (null) row counts on the card's
 * canonical printing cell. This keeps per-cell counts summing to the per-card
 * total and consistent with the printing the deck list renders for null art.
 *
 * @returns A map of printing id → total in-deck quantity for that cell.
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

/**
 * Converts an API DeckCardResponse to a DeckBuilderCard by resolving card
 * metadata from the catalog.
 * @returns A DeckBuilderCard with full card data, or null if card not found.
 */
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
