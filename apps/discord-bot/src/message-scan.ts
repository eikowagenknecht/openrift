/** Cards mentioned per message are capped to keep replies from flooding a channel. */
export const MAX_CARD_REFERENCES = 3;

const CARD_REFERENCE = /\[\[(?<name>[^\n[\]]{1,100})\]\]/gu;

/**
 * Extracts `[[card name]]` references from a message. Trims each name, drops
 * empties, dedupes case-insensitively, and caps the result at
 * {@link MAX_CARD_REFERENCES}.
 *
 * @returns The distinct referenced names, in order of first appearance.
 */
export function extractCardReferences(content: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of content.matchAll(CARD_REFERENCE)) {
    const name = match.groups?.name?.trim();
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(name);
    if (names.length >= MAX_CARD_REFERENCES) {
      break;
    }
  }
  return names;
}
