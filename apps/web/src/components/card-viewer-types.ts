import type { DeckZone, Printing } from "@openrift/shared";

export interface CardViewerItem {
  id: string;
  printing: Printing;
  zone?: DeckZone;
  collectionId?: string;
}

export interface CardRenderContext {
  isSelected: boolean;
  isFlashing: boolean;
  cardWidth: number;
  priority: boolean;
}
