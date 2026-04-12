import { extractKeywords } from "@openrift/shared/keywords";

import type { Transact } from "../deps.js";
import type { UploadErrataEntry } from "../routes/admin/cards/schemas.js";

interface EntryRef {
  cardSlug: string;
  cardName: string;
}

interface EntryDiff extends EntryRef {
  fields: { field: string; from: unknown; to: unknown }[];
}

interface ImportErrataResult {
  dryRun: boolean;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  matchesPrintedCount: number;
  errors: string[];
  newEntries: EntryRef[];
  updatedEntries: EntryDiff[];
  skippedMatchesPrinted: EntryRef[];
}

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
): { field: string; from: unknown; to: unknown }[] {
  const diffs: { field: string; from: unknown; to: unknown }[] = [];
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

function dedupedKeywords(
  entry: Pick<UploadErrataEntry, "correctedRulesText" | "correctedEffectText">,
  printings: { printedRulesText: string | null; printedEffectText: string | null }[],
): string[] {
  const all = [
    ...extractKeywords(entry.correctedRulesText ?? ""),
    ...extractKeywords(entry.correctedEffectText ?? ""),
    ...printings.flatMap((printing) => [
      ...extractKeywords(printing.printedRulesText ?? ""),
      ...extractKeywords(printing.printedEffectText ?? ""),
    ]),
  ];
  return [...new Set(all)];
}

/**
 * Bulk-import card errata from a JSON payload. Resolves slugs → card ids,
 * classifies each entry (new, updated, unchanged, matches-printed-text,
 * unknown-slug), and either previews or applies the writes.
 *
 * Entries whose corrected text would already match every printing's printed
 * text are flagged and skipped on apply — the existing errata display logic
 * already hides those rows per-printing, so writing them would just add dead
 * rows.
 *
 * @returns Summary counts plus diffs and unresolved errors.
 */
export async function importErrata(
  transact: Transact,
  input: { entries: UploadErrataEntry[]; dryRun: boolean },
): Promise<ImportErrataResult> {
  const { entries, dryRun } = input;

  const result: ImportErrataResult = {
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
    const mut = trxRepos.candidateMutations;

    // ── Phase 1: Bulk-fetch all referenced cards and their existing state ──
    const uniqueSlugs = [...new Set(entries.map((entry) => entry.cardSlug))];
    const cards = await mut.getCardsBySlugs(uniqueSlugs);
    const cardBySlug = new Map(cards.map((card) => [card.slug, card]));
    const cardIds = cards.map((card) => card.id);

    const [existingErrata, printingTexts] = await Promise.all([
      mut.getErrataByCardIds(cardIds),
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

    // ── Phase 2: Classify each entry ───────────────────────────────────────
    for (const entry of entries) {
      const card = cardBySlug.get(entry.cardSlug);
      if (!card) {
        result.errors.push(`Unknown card slug: "${entry.cardSlug}"`);
        continue;
      }

      const ref: EntryRef = { cardSlug: card.slug, cardName: card.name };
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
          // effective_date is returned as Date from kysely; normalise to ISO date string
          effectiveDate:
            existing.effectiveDate instanceof Date
              ? existing.effectiveDate.toISOString().slice(0, 10)
              : (existing.effectiveDate ?? null),
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

      // ── Phase 3 (apply only): upsert + recompute keywords ───────────────
      if (dryRun) {
        continue;
      }

      await mut.upsertCardErrata(card.id, incoming);
      await mut.updateCardById(card.id, { keywords: dedupedKeywords(entry, printings) });
    }
  });

  return result;
}
