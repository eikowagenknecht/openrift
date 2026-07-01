import type {
  Currency,
  ListEntryDetailResponse,
  ListKind,
  TradePreference,
} from "@openrift/shared";
import { resolveEffectiveTradePreference, straightenApostrophes } from "@openrift/shared";

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
  if (entry.finish !== "normal" && finishVaries) {
    parts.push(titleCaseSlug(entry.finish));
  }
  if (entry.language !== "EN") {
    parts.push(entry.language);
  }
  return ` · ${parts.join(" · ")}`;
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
 * printing, summing quantities, so a trade binder reads "3× Cleave" instead of
 * three "1× Cleave" lines.
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
 * the list name and card count, the share link, then one `<quantity>× <name>`
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
  // same printing into a single "n× Card" line.
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
    return `${entry.quantity}× ${straightenApostrophes(entry.cardName)}${variantSuffix(entry, siblings)}${price}`;
  });
  const head = shareUrl ? [header, shareUrl, ""] : [header, ""];
  return [...head, ...lines].join("\n");
}
