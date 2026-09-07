import type { DeckImportEntry } from "@openrift/shared/deck-code";
import { isDeckCode } from "@openrift/shared/deck-code";
import type { DeckCodeFormat } from "@openrift/shared/deck-codecs";
import { parseDeckImportData } from "@openrift/shared/deck-codecs";
import { ZONE_LABELS } from "@openrift/shared/deck-zones";
import type { PublicDeckCardResponse } from "@openrift/shared/types/api/deck";
import { sourceSlotForZone } from "@openrift/shared/zone-inference";

export type { DeckImportEntry } from "@openrift/shared/deck-code";
export { parseDeckImportData } from "@openrift/shared/deck-codecs";

export type DeckImportFormat = DeckCodeFormat;

export type DeckImportUrlSniff =
  | { kind: "share-token"; token: string }
  | { kind: "deck-code"; code: string }
  | { kind: "url-no-deck" };

const SHARE_TOKEN_PATH = /\/decks\/share\/(?<token>[A-Za-z0-9]{6,64})\/?$/u;

const TTS_TOKEN = /^[A-Z]+-\d+(?:-\d+)?$/u;

function parseUrlCandidate(text: string): URL | null {
  if (/\s/u.test(text)) {
    return null;
  }
  let candidate: string | null = null;
  if (/^https?:\/\//iu.test(text)) {
    candidate = text;
  } else if (/^www\./iu.test(text) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/iu.test(text)) {
    candidate = `https://${text}`;
  }
  if (!candidate) {
    return null;
  }
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

/** Works purely on the URL string; no page is ever fetched. */
export function extractDeckFromUrl(text: string): DeckImportUrlSniff | null {
  const url = parseUrlCandidate(text.trim());
  if (!url) {
    return null;
  }

  const shareMatch = SHARE_TOKEN_PATH.exec(url.pathname);
  const token = shareMatch?.groups?.token;
  if (token) {
    return { kind: "share-token", token };
  }

  const candidates: string[] = [];
  for (const segment of url.pathname.split("/")) {
    if (segment) {
      candidates.push(segment);
    }
  }
  for (const [, value] of url.searchParams) {
    if (value) {
      candidates.push(value);
    }
  }
  // Hash fragments can carry their own pseudo-path or key=value pairs.
  for (const piece of url.hash.replace(/^#/u, "").split(/[/=&?]/u)) {
    if (piece) {
      candidates.push(piece);
    }
  }

  for (const candidate of candidates) {
    if (isDeckCode(candidate)) {
      return { kind: "deck-code", code: candidate };
    }
  }

  return { kind: "url-no-deck" };
}

export function sniffDeckImportFormat(text: string): DeckImportFormat {
  const tokens = text.trim().split(/\s+/u);
  const [firstToken] = tokens;
  if (
    firstToken !== undefined &&
    firstToken !== "" &&
    tokens.every((token) => TTS_TOKEN.test(token))
  ) {
    return "tts";
  }
  if (tokens.length === 1 && firstToken !== undefined && isDeckCode(firstToken)) {
    return "piltover";
  }
  return "text";
}

export function parseDeckImportAuto(
  text: string,
): { format: DeckImportFormat } & ReturnType<typeof parseDeckImportData> {
  const format = sniffDeckImportFormat(text);
  return { format, ...parseDeckImportData(text, format) };
}

export function entriesFromSharedDeck(cards: PublicDeckCardResponse[]): DeckImportEntry[] {
  return cards.map((card) => ({
    shortCode: card.shortCode ?? undefined,
    cardName: card.cardName,
    quantity: card.quantity,
    sourceSlot: sourceSlotForZone(card.zone),
    explicitZone: card.zone,
    rawFields: { "Parsed Name": card.cardName, Zone: ZONE_LABELS[card.zone] },
  }));
}
