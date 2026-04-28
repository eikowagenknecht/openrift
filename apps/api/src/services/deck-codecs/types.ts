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
  /** The printing this row is pinned to, or null for "default art". */
  preferredPrintingId: string | null;
}

/** Result of encoding a deck into a code string. */
export interface EncodeResult {
  code: string;
  /** Cards that were skipped (e.g. no canonical printing found). */
  warnings: string[];
}

/** A deck codec can encode deck cards into a specific format. */
export interface DeckCodec {
  readonly formatId: string;

  /**
   * Encodes resolved deck cards into a code string.
   * Cards in the overflow zone are expected to already be filtered out.
   */
  encode(cards: DeckCodecCard[]): EncodeResult;
}
