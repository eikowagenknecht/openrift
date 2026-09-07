import type { DeckFormat, DeckFormatConfig, DeckLink, DeckZone } from "@openrift/shared";

export const LOCAL_DECK_PREFIX = "local:";

// Never gate this on the absence of `userId`: it is briefly null during
// session load for a logged-in user too, and would misroute a real deck.
export function isLocalDeckId(id: string): boolean {
  return id.startsWith(LOCAL_DECK_PREFIX);
}

export interface LocalDeckCard {
  zone: DeckZone;
  cardId: string;
  quantity: number;
  preferredPrintingId: string | null;
}

export interface LocalDeck {
  id: string;
  name: string;
  description: string;
  format: DeckFormat;
  formatConfig: DeckFormatConfig | null;
  cards: LocalDeckCard[];
  coverCardId: string | null;
  coverPrintingId: string | null;
  coverPosition: number | null;
  links: DeckLink[];
  createdAt: string;
  updatedAt: string;
}
