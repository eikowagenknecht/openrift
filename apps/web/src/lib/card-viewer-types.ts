import type { Printing } from "@openrift/shared/types/catalog";
import type { DeckZone } from "@openrift/shared/types/enums";

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
