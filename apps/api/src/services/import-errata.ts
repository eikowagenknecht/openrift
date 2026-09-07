import type {
  ErrataEntryRef,
  UploadErrataEntry,
  UploadErrataResponse,
} from "@openrift/shared/contracts/admin/card-mutations";

import type { Transact } from "../deps.js";
import { deriveKeywords } from "../repositories/keywords.js";

interface ErrataFields {
  correctedRulesText: string | null;
  correctedEffectText: string | null;
  source: string;
  sourceUrl: string | null;
  effectiveDate: string | null;
}

const ERRATA_FIELDS = [
  "correctedRulesText",
  "correctedEffectText",
  "source",
  "sourceUrl",
  "effectiveDate",
] as const satisfies readonly (keyof ErrataFields)[];

function diffErrata(
  existing: ErrataFields,
  incoming: ErrataFields,
): { field: string; from: string | null; to: string | null }[] {
  const diffs: { field: string; from: string | null; to: string | null }[] = [];
  for (const field of ERRATA_FIELDS) {
    if (existing[field] !== incoming[field]) {
      diffs.push({ field, from: existing[field], to: incoming[field] });
    }
  }
  return diffs;
}

function matchesAllPrinted(
  entry: Pick<UploadErrataEntry, "correctedRulesText" | "correctedEffectText">,
  printings: { printedRulesText: string | null; printedEffectText: string | null }[],
): boolean {
  if (printings.length === 0) {
    return false;
  }
  return printings.every(
    (printing) =>
      (entry.correctedRulesText === null ||
        printing.printedRulesText === entry.correctedRulesText) &&
      (entry.correctedEffectText === null ||
        printing.printedEffectText === entry.correctedEffectText),
  );
}

/**
 * Entries whose corrected text already matches every printing's printed text
 * are flagged and skipped on apply; the errata display already hides those.
 */
export async function importErrata(
  transact: Transact,
  input: { entries: UploadErrataEntry[]; dryRun: boolean },
): Promise<UploadErrataResponse> {
  const { entries, dryRun } = input;

  const result: UploadErrataResponse = {
    dryRun,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    matchesPrintedCount: 0,
    errors: [],
    newEntries: [],
    updatedEntries: [],
    skippedMatchesPrinted: [],
  };

  if (entries.length === 0) {
    return result;
  }

  await transact(async (trxRepos) => {
    const mut = trxRepos.catalogMutations;
    const errata = trxRepos.cardErrata;

    const uniqueSlugs = [...new Set(entries.map((entry) => entry.cardSlug))];
    const cards = await mut.getCardsBySlugs(uniqueSlugs);
    const cardBySlug = new Map(cards.map((card) => [card.slug, card]));
    const cardIds = cards.map((card) => card.id);

    const [existingErrata, printingTexts] = await Promise.all([
      errata.getByCardIds(cardIds),
      mut.getPrintingTextsByCardIds(cardIds),
    ]);

    const errataByCardId = new Map(existingErrata.map((row) => [row.cardId, row]));
    const printingsByCardId = new Map<
      string,
      { printedRulesText: string | null; printedEffectText: string | null }[]
    >();
    for (const row of printingTexts) {
      const list = printingsByCardId.get(row.cardId) ?? [];
      list.push({
        printedRulesText: row.printedRulesText,
        printedEffectText: row.printedEffectText,
      });
      printingsByCardId.set(row.cardId, list);
    }

    for (const entry of entries) {
      const card = cardBySlug.get(entry.cardSlug);
      if (!card) {
        result.errors.push(`Unknown card slug: "${entry.cardSlug}"`);
        continue;
      }

      const ref: ErrataEntryRef = { cardSlug: card.slug, cardName: card.name };
      const printings = printingsByCardId.get(card.id) ?? [];

      if (matchesAllPrinted(entry, printings)) {
        result.matchesPrintedCount++;
        result.skippedMatchesPrinted.push(ref);
        continue;
      }

      const incoming: ErrataFields = {
        correctedRulesText: entry.correctedRulesText,
        correctedEffectText: entry.correctedEffectText,
        source: entry.source,
        sourceUrl: entry.sourceUrl,
        effectiveDate: entry.effectiveDate,
      };

      const existing = errataByCardId.get(card.id);
      if (existing) {
        const existingFields: ErrataFields = {
          correctedRulesText: existing.correctedRulesText,
          correctedEffectText: existing.correctedEffectText,
          source: existing.source,
          sourceUrl: existing.sourceUrl,
          effectiveDate: existing.effectiveDate,
        };
        const diffs = diffErrata(existingFields, incoming);
        if (diffs.length === 0) {
          result.unchangedCount++;
          continue;
        }
        result.updatedCount++;
        result.updatedEntries.push({ ...ref, fields: diffs });
      } else {
        result.newCount++;
        result.newEntries.push(ref);
      }

      if (dryRun) {
        continue;
      }

      await errata.upsert(card.id, incoming);
      await mut.updateCardById(card.id, { keywords: deriveKeywords({ errata: entry, printings }) });
    }
  });

  return result;
}
