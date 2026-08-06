/**
 * Deck interchange codecs. Each format's encoder and decoder live in one
 * module so their vocabularies (zone headers, positional layout) cannot drift,
 * and so a round-trip test can run one straight into the other.
 *
 * Piltover *decoding* is the one exception: `parsePiltoverDeckCode` lives in
 * `../deck-code.ts` and is exported from the package root, because it predates
 * this directory and is imported widely enough (web, Discord bot) that moving
 * it would be churn. `parseDeckImportData` dispatches to it, and
 * `roundtrip.test.ts` covers it against this directory's encoder.
 */
export type { DeckCodec, DeckCodecCard, DeckCodeFormat, EncodeResult } from "./types.js";

export { parseDeckImportData } from "./parse.js";
export { isPiltoverEncodable, piltoverCodec } from "./piltover.js";
export type { TextEncodableCard } from "./text.js";
export { encodeText, parseTextFormat } from "./text.js";
export { encodeTTS, parseTTSFormat } from "./tts.js";
