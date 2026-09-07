import type { CardType, DeckZone, Domain, SuperType } from "../types/enums.js";

export type DeckCodeFormat = "piltover" | "text" | "tts";

export interface DeckCodecCard {
  cardId: string;
  shortCode: string;
  cardName: string;
  zone: DeckZone;
  quantity: number;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  preferredPrintingId: string | null;
}

export interface EncodeResult {
  code: string;
  warnings: string[];
}

export interface DeckCodec {
  readonly formatId: string;

  /** Cards in the overflow zone must already be filtered out. */
  encode: (cards: DeckCodecCard[]) => EncodeResult;
}
