import type { DeckZone, Printing } from "@openrift/shared";

/** A single item in the CardViewer grid — wraps a Printing with a unique key. */
export interface CardViewerItem {
  /**
   * Unique key for this grid cell.
   * Browser: printingId. Collections stacked: printingId. Collections expanded: copyId.
   * Deck overview: `${zone}:${printingId}` so a card in multiple zones is unique per appearance.
   */
  id: string;
  printing: Printing;
  /**
   * Deck zone for deck-overview items. Lets the selection store distinguish
   * between zone instances of the same card so the highlight and arrow-nav
   * anchor at the instance the user actually clicked.
   */
  zone?: DeckZone;
  /**
   * Holding collection for /collections' copies-view items, where one item is
   * one physical copy. Set only there: a stacked tile pools copies that can sit
   * in different collections, so it has no single one. Feeds the "Collection"
   * grouping axis (see groupItemsByCollection).
   */
  collectionId?: string;
}

/** Per-cell rendering context provided by CardGrid to renderCard. */
export interface CardRenderContext {
  isSelected: boolean;
  isFlashing: boolean;
  cardWidth: number;
  priority: boolean;
}
