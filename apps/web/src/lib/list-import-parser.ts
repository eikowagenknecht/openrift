import { normalizeNameForIdentity, WellKnown } from "@openrift/shared";

import type { ImportEntry } from "@/lib/import-parsers";
import { detectImportFormat, parseImportData } from "@/lib/import-parsers";

interface ListImportParseResult {
  entries: ImportEntry[];
  errors: string[];
  rowCount: number;
}

/**
 * Parses list-import input, accepting either a known CSV export (OpenRift,
 * Piltover Archive, RiftCore, RiftMana) or the plain-text `<quantity> <name>`
 * deck format. CSV exports carry finish/variant/promo detail, which lets
 * printing-kind lists resolve to a specific printing; plain text resolves by
 * name only. The format is sniffed from the header so the user doesn't have to
 * declare it.
 * @returns Parsed entries, errors, and the count of source rows seen.
 */
export function parseListImport(text: string): ListImportParseResult {
  if (detectImportFormat(text) !== null) {
    const { entries, errors, rowCount } = parseImportData(text);
    return { entries, errors, rowCount };
  }
  return parseCardListText(text);
}

/**
 * Parses the deck-text format produced by `formatCardListAsDeckText`:
 * one `<quantity> <cardName>` per line. Blank lines are skipped, malformed
 * lines surface as errors. Same-name lines are merged (quantities summed) so
 * the preview shows one row per card even if the source had duplicates.
 *
 * The matcher pipeline operates on `ImportEntry`, so we synthesize one per
 * card with placeholder source-code / variant fields — the matcher's name
 * resolution handles it from there.
 * @returns Parsed entries, errors, and the count of non-blank rows seen.
 */
export function parseCardListText(text: string): ListImportParseResult {
  const errors: string[] = [];
  const aggregated = new Map<string, ImportEntry>();
  let rowCount = 0;

  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    rowCount++;

    const match = /^(?<quantity>\d+)\s+(?<name>.+)$/u.exec(line);
    if (!match) {
      errors.push(
        `Line ${index + 1}: couldn't read "${line}" — expected "<quantity> <card name>".`,
      );
      continue;
    }

    const quantity = Number(match[1]);
    const cardName = match[2].trim();
    if (quantity <= 0) {
      errors.push(`Line ${index + 1}: quantity must be greater than zero.`);
      continue;
    }
    if (cardName.length === 0) {
      errors.push(`Line ${index + 1}: missing card name.`);
      continue;
    }

    const key = normalizeNameForIdentity(cardName);
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity += quantity;
      continue;
    }
    aggregated.set(key, {
      setPrefix: "",
      finish: WellKnown.finish.NORMAL,
      artVariant: WellKnown.artVariant.NORMAL,
      quantity,
      cardName,
      sourceCode: "",
      rawFields: {},
    });
  }

  return { entries: [...aggregated.values()], errors, rowCount };
}
