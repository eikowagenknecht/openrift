import type { ListEntryDetailResponse } from "@openrift/shared";
import { straightenApostrophes } from "@openrift/shared";

/**
 * Formats card-kind list entries in the deckbuilder-style text format:
 * one `<quantity> <cardName>` per line, in the order entries are given.
 * Apostrophes are straightened to ASCII so the output round-trips through
 * other deckbuilder tools (matches the deck text codec).
 *
 * Entries that aren't `kind === "card"` are skipped — the caller is
 * responsible for gating this to card-kind lists, but we filter defensively
 * so an accidental mixed input can't produce garbage lines.
 * @returns The export text (lines joined by "\n"), or "" when no card entries.
 */
export function formatCardListAsDeckText(entries: readonly ListEntryDetailResponse[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    if (entry.kind !== "card") {
      continue;
    }
    lines.push(`${entry.quantity} ${straightenApostrophes(entry.cardName)}`);
  }
  return lines.join("\n");
}
