import type { DeckFormat, DeckZone, Marketplace, PriceLookup } from "@openrift/shared";
import { WellKnown, copyLimitFor } from "@openrift/shared";

import { canAddRune } from "@/hooks/use-deck-builder";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { COPY_LIMIT_ZONES, getDeckCardKey, RUNE_TARGET } from "@/lib/deck-builder-card";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";
import { formatterForMarketplace } from "@/lib/format";

/**
 * Per-entry lookups the deck overview builds once for the whole surface, so a
 * zone's `.map()` callback closes over stable maps instead of recomputing per
 * thumb.
 */

/**
 * Zones whose thumbs get the full − / N / + stepper. The rest hold exactly one
 * card (legend, champion) or one copy per card (battlefield), so their only
 * edit is removal.
 */
export const STEPPER_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
]);

/** Stable empty map for the thumbs when ownership bands are off or unloaded. */
export const NO_BANDS: ReadonlyMap<string, OwnershipBandSegments> = new Map();

/** Stable empty map for the thumbs while the price chips are off. */
export const NO_PRICE_TEXTS: ReadonlyMap<string, string> = new Map();

/** Stable empty list so the focused-stats pass doesn't recompute when nothing is focused. */
export const NO_CARDS: DeckBuilderCard[] = [];

/** Stable empty map for read-only surfaces, which never show the stepper. */
export const NO_ADD_ROOM: ReadonlyMap<string, number> = new Map();

/**
 * Copies each entry's + button can still add before the format's caps stop it,
 * keyed by {@link getDeckCardKey}. `Infinity` where nothing caps the zone.
 * Mirrors the checks `addCardAction` makes so the button can disable itself
 * rather than silently doing nothing, and so shift-click knows how many copies
 * "fill up" means.
 * @returns Deck card key → copies the + button may still add.
 */
export function buildAddRoom(cards: DeckBuilderCard[], format: DeckFormat): Map<string, number> {
  const room = new Map<string, number>();
  // Freeform validates nothing, so every zone stays open.
  const freeform = format === WellKnown.deckFormat.FREEFORM;
  const runeTotal = cards.reduce(
    (sum, card) => (card.zone === WellKnown.deckZone.RUNES ? sum + card.quantity : sum),
    0,
  );
  for (const card of cards) {
    const key = getDeckCardKey(card);
    if (freeform || !STEPPER_ZONES.has(card.zone)) {
      room.set(key, Number.POSITIVE_INFINITY);
      continue;
    }
    if (card.zone === WellKnown.deckZone.RUNES) {
      // At the 12-rune target `canAddRune` still allows a swap on a two-domain
      // legend, which is one copy at a time rather than a bulk fill.
      room.set(key, canAddRune(card, cards) ? Math.max(1, RUNE_TARGET - runeTotal) : 0);
      continue;
    }
    if (COPY_LIMIT_ZONES.has(card.zone)) {
      const held = cards.reduce(
        (sum, entry) =>
          entry.cardId === card.cardId && COPY_LIMIT_ZONES.has(entry.zone)
            ? sum + entry.quantity
            : sum,
        0,
      );
      room.set(key, Math.max(0, copyLimitFor(card) - held));
      continue;
    }
    // Overflow parks cards without a cap.
    room.set(key, Number.POSITIVE_INFINITY);
  }
  return room;
}

/**
 * Preformatted per-copy price for each entry, keyed by {@link getDeckCardKey}.
 * Resolution mirrors the list rows: the owned printing's price while "show my
 * printings" is on (falling back to the display price until the price map
 * lands), the entry's display printing otherwise.
 * @returns Deck card key → formatted price string.
 */
export function buildPriceTexts(
  cards: DeckBuilderCard[],
  ownershipData: DeckOwnershipData,
  preferOwned: boolean,
  priceMap: PriceLookup | undefined,
  marketplace: Marketplace,
): Map<string, string> {
  const fmtPrice = formatterForMarketplace(marketplace);
  const texts = new Map<string, string>();
  for (const card of cards) {
    const owned = preferOwned ? ownershipData.ownedPrintingByCardId.get(card.cardId) : undefined;
    const entry = ownershipData.byCardZone.get(`${card.cardId}:${card.zone}`);
    const cents =
      owned && priceMap
        ? priceMap.get(owned.id, marketplace)
        : (entry?.cheapestPrice ?? entry?.displayPrice);
    if (cents !== undefined) {
      texts.set(getDeckCardKey(card), fmtPrice(cents));
    }
  }
  return texts;
}

/**
 * Expands a zone's cards for rendering: with "show every copy" on, a card held
 * in multiples becomes one entry per physical copy (badge-less); otherwise one
 * entry per card with its ×N badge. `copyIndex` is null for the stacked form.
 * @returns One entry per thumb to render.
 */
export function expandCopies(
  cards: DeckBuilderCard[],
  showAllCopies: boolean,
): { card: DeckBuilderCard; copyIndex: number | null }[] {
  if (!showAllCopies) {
    return cards.map((card) => ({ card, copyIndex: null }));
  }
  return cards.flatMap((card): { card: DeckBuilderCard; copyIndex: number | null }[] =>
    card.quantity > 1
      ? Array.from({ length: card.quantity }, (_, copyIndex) => ({ card, copyIndex }))
      : [{ card, copyIndex: null }],
  );
}

/**
 * Gates the floating hover preview by display mode. Stacks mode has its own
 * hover language — a pile expands the card under the cursor in place — so the
 * docked preview panel would be a second, competing answer to the same gesture.
 * The piles themselves never wire it up; this keeps the zones that don't stack
 * (a single-card Legend or Chosen Champion, a short Runes row) consistent with
 * them instead of being the only thumbs in the view that pop a preview.
 * @returns The hover handler, or undefined in stacks mode.
 */
export function overviewHoverHandler(
  stacked: boolean,
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void,
): ((cardId: string | null, preferredPrintingId?: string | null) => void) | undefined {
  return stacked ? undefined : onHoverCard;
}
