/**
 * Deck interchange codecs. Each format's encoder and decoder live in one
 * module so their vocabularies cannot drift and round-trip tests can chain them.
 * Piltover decoding is the exception: `parsePiltoverDeckCode` lives in
 * `../deck-code.ts`, exported from the package root, since it's imported
 * widely outside this directory (web, Discord bot).
 */
export type { DeckCodec, DeckCodecCard, DeckCodeFormat, EncodeResult } from "./types.js";

export { parseDeckImportData } from "./parse.js";
export { isPiltoverEncodable, piltoverCodec } from "./piltover.js";
export type { TextEncodableCard } from "./text.js";
export { encodeText, parseTextFormat } from "./text.js";
export { encodeTTS, parseTTSFormat } from "./tts.js";
