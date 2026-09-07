const BASE_URL: string = import.meta.env.WXT_OPENRIFT_URL ?? "https://openrift.app";

export interface DeckImportExtras {
  name?: string;
  source?: string;
}

export function deckImportUrl(payload: string, extras: DeckImportExtras = {}): string {
  // encodeURIComponent, not URLSearchParams: the latter writes spaces as `+`,
  // which the router's decodeURIComponent-based parser hands back literally.
  const parts = [`code=${encodeURIComponent(payload)}`];
  if (extras.name !== undefined) {
    parts.push(`name=${encodeURIComponent(extras.name)}`);
  }
  if (extras.source !== undefined) {
    parts.push(`source=${encodeURIComponent(extras.source)}`);
  }
  return `${BASE_URL}/decks/import?${parts.join("&")}`;
}
