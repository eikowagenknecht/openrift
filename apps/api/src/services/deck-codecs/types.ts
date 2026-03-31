import type { CardType, DeckZone, Domain, SuperType } from "@openrift/shared/types";

/** A card entry with both its UUID and short code resolved. */
export interface DeckCodecCard {
  cardId: string;
  shortCode: string;
  zone: DeckZone;
  quantity: number;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
}

/** Result of encoding a deck into a code string. */
export interface EncodeResult {
  code: string;
  /** Cards that were skipped (e.g. no canonical printing found). */
  warnings: string[];
}

/** A raw card entry decoded from an external format, before DB resolution. */
export interface DecodedCardEntry {
  cardCode: string;
  count: number;
  sourceSlot: "mainDeck" | "sideboard" | "chosenChampion";
}

/** Result of decoding a code string into raw card entries. */
export interface DecodeResult {
  cards: DecodedCardEntry[];
  /** Issues encountered during decoding (e.g. malformed entries). */
  warnings: string[];
}

/** A deck codec can encode and decode deck codes in a specific format. */
export interface DeckCodec {
  readonly formatId: string;

  /**
   * Encodes resolved deck cards into a code string.
   * Cards in the overflow zone are expected to already be filtered out.
   */
  encode(cards: DeckCodecCard[]): EncodeResult;

  /**
   * Decodes a code string into raw card entries.
   * Card resolution (short code → UUID) and zone inference are done by the caller.
   */
  decode(code: string): DecodeResult;
}
