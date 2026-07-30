import { foldForSearch, formatPrintingVariantLabelParts, squashForSearch } from "@openrift/shared";

import type { CatalogCard, CatalogPrinting, CatalogSnapshot } from "./catalog-cache.js";
import { representativePrinting } from "./catalog-cache.js";

/** One autocomplete choice for the /card `printing` option. */
export interface PrintingChoice {
  name: string;
  value: string;
}

/** Discord caps autocomplete responses at 25 choices. */
const MAX_CHOICES = 25;

/**
 * A card's printings with the representative (default) one first and the rest
 * in canonical-rank order.
 *
 * @returns The ordered printings; empty for a card without printings.
 */
function orderedPrintings(snapshot: CatalogSnapshot, card: CatalogCard): CatalogPrinting[] {
  const printings = snapshot.printingsByCardId.get(card.id) ?? [];
  const fallback = representativePrinting(snapshot, card.id);
  if (!fallback) {
    return [];
  }
  return [fallback, ...printings.filter((printing) => printing.id !== fallback.id)];
}

/**
 * The attributes that tell a printing apart from the card's other printings —
 * language, art variant, finish, size, signature, markers — named by the same
 * shared helper the site's printing picker uses. Without them a standard and a
 * foil print read identically, since they share a public code and a set.
 *
 * @returns The label pieces, in the site's order; empty for a lone printing
 * with nothing to distinguish.
 */
export function printingVariantParts(
  snapshot: CatalogSnapshot,
  printing: CatalogPrinting,
  siblings: CatalogPrinting[],
): string[] {
  const { language, rest } = formatPrintingVariantLabelParts(printing, siblings, snapshot.labels);
  // The shared helper only surfaces a language when the siblings disagree; a
  // card printed solely in one non-English language still says so here, since
  // the bot carries no other language cue.
  const shown = language ?? (printing.language === "EN" ? null : printing.language);
  const parts = shown ? [shown, ...rest] : [...rest];
  // Nothing distinguishing but siblings to tell it from: say "Standard" so the
  // plain print pairs visibly with its labeled siblings, as the site's picker
  // does. A lone printing needs no such contrast.
  if (parts.length === 0 && siblings.length > 1) {
    parts.push("Standard");
  }
  return parts;
}

/**
 * One autocomplete line for a printing: public code, set name, then its
 * distinguishing variant attributes.
 *
 * @returns The choice label, truncated to Discord's 100-character limit.
 */
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

/**
 * Autocomplete choices for a card's printings: the default printing first
 * (marked as such), filtered by the user's typed text against the choice
 * label, capped at Discord's 25-choice limit. Values are printing ids. Since
 * the label carries the variant attributes, typing "foil" narrows the list to
 * the foil prints.
 *
 * @returns The matching choices, default first.
 */
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

/**
 * Resolves a printing hint to one of the card's printings. The hint is
 * normally the printing id round-tripped through the /card autocomplete, but
 * free text works too: short codes and public codes match through the same
 * `squashForSearch` folding as the site's search, so `ogn202` finds
 * `OGN-202`. Anything unrecognized (like a plain card name) falls back to the
 * default printing rather than erroring — the hint is a refinement, not a
 * gate.
 *
 * @returns The selected printing, or the representative one as fallback.
 */
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
