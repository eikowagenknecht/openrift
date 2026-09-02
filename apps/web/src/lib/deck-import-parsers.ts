import type { DeckImportEntry, PublicDeckCardResponse } from "@openrift/shared";
import { isDeckCode, sourceSlotForZone, ZONE_LABELS } from "@openrift/shared";
import type { DeckCodeFormat } from "@openrift/shared/deck-codecs";
import { parseDeckImportData } from "@openrift/shared/deck-codecs";

export type { DeckImportEntry } from "@openrift/shared";
export { parseDeckImportData } from "@openrift/shared/deck-codecs";

/**
 * The formats the import page offers. Each one's parser lives next to its
 * encoder in `@openrift/shared/deck-codecs`.
 */
export type DeckImportFormat = DeckCodeFormat;

// ---------------------------------------------------------------------------
// Format sniffing (auto-detection)
// ---------------------------------------------------------------------------

/** Result of inspecting a pasted URL for importable deck content. */
export type DeckImportUrlSniff =
  /** An OpenRift deck share link — resolve the token via the public share API. */
  | { kind: "share-token"; token: string }
  /** A URL with an embedded deck code — parse `code` in the piltover format. */
  | { kind: "deck-code"; code: string }
  /** A URL, but nothing importable was found in it. */
  | { kind: "url-no-deck" };

/** Deck share path on any host: /decks/share/{token}. Tokens are 12-char alphanumeric today; accept a lenient range so rotations of the scheme keep matching. */
const SHARE_TOKEN_PATH = /\/decks\/share\/(?<token>[A-Za-z0-9]{6,64})\/?$/u;

/** A whole-input token in TTS shape: SET-NNN with an optional art-variant suffix. */
const TTS_TOKEN = /^[A-Z]+-\d+(?:-\d+)?$/u;

/**
 * Parses input that looks like a URL. Accepts full http(s) URLs as well as
 * protocol-less pastes like "openrift.app/decks/share/abc".
 * @returns The parsed URL, or null when the input isn't URL-shaped.
 */
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

/**
 * Extracts importable deck content from a pasted URL: an OpenRift share token,
 * or a deck code embedded in a path segment, query value, or hash fragment.
 * Works purely on the URL string — no page is ever fetched.
 * @returns The URL sniff result, or null when the input is not a URL.
 */
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

/**
 * Guesses the import format of pasted (non-URL) deck text: a lone token that
 * decodes as a deck code is piltover, input made entirely of short codes is a
 * TTS string, and everything else falls back to the text-list format.
 * @returns The detected format.
 */
export function sniffDeckImportFormat(text: string): DeckImportFormat {
  const tokens = text.trim().split(/\s+/u);
  if (tokens.length > 0 && tokens[0] !== "" && tokens.every((token) => TTS_TOKEN.test(token))) {
    return "tts";
  }
  if (tokens.length === 1 && isDeckCode(tokens[0])) {
    return "piltover";
  }
  return "text";
}

/**
 * Sniffs the format of deck text and parses it in one step. Used by the
 * `?code=` deep link on /decks/import, which accepts compact deck codes and
 * URL-encoded text lists alike (e.g. from the Discord bot or the browser
 * extension).
 * @returns The detected format alongside the parsed entries and warnings.
 */
export function parseDeckImportAuto(
  text: string,
): { format: DeckImportFormat } & ReturnType<typeof parseDeckImportData> {
  const format = sniffDeckImportFormat(text);
  return { format, ...parseDeckImportData(text, format) };
}

// ---------------------------------------------------------------------------
// Shared-deck link import
// ---------------------------------------------------------------------------

/**
 * Converts the cards of a resolved shared deck (from the public share API)
 * into import entries, preserving each card's zone.
 * @returns Import entries ready for catalog matching.
 */
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
