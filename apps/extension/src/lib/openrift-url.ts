// The OpenRift instance the extension hands decks to. Override with
// WXT_OPENRIFT_URL in a .env file for local development builds
// (e.g. WXT_OPENRIFT_URL=https://localhost:5173).
const BASE_URL: string = import.meta.env.WXT_OPENRIFT_URL ?? "https://openrift.app";

/**
 * Builds the deep link to OpenRift's deck import page. The page sniffs the
 * payload's format itself, so both text lists and compact deck codes work; a
 * name prefills the deck-name field on the review step.
 * @returns The absolute import URL with the payload URL-encoded.
 */
export function deckImportUrl(payload: string, name?: string): string {
  const nameParam = name === undefined ? "" : `&name=${encodeURIComponent(name)}`;
  return `${BASE_URL}/decks/import?code=${encodeURIComponent(payload)}${nameParam}`;
}
