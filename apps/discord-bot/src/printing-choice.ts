import { formatPrintingVariantLabelParts } from "@openrift/shared/printing-label";
import { foldForSearch, squashForSearch } from "@openrift/shared/search-fold";

import type { CatalogCard, CatalogPrinting, CatalogSnapshot } from "./catalog-cache.js";
import { representativePrinting } from "./catalog-cache.js";

export interface PrintingChoice {
  name: string;
  value: string;
}

/** Discord caps autocomplete responses at 25 choices. */
const MAX_CHOICES = 25;

function orderedPrintings(snapshot: CatalogSnapshot, card: CatalogCard): CatalogPrinting[] {
  const printings = snapshot.printingsByCardId.get(card.id) ?? [];
  const fallback = representativePrinting(snapshot, card.id);
  if (!fallback) {
    return [];
  }
  return [fallback, ...printings.filter((printing) => printing.id !== fallback.id)];
}

export function printingVariantParts(
  snapshot: CatalogSnapshot,
  printing: CatalogPrinting,
  siblings: CatalogPrinting[],
): string[] {
  const { language, rest } = formatPrintingVariantLabelParts(printing, siblings, snapshot.labels);
  // formatPrintingVariantLabelParts omits language when siblings agree; add it back
  // for a card printed solely in one non-English language.
  const shown = language ?? (printing.language === "EN" ? null : printing.language);
  const parts = shown ? [shown, ...rest] : [...rest];
  if (parts.length === 0 && siblings.length > 1) {
    parts.push("Standard");
  }
  return parts;
}

function printingLabel(
  snapshot: CatalogSnapshot,
  printing: CatalogPrinting,
  siblings: CatalogPrinting[],
  isDefault: boolean,
): string {
  const set = snapshot.setsById.get(printing.setId);
  const parts = [printing.publicCode];
  if (set) {
    parts.push(set.name);
  }
  parts.push(...printingVariantParts(snapshot, printing, siblings));
  const label = parts.join(" · ");
  return (isDefault ? `${label} (default)` : label).slice(0, 100);
}

export function printingChoices(
  snapshot: CatalogSnapshot,
  card: CatalogCard,
  query: string,
): PrintingChoice[] {
  const printings = orderedPrintings(snapshot, card);
  const folded = foldForSearch(query);
  const choices = printings.map((printing, index) => ({
    name: printingLabel(snapshot, printing, printings, index === 0),
    value: printing.id,
  }));
  const filtered = folded
    ? choices.filter((choice) => foldForSearch(choice.name).includes(folded))
    : choices;
  return filtered.slice(0, MAX_CHOICES);
}

export function resolvePrinting(
  snapshot: CatalogSnapshot,
  card: CatalogCard,
  input: string | undefined,
): CatalogPrinting | undefined {
  const fallback = representativePrinting(snapshot, card.id);
  const query = input?.trim();
  if (!query) {
    return fallback;
  }
  const printings = snapshot.printingsByCardId.get(card.id) ?? [];
  const squashed = squashForSearch(query);
  return (
    printings.find((printing) => printing.id === query) ??
    (squashed
      ? printings.find(
          (printing) =>
            squashForSearch(printing.shortCode) === squashed ||
            squashForSearch(printing.publicCode) === squashed,
        )
      : undefined) ??
    fallback
  );
}
