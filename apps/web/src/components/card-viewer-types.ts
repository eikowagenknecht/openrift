import type { Printing } from "@openrift/shared";

/** A single item in the CardViewer grid — wraps a Printing with a unique key. */
export interface CardViewerItem {
  /**
   * Unique key for this grid cell.
   * Browser: printingId. Collections stacked: printingId. Collections expanded: copyId.
   */
  id: string;
  printing: Printing;
}

/** Per-cell rendering context provided by CardGrid to renderCard. */
export interface CardRenderContext {
  isSelected: boolean;
  isFlashing: boolean;
  cardWidth: number;
  priority: boolean;
}
