import { normalizeNameForIdentity, WellKnown } from "@openrift/shared";

import type { ImportEntry } from "@/lib/import-parsers";
import { detectImportFormat, parseImportData } from "@/lib/import-parsers";

interface ListImportParseResult {
  entries: ImportEntry[];
  errors: string[];
  rowCount: number;
}

export function parseListImport(text: string): ListImportParseResult {
  if (detectImportFormat(text) !== null) {
    const { entries, errors, rowCount } = parseImportData(text);
    return { entries, errors, rowCount };
  }
  return parseCardListText(text);
}

/** Parses the deck-text format produced by `formatCardListAsDeckText`. */
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
    const rawQuantity = match?.[1];
    const rawName = match?.[2];
    if (rawQuantity === undefined || rawName === undefined) {
      errors.push(
        `Line ${index + 1}: couldn't read "${line}" — expected "<quantity> <card name>".`,
      );
      continue;
    }

    const quantity = Number(rawQuantity);
    const cardName = rawName.trim();
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
