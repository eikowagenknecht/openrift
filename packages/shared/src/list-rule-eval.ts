import { filterCards } from "./filters.js";
import { getPlaysetSize } from "./playset.js";
import { isStandardPrinting } from "./standard.js";
import type {
  Card,
  EntrySource,
  EnumOrders,
  ListKind,
  ListRule,
  ListRuleCombine,
  Printing,
  RuleQuantity,
  TradePreference,
  TradeRule,
  TradeRuleCombine,
  WishRule,
  WishRuleCombine,
} from "./types/index.js";

/**
 * The reference-table orders a trade rule needs to rank owned copies by
 * "niceness" when choosing which to keep vs. offer. Each array is slugs in
 * ascending sort order (plain first, premium last), so a later index is the
 * nicer printing. Sourced from the DB reference tables (admin-driven), never
 * from prices — so the keep/offer split is stable over time.
 */
export type KeepPriorityOrders = Pick<EnumOrders, "finishes" | "rarities" | "artVariants">;

/**
 * Rank of a slug within its reference order — higher means nicer (keep-first).
 * An unlisted slug ranks below every listed one so it sorts into the offer pile.
 * @returns The zero-based order index, or `-1` when the slug is unlisted.
 */
function orderRank(order: readonly string[], slug: string): number {
  return order.indexOf(slug);
}

/**
 * Compares two printings by keep-priority: the nicer one sorts first (kept).
 * The top tier is standard-vs-special ({@link isStandardPrinting}): a special
 * copy (marked, signed, alt art, premium finish) is kept over a plain one, even
 * across rarities — "keep the special one, offer the plain reprint". Below
 * that, lexicographic across rarity, finish, art variant, then signed — each
 * measured against its reference order (premium last → higher rank kept).
 * `canonicalRank` is the neutral final tiebreak so equally-nice printings stay
 * deterministic.
 * @returns Negative if `a` should be kept before `b`, positive if `b` first, 0 if equal.
 */
function comparePrintingKeepPriority(a: Printing, b: Printing, orders: KeepPriorityOrders): number {
  return (
    Number(isStandardPrinting(a)) - Number(isStandardPrinting(b)) ||
    orderRank(orders.rarities, b.rarity) - orderRank(orders.rarities, a.rarity) ||
    orderRank(orders.finishes, b.finish) - orderRank(orders.finishes, a.finish) ||
    orderRank(orders.artVariants, b.artVariant) - orderRank(orders.artVariants, a.artVariant) ||
    Number(b.isSigned) - Number(a.isSigned) ||
    a.canonicalRank - b.canonicalRank
  );
}

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
  /**
   * Reference orders used to rank a trade rule's owned copies by niceness when
   * deciding which to keep vs. offer (rarity / finish / art variant). Optional:
   * without it the keep/offer split falls back to copy id only. Only trade
   * rules read it; the server supplies it, the client's wish preview omits it
   * (it never computes the trade copy split).
   */
  enumOrders?: KeepPriorityOrders;
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
 * One wish rule's per-key targets: matched keys (post-exclusion) mapped to the
 * rule's resolved quantity, before any `netOwned` subtraction. Netting happens
 * after combination in {@link combineWishRules} so summed rules share one
 * owned pool instead of each subtracting it again.
 * @returns Key (printing id or card id) → pre-net target quantity.
 */
function wishRuleTargets(
  rule: WishRule,
  listKind: ListKind,
  ctx: RuleEvalContext,
): Map<string, number> {
  const matched = filterCards(ctx.catalog, rule.filter, {
    customTagAssignments: ctx.customTagAssignments,
  });
  const excluded = new Set(rule.excludeIds);
  const targets = new Map<string, number>();
  if (listKind === "printing") {
    for (const printing of matched) {
      if (excluded.has(printing.id)) {
        continue;
      }
      targets.set(printing.id, resolveQuantity(rule.quantity, printing.card));
    }
    return targets;
  }
  // listKind === "card": collapse matched printings to their cards.
  for (const printing of matched) {
    if (excluded.has(printing.cardId) || targets.has(printing.cardId)) {
      continue;
    }
    targets.set(printing.cardId, resolveQuantity(rule.quantity, printing.card));
  }
  return targets;
}

/**
 * The owner's non-reserved copy counts, keyed per printing and per card, for
 * `netOwned` wish rules. Reserved copies are pinned to a live outgoing trade
 * (ADR-019) — they are about to leave the collection, so they no longer count
 * as owned and must not suppress the shortfall. (Incoming copies aren't in the
 * owner's collection yet, so they never reach this set.)
 * @returns Copy counts by printing id and by card id.
 */
function ownedCounts(ctx: RuleEvalContext): {
  byPrinting: Map<string, number>;
  byCard: Map<string, number>;
} {
  const byPrinting = new Map<string, number>();
  const byCard = new Map<string, number>();
  for (const copy of ctx.ownedCopies ?? []) {
    if (copy.reserved) {
      continue;
    }
    byPrinting.set(copy.printingId, (byPrinting.get(copy.printingId) ?? 0) + 1);
    byCard.set(copy.cardId, (byCard.get(copy.cardId) ?? 0) + 1);
  }
  return { byPrinting, byCard };
}

/**
 * Combines several wish rules' targets into per-key quantities (ADR-034
 * amendment 2). Per key, plain and `netOwned` targets accumulate in separate
 * buckets under the combine op (`sum` adds, `max` takes the larger); the owned
 * count is then subtracted from the net bucket **once**, so two summed
 * `netOwned` rules share one owned pool instead of double-crediting it. The
 * final quantity is the op over [plain bucket, clamped net shortfall].
 * @returns One virtual entry per key with a positive combined quantity.
 */
function combineWishRules(
  rules: WishRule[],
  listKind: ListKind,
  ctx: RuleEvalContext,
  mode: WishRuleCombine,
): VirtualEntry[] {
  const combine = (a: number, b: number): number => (mode === "sum" ? a + b : Math.max(a, b));
  const byKey = new Map<string, { plain: number; net: number }>();
  let anyNet = false;
  for (const rule of rules) {
    anyNet ||= rule.netOwned === true;
    for (const [key, target] of wishRuleTargets(rule, listKind, ctx)) {
      const acc = byKey.get(key) ?? { plain: 0, net: 0 };
      if (rule.netOwned) {
        acc.net = combine(acc.net, target);
      } else {
        acc.plain = combine(acc.plain, target);
      }
      byKey.set(key, acc);
    }
  }
  const owned = anyNet ? ownedCounts(ctx) : undefined;
  const entries: VirtualEntry[] = [];
  for (const [key, acc] of byKey) {
    const ownedCount = owned
      ? ((listKind === "printing" ? owned.byPrinting : owned.byCard).get(key) ?? 0)
      : 0;
    const quantity = combine(acc.plain, Math.max(0, acc.net - ownedCount));
    if (quantity <= 0) {
      continue;
    }
    entries.push(
      listKind === "printing"
        ? { kind: "printing", printingId: key, quantity }
        : { kind: "card", cardId: key, quantity },
    );
  }
  return entries;
}

/** One trade rule's keep/offer split for one card. */
interface TradeCardPool {
  /** The rule's resolved keep count for this card. */
  keepN: number;
  /** The rule's candidate copies, ordered keep-first (nicest first). */
  ordered: OwnedCopyRow[];
}

/**
 * One trade rule's candidate copies grouped per card and ordered keep-first:
 * the nicer printing first (standard-vs-special → rarity → finish → art →
 * signed, per {@link comparePrintingKeepPriority} — stable over time, no
 * prices), with copy id (uuidv7) as the final deterministic tiebreak.
 * @returns Card id → the rule's keep count and ordered candidates.
 */
function tradeRulePools(
  rule: TradeRule,
  ctx: RuleEvalContext,
  cardById: Map<string, Card>,
  printingById: Map<string, Printing>,
): Map<string, TradeCardPool> {
  const passing = new Set(
    filterCards(ctx.catalog, rule.filter, {
      customTagAssignments: ctx.customTagAssignments,
    }).map((printing) => printing.id),
  );
  const excludedCopies = new Set(rule.excludeCopyIds);
  const candidates = (ctx.ownedCopies ?? []).filter(
    (copy) =>
      (rule.collectionIds === null || rule.collectionIds.includes(copy.collectionId)) &&
      passing.has(copy.printingId) &&
      !excludedCopies.has(copy.copyId),
  );
  const enumOrders = ctx.enumOrders;
  const pools = new Map<string, TradeCardPool>();
  for (const [cardId, copies] of Map.groupBy(candidates, (copy) => copy.cardId)) {
    const card = cardById.get(cardId);
    if (!card) {
      continue;
    }
    const ordered = copies.toSorted((first, second) => {
      const firstPrinting = printingById.get(first.printingId);
      const secondPrinting = printingById.get(second.printingId);
      if (enumOrders && firstPrinting && secondPrinting) {
        const byNiceness = comparePrintingKeepPriority(firstPrinting, secondPrinting, enumOrders);
        if (byNiceness !== 0) {
          return byNiceness;
        }
      }
      return first.copyId.localeCompare(second.copyId);
    });
    pools.set(cardId, { keepN: resolveQuantity(rule.keepPerCard, card), ordered });
  }
  return pools;
}

/**
 * Combines several trade rules' keep/offer splits into offered copy entries
 * (ADR-034 amendment 2).
 * - `protect`: a copy is offered iff at least one rule matched it and **no**
 *   matching rule kept it — every rule's kept copies are sacred, so stacking
 *   rules can only widen protection, never leak a guarded copy.
 * - `count-sum` / `count-max`: per card, the rules' keep counts combine into
 *   one total (sum or max), then the nicest that-many across the union of
 *   matched copies are kept and the rest offered — "keep N total, I don't
 *   care which".
 * @returns One quantity-1 entry per offered copy.
 */
function combineTradeRules(
  rules: TradeRule[],
  ctx: RuleEvalContext,
  mode: TradeRuleCombine,
): VirtualEntry[] {
  const cardById = new Map<string, Card>();
  const printingById = new Map<string, Printing>();
  for (const printing of ctx.catalog) {
    if (!cardById.has(printing.cardId)) {
      cardById.set(printing.cardId, printing.card);
    }
    printingById.set(printing.id, printing);
  }
  const pools = rules.map((rule) => tradeRulePools(rule, ctx, cardById, printingById));
  const toEntry = (copy: OwnedCopyRow): VirtualEntry => ({
    kind: "copy",
    copyId: copy.copyId,
    quantity: 1,
    reserved: copy.reserved,
  });
  if (mode === "protect") {
    const matched = new Map<string, OwnedCopyRow>();
    const kept = new Set<string>();
    for (const pool of pools) {
      for (const { keepN, ordered } of pool.values()) {
        ordered.forEach((copy, index) => {
          matched.set(copy.copyId, copy);
          if (index < keepN) {
            kept.add(copy.copyId);
          }
        });
      }
    }
    return [...matched.values()]
      .filter((copy) => !kept.has(copy.copyId))
      .map((copy) => toEntry(copy));
  }
  // count-sum / count-max: merge per card, then keep the nicest keepTotal.
  const perCard = new Map<string, { keeps: number[]; copies: Map<string, OwnedCopyRow> }>();
  for (const pool of pools) {
    for (const [cardId, { keepN, ordered }] of pool) {
      const acc = perCard.get(cardId) ?? {
        keeps: [] as number[],
        copies: new Map<string, OwnedCopyRow>(),
      };
      acc.keeps.push(keepN);
      for (const copy of ordered) {
        acc.copies.set(copy.copyId, copy);
      }
      perCard.set(cardId, acc);
    }
  }
  const entries: VirtualEntry[] = [];
  const enumOrders = ctx.enumOrders;
  for (const { keeps, copies } of perCard.values()) {
    const keepTotal = mode === "count-sum" ? keeps.reduce((a, b) => a + b, 0) : Math.max(...keeps);
    const ordered = [...copies.values()].toSorted((first, second) => {
      const firstPrinting = printingById.get(first.printingId);
      const secondPrinting = printingById.get(second.printingId);
      if (enumOrders && firstPrinting && secondPrinting) {
        const byNiceness = comparePrintingKeepPriority(firstPrinting, secondPrinting, enumOrders);
        if (byNiceness !== 0) {
          return byNiceness;
        }
      }
      return first.copyId.localeCompare(second.copyId);
    });
    entries.push(...ordered.slice(keepTotal).map((copy) => toEntry(copy)));
  }
  return entries;
}

/**
 * Pure evaluator for a single dynamic list rule (ADR-034). Produces virtual
 * entries of the list's kind; nothing is persisted. Runs identically on the
 * server (read paths, matcher) and the client (editor preview). With one rule
 * every combine mode coincides, so this delegates to {@link evaluateListRules}.
 *
 * @returns The rule's virtual entries (empty when nothing matches).
 */
export function evaluateListRule(
  rule: ListRule,
  listKind: ListKind,
  ctx: RuleEvalContext,
): VirtualEntry[] {
  return evaluateListRules([rule], listKind, ctx);
}

/**
 * Evaluates a list's rules (ADR-034) and combines their outputs per the list's
 * combine mode (amendment 2): wish rules through {@link combineWishRules}
 * (`sum` default / `max`), trade rules through {@link combineTradeRules}
 * (`protect` default / `count-sum` / `count-max`). A mode that doesn't belong
 * to the rules' intent (or `null`/`undefined`, e.g. lists persisted before the
 * setting existed) falls back to the intent's default. The combined entries
 * are unique per key, so {@link expandList} only merges them with manual
 * entries.
 *
 * @returns The combined virtual entries across every rule (empty when none).
 */
export function evaluateListRules(
  rules: ListRule[],
  listKind: ListKind,
  ctx: RuleEvalContext,
  combine?: ListRuleCombine | null,
): VirtualEntry[] {
  const wishRules = rules.filter((rule) => rule.kind === "wish");
  const tradeRules = rules.filter((rule) => rule.kind === "trade");
  const wishMode: WishRuleCombine = combine === "max" ? "max" : "sum";
  const tradeMode: TradeRuleCombine =
    combine === "count-sum" || combine === "count-max" ? combine : "protect";
  return [
    ...(wishRules.length > 0 ? combineWishRules(wishRules, listKind, ctx, wishMode) : []),
    ...(tradeRules.length > 0 ? combineTradeRules(tradeRules, ctx, tradeMode) : []),
  ];
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
 * (ADR-034). `ruleEntries` arrive pre-combined per key by `evaluateListRules`
 * (the list's combine mode); the rendered list is `manual ∪ rule output`:
 * - card/printing: quantity is **additive** — the manual part plus the rule's
 *   contribution. The manual part stays independently editable; the rule part
 *   is reported via {@link ExpandedEntry.ruleQuantity}. (Duplicate rule keys
 *   would still dedupe to their max as a residual guard.)
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
      // Rule entries arrive pre-combined (one per key); duplicate keys dedupe
      // to their max as a residual guard rather than double-counting.
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
