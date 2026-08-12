import type {
  Currency,
  ListEntryDetailResponse,
  ListKind,
  Printing,
  SetOrderInfo,
  TradePreference,
} from "@openrift/shared";
import {
  resolveEffectiveTradePreference,
  sortCards,
  straightenApostrophes,
  WellKnown,
} from "@openrift/shared";

import type { StackedEntry } from "@/hooks/use-stacked-copies";

import { formatPrice, formatPriceEur } from "./format";

const KIND_NOUN: Record<ListKind, { one: string; many: string }> = {
  card: { one: "card", many: "cards" },
  printing: { one: "printing", many: "printings" },
  // Copy (trade) lists merge identical copies into one line per printing, so the
  // share count is of printings, not physical copies.
  copy: { one: "printing", many: "printings" },
};

/**
 * Title-cases a finish slug for display (e.g. "rainbow_foil" → "Rainbow Foil").
 * @returns The display label.
 */
function titleCaseSlug(slug: string): string {
  return slug
    .split("_")
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * Short descriptor that disambiguates printings of the same card in a
 * printing/copy list. Short codes alone repeat across finishes/languages, so:
 * short code (always), finish only when the same card also has a different
 * finish in the list (so "Foil" appears only when a non-foil version is present
 * too), and language whenever it's not the default English.
 * @returns The descriptor prefixed with " · ", or "" for card-kind entries.
 */
function variantSuffix(
  entry: ListEntryDetailResponse,
  siblings: readonly ListEntryDetailResponse[],
): string {
  if (entry.kind === "card") {
    return "";
  }
  const parts = [entry.shortCode];
  const finishVaries = siblings.some(
    (other) => other.kind !== "card" && other.finish !== entry.finish,
  );
  if (entry.finish !== WellKnown.finish.NORMAL && finishVaries) {
    parts.push(titleCaseSlug(entry.finish));
  }
  if (entry.language !== WellKnown.language.EN) {
    parts.push(entry.language);
  }
  return ` · ${parts.join(" · ")}`;
}

/**
 * True when the list holds at least one copy pinned to a live trade (ADR-019).
 * Only copy-kind entries carry the flag, so card- and printing-kind lists are
 * always false.
 * @returns Whether any entry is a reserved copy.
 */
export function hasReservedCopies(entries: readonly ListEntryDetailResponse[]): boolean {
  return entries.some((entry) => entry.kind === "copy" && entry.reserved);
}

/**
 * Drops copies that are pinned to a live trade, so an export never promises a
 * card the take-off dialog already refuses to sell. Card- and printing-kind
 * entries carry no reserved flag, so they always survive. Apply this once on
 * the entries every format reads, not per format.
 * @returns The entries without reserved copies.
 */
export function withoutReservedCopies(
  entries: readonly ListEntryDetailResponse[],
): ListEntryDetailResponse[] {
  return entries.filter((entry) => entry.kind !== "copy" || !entry.reserved);
}

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

/**
 * Collapses copy-kind entries (one per physical copy) into one entry per
 * printing, summing quantities, so a trade binder reads "3x Cleave" instead of
 * three "1x Cleave" lines.
 * @returns One entry per distinct printing.
 */
function mergeCopiesByPrinting(
  entries: readonly ListEntryDetailResponse[],
): ListEntryDetailResponse[] {
  const byPrinting = new Map<string, ListEntryDetailResponse>();
  for (const entry of entries) {
    // Key by target identity, not entry id — rule-only entries (ADR-034) have
    // a null entry id.
    const key = entry.kind === "card" ? entry.cardId : entry.printingId;
    const existing = byPrinting.get(key);
    byPrinting.set(
      key,
      existing ? { ...existing, quantity: existing.quantity + entry.quantity } : entry,
    );
  }
  return [...byPrinting.values()];
}

/**
 * Converts printing/copy-kind list entries into the stacked shape the CSV
 * writers consume, so wishlists and tradelists export through the same
 * writers as collections. Entries of the same printing merge (a trade list
 * carries one entry per physical copy), quantities become synthetic copy ids
 * (the writers only read their count when no `copiesById` lookup is given),
 * and the result is sorted by card ID like a collection export. Card-kind
 * entries reference no printing and are skipped, as are entries whose
 * printing is missing from the catalog lookup.
 * @returns Stacks sorted by card ID.
 */
export function stacksFromListEntries(
  entries: readonly ListEntryDetailResponse[],
  printingsById: Readonly<Record<string, Printing>>,
  sets: readonly SetOrderInfo[],
): StackedEntry[] {
  const quantities = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === "card") {
      continue;
    }
    const printing = printingsById[entry.printingId];
    if (!printing) {
      continue;
    }
    quantities.set(entry.printingId, (quantities.get(entry.printingId) ?? 0) + entry.quantity);
  }

  const sorted = sortCards(
    [...quantities.keys()].map((printingId) => printingsById[printingId]),
    "id",
    { sets },
  );
  return sorted.map((printing) => ({
    printingId: printing.id,
    printing,
    copyIds: Array.from(
      { length: quantities.get(printing.id) ?? 0 },
      (_, index) => `${printing.id}#${index}`,
    ),
  }));
}

/** One want for the Cardmarket export: a card name and how many of it. */
export interface CardmarketWant {
  name: string;
  quantity: number;
}

/**
 * Formats wants as a paste-clean block for Cardmarket's shopping wizard
 * ("add multiple wants" import): pure `<quantity>x <name>` lines and nothing
 * else — no header, no short codes, no finish markers — because Cardmarket
 * matches lines by card name and any extra text breaks the match. Wants of the
 * same card (e.g. different printings) are merged into one line, and the lines
 * are sorted by name so the pasted list is easy to eyeball.
 * @returns The import text (lines joined by "\n"), or "" when empty.
 */
export function formatCardmarketWants(wants: readonly CardmarketWant[]): string {
  const byName = new Map<string, number>();
  for (const want of wants) {
    const name = straightenApostrophes(want.name);
    byName.set(name, (byName.get(name) ?? 0) + want.quantity);
  }
  return [...byName.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, quantity]) => `${quantity}x ${name}`)
    .join("\n");
}

/** Per-entry trade pricing for the share text (only CardTrader / fixed prices show). */
export interface SharePricing {
  tradeDefaults: TradePreference;
  currency: Currency | null;
  /** CardTrader (ct_zero) price in major units for a printing, or undefined. */
  ctPriceFor?: (printingId: string) => number | undefined;
}

/**
 * Trade-price suffix for a line, shown only when the entry's effective price
 * preference is a fixed amount or CardTrader (Cardmarket/TCGplayer are
 * considered inaccurate and skipped). Card-kind entries reference no specific
 * printing, so a CardTrader price can't be resolved for them.
 * @returns " — <price>", or "" when no price applies.
 */
function tradePriceText(entry: ListEntryDetailResponse, pricing: SharePricing): string {
  const effective = resolveEffectiveTradePreference(
    entry.tradeOverride,
    pricing.tradeDefaults,
    pricing.currency,
  );
  let value: number | undefined;
  if (effective.pricePref === "absolute") {
    if (effective.priceAbsoluteCents === null || effective.currency === null) {
      return "";
    }
    value = effective.priceAbsoluteCents / 100;
  } else if (effective.pricePref === "ct_zero" && entry.kind !== "card") {
    value = pricing.ctPriceFor?.(entry.printingId);
  }
  if (value === undefined) {
    return "";
  }
  return ` — ${pricing.currency === "EUR" ? formatPriceEur(value) : formatPrice(value)}`;
}

/**
 * Formats a list as a messenger-friendly block (ADR-024): a header line with
 * the list name and card count, the share link, then one `<quantity>x <name>`
 * line per entry. Unlike {@link formatCardListAsDeckText} this keeps every
 * kind — a shared trade/wish list is read by a human in a chat, not
 * round-tripped through a deckbuilder, so quantities and names of all entries
 * belong in the text.
 * The count noun follows the list kind (cards / printings / copies), and a
 * printing/copy line carries a short variant descriptor so duplicates of the
 * same card are distinguishable. `shareUrl` is omitted when the list isn't
 * shared (the rest of the block still works as a plain list).
 * @returns The share text block, ready to paste into WhatsApp / Discord.
 */
export function formatListShareText(
  listName: string,
  kind: ListKind,
  entries: readonly ListEntryDetailResponse[],
  shareUrl: string | null,
  pricing?: SharePricing,
): string {
  // Trade (copy) lists carry one entry per physical copy; merge copies of the
  // same printing into a single "nx Card" line.
  const display = kind === "copy" ? mergeCopiesByPrinting(entries) : entries;
  const count = display.length;
  const noun = count === 1 ? KIND_NOUN[kind].one : KIND_NOUN[kind].many;
  const header = `${listName} (${count} ${noun})`;
  // Group by card so a finish/language only shows when it differs across that
  // card's printings in the list.
  const byCard = Map.groupBy(display, (entry) => entry.cardName);
  const lines = display.map((entry) => {
    const siblings = byCard.get(entry.cardName) ?? [entry];
    const price = pricing ? tradePriceText(entry, pricing) : "";
    // A plain ASCII "x" multiplier, not "×" — the text gets pasted into
    // Cardmarket's wants import, which only parses "2x Name" lines.
    return `${entry.quantity}x ${straightenApostrophes(entry.cardName)}${variantSuffix(entry, siblings)}${price}`;
  });
  const head = shareUrl ? [header, shareUrl, ""] : [header, ""];
  return [...head, ...lines].join("\n");
}
