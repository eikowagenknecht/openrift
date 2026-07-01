import { filterCards } from "./filters.js";
import { getPlaysetSize } from "./playset.js";
import type {
  Card,
  EntrySource,
  ListKind,
  ListRule,
  Printing,
  RuleQuantity,
  TradePreference,
} from "./types/index.js";

const EMPTY_TRADE_PREFERENCE: TradePreference = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
};

/** A copy owned by the list owner, fed into trade-rule evaluation (ADR-034). */
export interface OwnedCopyRow {
  copyId: string;
  printingId: string;
  cardId: string;
  collectionId: string;
  /** Whether the copy is available for deck building (drives keep-priority). */
  deckbuildingAvailable: boolean;
  /** Whether the copy is pinned to a live trade (ADR-019). */
  reserved: boolean;
}

export interface RuleEvalContext {
  /** Full catalog of printings (server-assembled or client `useCatalog`). */
  catalog: Printing[];
  /** Required for trade rules: the list owner's copies. */
  ownedCopies?: OwnedCopyRow[];
  /**
   * Card id → custom-tag slugs. Required for any rule whose filter uses
   * `customTagSlugs` / `customTagSlugsExclude`; without it `filterCards` reads no
   * tags and those dimensions silently no-op (ADR-034). The server threads this
   * from the assembled catalog; the client from `useCustomTagAssignments`.
   */
  customTagAssignments?: Record<string, readonly string[]>;
}

/**
 * A rule-produced entry, of the list's own kind. `quantity` is the desired
 * (wish) or surplus (trade) count; trade entries are always quantity 1 per copy.
 */
export interface VirtualEntry {
  kind: ListKind;
  cardId?: string;
  printingId?: string;
  copyId?: string;
  quantity: number;
  /** Reserved annotation on copy entries (ADR-019). */
  reserved?: boolean;
}

/**
 * Resolves a {@link RuleQuantity} against a card. `fixed` clamps to ≥ 0;
 * `playset` multiplies the card's playset size (1 for legends / unique, else 3).
 * @returns The concrete desired/keep count.
 */
function resolveQuantity(quantity: RuleQuantity, card: Card): number {
  if (quantity.mode === "fixed") {
    return Math.max(0, quantity.n);
  }
  return getPlaysetSize(card.type, card.keywords) * quantity.multiplier;
}

/**
 * Pure evaluator for a dynamic list rule (ADR-034). Produces virtual entries of
 * the list's kind; nothing is persisted. Runs identically on the server (read
 * paths, matcher) and the client (editor preview).
 *
 * @returns The rule's virtual entries (empty when nothing matches).
 */
export function evaluateListRule(
  rule: ListRule,
  listKind: ListKind,
  ctx: RuleEvalContext,
): VirtualEntry[] {
  const options = { customTagAssignments: ctx.customTagAssignments };
  if (rule.kind === "wish") {
    const matched = filterCards(ctx.catalog, rule.filter, options);
    const excluded = new Set(rule.excludeIds);
    // When netting, subtract the owner's owned copies so only the shortfall is
    // wanted. Counts are keyed per printing (printing-kind lists) or per card
    // (card-kind lists, where any printing of the card counts toward the playset).
    // Reserved copies are pinned to a live outgoing trade (ADR-019) — they are
    // about to leave the collection, so they no longer count as owned and must
    // not suppress the shortfall. (Incoming copies aren't in the owner's
    // collection yet, so they never reach this set.)
    const ownedByPrinting = new Map<string, number>();
    const ownedByCard = new Map<string, number>();
    if (rule.netOwned) {
      for (const copy of ctx.ownedCopies ?? []) {
        if (copy.reserved) {
          continue;
        }
        ownedByPrinting.set(copy.printingId, (ownedByPrinting.get(copy.printingId) ?? 0) + 1);
        ownedByCard.set(copy.cardId, (ownedByCard.get(copy.cardId) ?? 0) + 1);
      }
    }
    if (listKind === "printing") {
      const entries: VirtualEntry[] = [];
      for (const printing of matched) {
        if (excluded.has(printing.id)) {
          continue;
        }
        const target = resolveQuantity(rule.quantity, printing.card);
        const quantity = rule.netOwned ? target - (ownedByPrinting.get(printing.id) ?? 0) : target;
        if (quantity <= 0) {
          continue;
        }
        entries.push({ kind: "printing", printingId: printing.id, quantity });
      }
      return entries;
    }
    // listKind === "card": collapse matched printings to their cards.
    const cardById = new Map<string, Card>();
    for (const printing of matched) {
      if (!cardById.has(printing.cardId)) {
        cardById.set(printing.cardId, printing.card);
      }
    }
    const entries: VirtualEntry[] = [];
    for (const [cardId, card] of cardById) {
      if (excluded.has(cardId)) {
        continue;
      }
      const target = resolveQuantity(rule.quantity, card);
      const quantity = rule.netOwned ? target - (ownedByCard.get(cardId) ?? 0) : target;
      if (quantity <= 0) {
        continue;
      }
      entries.push({ kind: "card", cardId, quantity });
    }
    return entries;
  }

  // Trade rule → copy entries. Requires the owner's copies.
  const ownedCopies = ctx.ownedCopies ?? [];
  const passing = new Set(
    filterCards(ctx.catalog, rule.filter, options).map((printing) => printing.id),
  );
  const cardById = new Map<string, Card>();
  for (const printing of ctx.catalog) {
    if (!cardById.has(printing.cardId)) {
      cardById.set(printing.cardId, printing.card);
    }
  }
  const excludedCopies = new Set(rule.excludeCopyIds);
  const candidates = ownedCopies.filter(
    (copy) =>
      (rule.collectionIds === null || rule.collectionIds.includes(copy.collectionId)) &&
      passing.has(copy.printingId) &&
      !excludedCopies.has(copy.copyId),
  );
  const entries: VirtualEntry[] = [];
  for (const [cardId, copies] of Map.groupBy(candidates, (copy) => copy.cardId)) {
    const card = cardById.get(cardId);
    if (!card) {
      continue;
    }
    const keepN = resolveQuantity(rule.keepPerCard, card);
    // Protect deck-available copies first, then order stably by id (uuidv7).
    const ordered = copies.toSorted(
      (first, second) =>
        Number(second.deckbuildingAvailable) - Number(first.deckbuildingAvailable) ||
        first.copyId.localeCompare(second.copyId),
    );
    for (const copy of ordered.slice(keepN)) {
      entries.push({ kind: "copy", copyId: copy.copyId, quantity: 1, reserved: copy.reserved });
    }
  }
  return entries;
}

/**
 * Evaluates a list's rules (ADR-034) and concatenates their virtual entries.
 * A list carries an array of rules (wish lists may have several; trade lists are
 * capped at one by the API). Overlapping outputs are deduped downstream by
 * {@link expandList} (card/printing quantity = max; copies union).
 *
 * @returns The combined virtual entries across every rule (empty when none).
 */
export function evaluateListRules(
  rules: ListRule[],
  listKind: ListKind,
  ctx: RuleEvalContext,
): VirtualEntry[] {
  return rules.flatMap((rule) => evaluateListRule(rule, listKind, ctx));
}

// ── expandList: the union authority (ADR-034 §II.4) ─────────────────────────

/** A persisted (manual) `list_entries` row, fed into {@link expandList}. */
export interface ManualEntryRow {
  id: string;
  kind: ListKind;
  cardId?: string | null;
  printingId?: string | null;
  copyId?: string | null;
  quantity: number;
  tradeOverride: TradePreference;
}

/** The merged result of manual entries ∪ rule output. */
export interface ExpandedEntry {
  kind: ListKind;
  cardId?: string;
  printingId?: string;
  copyId?: string;
  /**
   * Total wanted/surplus count. For card/printing lists it is the manual
   * entry's quantity **plus** the rule's contribution (ADR-034 additive model);
   * for copy lists it is always 1 (a copy is one physical card, so manual and
   * rule outputs union rather than sum).
   */
  quantity: number;
  /**
   * The rule's contribution to {@link quantity}: the max across overlapping
   * rules for card/printing, `1` when a rule produced a copy, else `0`. The
   * manual part is `quantity - ruleQuantity`. Rule-only entries have
   * `ruleQuantity === quantity`; pure manual entries have `ruleQuantity === 0`.
   */
  ruleQuantity: number;
  /** Real `list_entries.id` for manual/both; `null` for rule-only. */
  id: string | null;
  source: EntrySource;
  tradeOverride: TradePreference;
  reserved?: boolean;
}

/**
 * Dedup key for an entry of the given kind: copies by `copyId`, card/printing
 * lists by `cardId`/`printingId`.
 * @returns The stable key, or `null` if the target id is missing.
 */
function targetKey(
  kind: ListKind,
  entry: { cardId?: string | null; printingId?: string | null; copyId?: string | null },
): string | null {
  if (kind === "copy") {
    return entry.copyId ?? null;
  }
  if (kind === "printing") {
    return entry.printingId ?? null;
  }
  return entry.cardId ?? null;
}

/** Mutable accumulator that tracks the manual and rule parts independently. */
interface ExpansionAcc {
  kind: ListKind;
  cardId?: string;
  printingId?: string;
  copyId?: string;
  manualQuantity: number;
  ruleQuantity: number;
  id: string | null;
  hasManual: boolean;
  hasRule: boolean;
  tradeOverride: TradePreference;
  reserved?: boolean;
}

/**
 * Merges a list's manual entries with its rule output into one deduped set
 * (ADR-034). `ruleEntries` may combine the output of several rules (wish lists);
 * the rendered list is `manual ∪ rule output`:
 * - card/printing: quantity is **additive** — the manual part plus the rule's
 *   contribution (overlapping rules contribute their `max`, never summing two
 *   rules that match the same card). The manual part stays independently
 *   editable; the rule part is reported via {@link ExpandedEntry.ruleQuantity}.
 * - copy conflicts: union (one physical copy), quantity stays 1, the manual row
 *   wins (keeps its id + trade override).
 * - `source = "both"` whenever a manual entry and the rule both hit a key;
 *   rule∩rule stays `source = "rule"`.
 * - rule-only entries get `id: null`, `source: "rule"`, and an empty trade
 *   override (so they inherit the list's defaults downstream).
 *
 * @returns The deduped expanded entries (no guaranteed order).
 */
export function expandList(
  listKind: ListKind,
  manualEntries: ManualEntryRow[],
  ruleEntries: VirtualEntry[],
): ExpandedEntry[] {
  const byKey = new Map<string, ExpansionAcc>();
  for (const manual of manualEntries) {
    const key = targetKey(listKind, manual);
    if (key === null) {
      continue;
    }
    byKey.set(key, {
      kind: listKind,
      cardId: manual.cardId ?? undefined,
      printingId: manual.printingId ?? undefined,
      copyId: manual.copyId ?? undefined,
      manualQuantity: manual.quantity,
      ruleQuantity: 0,
      id: manual.id,
      hasManual: true,
      hasRule: false,
      tradeOverride: manual.tradeOverride,
    });
  }
  for (const rule of ruleEntries) {
    const key = targetKey(listKind, rule);
    if (key === null) {
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        kind: listKind,
        cardId: rule.cardId,
        printingId: rule.printingId,
        copyId: rule.copyId,
        manualQuantity: 0,
        // Copies union (one physical card); card/printing carry the rule count.
        ruleQuantity: listKind === "copy" ? 1 : rule.quantity,
        id: null,
        hasManual: false,
        hasRule: true,
        tradeOverride: EMPTY_TRADE_PREFERENCE,
        reserved: rule.reserved,
      });
      continue;
    }
    existing.hasRule = true;
    if (listKind === "copy") {
      // Union: the manual row already wins (id + override kept). Carry the
      // rule's reserved annotation only if the manual side lacked one.
      existing.ruleQuantity = 1;
      existing.reserved ??= rule.reserved;
    } else {
      // Overlapping rules contribute their max — never double-count two rules
      // that both match the same card.
      existing.ruleQuantity = Math.max(existing.ruleQuantity, rule.quantity);
    }
  }
  return [...byKey.values()].map((acc) => ({
    kind: acc.kind,
    cardId: acc.cardId,
    printingId: acc.printingId,
    copyId: acc.copyId,
    quantity:
      listKind === "copy"
        ? acc.hasManual
          ? acc.manualQuantity
          : acc.ruleQuantity
        : acc.manualQuantity + acc.ruleQuantity,
    ruleQuantity: acc.ruleQuantity,
    id: acc.id,
    source: acc.hasManual && acc.hasRule ? "both" : acc.hasManual ? "manual" : "rule",
    tradeOverride: acc.tradeOverride,
    reserved: acc.reserved,
  }));
}
