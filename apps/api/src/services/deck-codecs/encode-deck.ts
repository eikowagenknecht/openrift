import {
  encodeText,
  encodeTTS,
  isPiltoverEncodable,
  piltoverCodec,
} from "@openrift/shared/deck-codecs";
import type { DeckCodecCard, DeckCodeFormat, EncodeResult } from "@openrift/shared/deck-codecs";
import type { CardType, DeckZone, Domain, SuperType } from "@openrift/shared/types/enums";

import type { canonicalPrintingsRepo } from "../../repositories/canonical-printings.js";

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

type ShortCodeResolver = Pick<ReturnType<typeof canonicalPrintingsRepo>, "shortCodesForRows">;

/**
 * Shared by the authenticated by-id `export` handler and the public, stateless
 * `encode` endpoint (logged-out local decks).
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
  const codecCards: DeckCodecCard[] = [];
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
    result = piltoverCodec.encode(
      await degradeToEncodable(canonicalPrintings, codecCards, warnings),
    );
  }

  return { code: result.code, warnings: [...warnings, ...result.warnings] };
}

/**
 * A row pinned to an unsupported printing falls back to the card's default
 * printing when that one is encodable; rows with no encodable printing at
 * all are skipped with a warning naming the card.
 */
async function degradeToEncodable(
  canonicalPrintings: ShortCodeResolver,
  codecCards: DeckCodecCard[],
  warnings: string[],
): Promise<DeckCodecCard[]> {
  const pinnedFallbacks: DeckCodecCard[] = [];
  const dropped = new Set<DeckCodecCard>();
  for (const card of codecCards) {
    if (isPiltoverEncodable(card.shortCode)) {
      continue;
    }
    if (card.preferredPrintingId === null) {
      dropped.add(card);
      warnings.push(`Skipped "${card.cardName}": deck codes don't support ${card.shortCode} yet`);
    } else {
      pinnedFallbacks.push(card);
    }
  }

  if (pinnedFallbacks.length > 0) {
    const fallbackCodes = await canonicalPrintings.shortCodesForRows(
      pinnedFallbacks.map((card) => ({ cardId: card.cardId, preferredPrintingId: null })),
    );
    for (const [index, card] of pinnedFallbacks.entries()) {
      const fallback = fallbackCodes[index]?.shortCode;
      if (fallback && fallback !== card.shortCode && isPiltoverEncodable(fallback)) {
        warnings.push(
          `"${card.cardName}": deck codes don't support the pinned printing ${card.shortCode} yet, used ${fallback} instead`,
        );
        card.shortCode = fallback;
      } else {
        dropped.add(card);
        warnings.push(`Skipped "${card.cardName}": deck codes don't support ${card.shortCode} yet`);
      }
    }
  }

  return dropped.size > 0 ? codecCards.filter((card) => !dropped.has(card)) : codecCards;
}
