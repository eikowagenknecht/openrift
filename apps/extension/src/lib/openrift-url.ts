// The OpenRift instance the extension hands decks to. Override with
// WXT_OPENRIFT_URL in a .env file for local development builds
// (e.g. WXT_OPENRIFT_URL=https://localhost:5173).
const BASE_URL: string = import.meta.env.WXT_OPENRIFT_URL ?? "https://openrift.app";

/** What rides along with the decklist on the import deep link. */
export interface DeckImportExtras {
  /** Deck title from the page, prefilling the deck-name field. */
  name?: string;
  /** The page the deck came from, offered as an outbound deck link. */
  source?: string;
}

/**
 * Builds the deep link to OpenRift's deck import page. The page sniffs the
 * payload's format itself, so both text lists and compact deck codes work; a
 * name prefills the deck-name field on the review step, and a source URL is
 * offered there as a link to save with the deck.
 * @returns The absolute import URL with every part URL-encoded.
 */
export function deckImportUrl(payload: string, extras: DeckImportExtras = {}): string {
  // encodeURIComponent, not URLSearchParams: the latter writes spaces as `+`,
  // which the router's decodeURIComponent-based parser hands back literally.
  // A text decklist is mostly spaces, so that would corrupt every card name.
  const parts = [`code=${encodeURIComponent(payload)}`];
  if (extras.name !== undefined) {
    parts.push(`name=${encodeURIComponent(extras.name)}`);
  }
  if (extras.source !== undefined) {
    parts.push(`source=${encodeURIComponent(extras.source)}`);
  }
  return `${BASE_URL}/decks/import?${parts.join("&")}`;
}
