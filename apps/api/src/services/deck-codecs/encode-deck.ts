import type { CardType, DeckZone, Domain, SuperType } from "@openrift/shared/types";

import type { canonicalPrintingsRepo } from "../../repositories/canonical-printings.js";
import { encodeText, encodeTTS, piltoverCodec } from "./index.js";
import type { TextCodecCard } from "./text.js";
import type { EncodeResult } from "./types.js";

/** Deck-code formats the codecs can produce. */
export type DeckCodeFormat = "piltover" | "text" | "tts";

/**
 * The minimal per-card input the codecs need: identity + zone + quantity, plus
 * the display name (text format) and supertype/domain metadata. The short code
 * is resolved here, so callers don't pass it.
 */
export interface EncodeDeckRow {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
  cardName: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
}

/** Just the short-code resolver method this service needs. */
type ShortCodeResolver = Pick<ReturnType<typeof canonicalPrintingsRepo>, "shortCodesForRows">;

/**
 * Resolve canonical short codes for the given deck rows and encode them into the
 * requested deck-code format. Shared by the authenticated by-id `export` handler
 * and the public, stateless `encode` endpoint (logged-out local decks), so the
 * resolve-then-encode logic lives in exactly one place.
 *
 * @returns The encoded code plus any per-card warnings (e.g. missing printing).
 */
export async function encodeDeck(
  canonicalPrintings: ShortCodeResolver,
  rows: EncodeDeckRow[],
  format: DeckCodeFormat,
): Promise<EncodeResult> {
  const resolvedShortCodes = await canonicalPrintings.shortCodesForRows(
    rows.map((row) => ({ cardId: row.cardId, preferredPrintingId: row.preferredPrintingId })),
  );

  const warnings: string[] = [];
  const codecCards: TextCodecCard[] = [];
  for (const [index, row] of rows.entries()) {
    const shortCode = resolvedShortCodes[index]?.shortCode;
    if (!shortCode) {
      warnings.push(`Skipped "${row.cardName}": no canonical printing found`);
      continue;
    }
    codecCards.push({
      cardId: row.cardId,
      shortCode,
      zone: row.zone,
      quantity: row.quantity,
      cardType: row.cardType,
      superTypes: row.superTypes,
      domains: row.domains,
      cardName: row.cardName,
      preferredPrintingId: row.preferredPrintingId,
    });
  }

  let result: EncodeResult;
  if (format === "text") {
    result = encodeText(codecCards);
  } else if (format === "tts") {
    result = encodeTTS(codecCards);
  } else {
    result = piltoverCodec.encode(codecCards);
  }

  return { code: result.code, warnings: [...warnings, ...result.warnings] };
}
