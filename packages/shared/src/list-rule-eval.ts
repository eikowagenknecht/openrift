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
  PriceLookup,
  Printing,
  RuleQuantity,
  TradePreference,
  TradeRule,
  TradeRuleCombine,
  WishRule,
  WishRuleCombine,
} from "./types/index.js";
import { ruleFiltersOnPrice } from "./types/list-rule.js";

/** Reference-table orders (plain first, premium last) for keep/offer ranking. Never sourced from prices, so the split stays stable over time. */
export type KeepPriorityOrders = Pick<EnumOrders, "finishes" | "rarities" | "artVariants">;

function orderRank(order: readonly string[], slug: string): number {
  return order.indexOf(slug);
}

/**
 * Keep-priority comparator for printings only; `reserved` is handled by the
 * caller ({@link copyKeepComparator}), not here.
 */
function comparePrintingKeepPriority(a: Printing, b: Printing, orders: KeepPriorityOrders): number {
  return (
    Number(isStandardPrinting(a)) - Number(isStandardPrinting(b)) ||
    orderRank(orders.rarities, b.rarity) - orderRank(orders.rarities, a.rarity) ||
    orderRank(orders.finishes, b.finish) - orderRank(orders.finishes, a.finish) ||
    Number(b.markers.length > 0) - Number(a.markers.length > 0) ||
    orderRank(orders.artVariants, b.artVariant) - orderRank(orders.artVariants, a.artVariant) ||
    Number(b.isOvernumbered) - Number(a.isOvernumbered) ||
    Number(b.isSigned) - Number(a.isSigned) ||
    a.canonicalRank - b.canonicalRank
  );
}

const EMPTY_TRADE_PREFERENCE: TradePreference = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
};

/** A copy owned by the list owner, fed into trade-rule evaluation. */
export interface OwnedCopyRow {
  copyId: string;
  printingId: string;
  cardId: string;
  collectionId: string;
  reserved: boolean;
}

export interface RuleEvalContext {
  catalog: Printing[];
  ownedCopies?: OwnedCopyRow[];
  customTagAssignments?: Record<string, readonly string[]>;
  enumOrders?: KeepPriorityOrders;
  priceLookup?: PriceLookup;
}

function rulePriceResolver(
  rule: ListRule,
  ctx: RuleEvalContext,
): ((printing: Printing) => number | undefined) | undefined {
  const { priceLookup } = ctx;
  const marketplace = rule.priceMarketplace;
  if (!priceLookup || marketplace === undefined) {
    return undefined;
  }
  return (printing) => priceLookup.get(printing.id, marketplace);
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
  reserved?: boolean;
  acceptablePrintingIds?: ReadonlySet<string>;
}

function resolveQuantity(quantity: RuleQuantity, card: Card): number {
  if (quantity.mode === "fixed") {
    return Math.max(0, quantity.n);
  }
  return getPlaysetSize(card.types, card.keywords) * quantity.multiplier;
}

/** One wish rule's evaluated matches, keyed for the list's kind. */
interface WishRuleTargets {
  targets: Map<string, number>;
  matchedPrintings: Map<string, Set<string>>;
  netPrintings: Map<string, Set<string>>;
}

/**
 * netOwned rules relax price when netting (a budget must not decide what
 * already counts as owned); countSpecialVersions also relaxes the standard flag, but the want itself stays on the strict filter.
 */
function wishRuleTargets(
  rule: WishRule,
  listKind: ListKind,
  ctx: RuleEvalContext,
): WishRuleTargets {
  const matched = filterCards(ctx.catalog, rule.filter, {
    customTagAssignments: ctx.customTagAssignments,
    getPrice: rulePriceResolver(rule, ctx),
  });
  const excluded = new Set(rule.excludeIds);
  const targets = new Map<string, number>();
  const matchedPrintings = new Map<string, Set<string>>();
  if (listKind === "printing") {
    for (const printing of matched) {
      if (excluded.has(printing.id)) {
        continue;
      }
      targets.set(printing.id, resolveQuantity(rule.quantity, printing.card));
    }
    return { targets, matchedPrintings, netPrintings: matchedPrintings };
  }
  for (const printing of matched) {
    if (excluded.has(printing.cardId)) {
      continue;
    }
    if (!targets.has(printing.cardId)) {
      targets.set(printing.cardId, resolveQuantity(rule.quantity, printing.card));
    }
    const printings = matchedPrintings.get(printing.cardId);
    if (printings) {
      printings.add(printing.id);
    } else {
      matchedPrintings.set(printing.cardId, new Set([printing.id]));
    }
  }
  const relaxPrice = rule.netOwned === true && ruleFiltersOnPrice(rule);
  const relaxStandard =
    rule.countSpecialVersions === true && rule.netOwned === true && rule.filter.isStandard === true;
  if (!relaxPrice && !relaxStandard) {
    // netPrintings aliases matchedPrintings here; callers must not mutate one expecting the other to stay separate.
    return { targets, matchedPrintings, netPrintings: matchedPrintings };
  }
  const netFilter = {
    ...rule.filter,
    ...(relaxPrice ? { price: { min: null, max: null } } : {}),
    ...(relaxStandard ? { isStandard: null } : {}),
  };
  const relaxed = filterCards(ctx.catalog, netFilter, {
    customTagAssignments: ctx.customTagAssignments,
    getPrice: relaxPrice ? undefined : rulePriceResolver(rule, ctx),
  });
  const netPrintings = new Map<string, Set<string>>();
  for (const printing of relaxed) {
    if (!targets.has(printing.cardId)) {
      continue;
    }
    unionInto(netPrintings, printing.cardId, [printing.id]);
  }
  return { targets, matchedPrintings, netPrintings };
}

/**
 * Reserved copies (pinned to a live outgoing trade) don't count as owned,
 * so they can't suppress a netOwned shortfall.
 */
function ownedCountsByPrinting(ctx: RuleEvalContext): Map<string, number> {
  const byPrinting = new Map<string, number>();
  for (const copy of ctx.ownedCopies ?? []) {
    if (copy.reserved) {
      continue;
    }
    byPrinting.set(copy.printingId, (byPrinting.get(copy.printingId) ?? 0) + 1);
  }
  return byPrinting;
}

function unionInto(map: Map<string, Set<string>>, key: string, printings: Iterable<string>): void {
  const existing = map.get(key);
  if (existing) {
    for (const id of printings) {
      existing.add(id);
    }
  } else {
    map.set(key, new Set(printings));
  }
}

/**
 * Sums owned copies across a card's netting pool; an owned copy outside the
 * pool doesn't count toward the target (price is never part of the pool, see {@link wishRuleTargets}).
 */
function countOwnedInPool(
  pool: ReadonlySet<string> | undefined,
  ownedByPrinting: Map<string, number>,
): number {
  if (!pool) {
    return 0;
  }
  let count = 0;
  for (const printingId of pool) {
    count += ownedByPrinting.get(printingId) ?? 0;
  }
  return count;
}

/** The owned count is subtracted from the net bucket once; subtracting per rule double-credits overlapping netOwned rules. */
function combineWishRules(
  rules: WishRule[],
  listKind: ListKind,
  ctx: RuleEvalContext,
  mode: WishRuleCombine,
): VirtualEntry[] {
  const combine = (a: number, b: number): number => (mode === "sum" ? a + b : Math.max(a, b));
  const byKey = new Map<string, { plain: number; net: number }>();
  const acceptableByKey = new Map<string, Set<string>>();
  const netPoolByKey = new Map<string, Set<string>>();
  let anyNet = false;
  for (const rule of rules) {
    anyNet ||= rule.netOwned === true;
    const { targets, matchedPrintings, netPrintings } = wishRuleTargets(rule, listKind, ctx);
    for (const [key, target] of targets) {
      const acc = byKey.get(key) ?? { plain: 0, net: 0 };
      if (rule.netOwned) {
        acc.net = combine(acc.net, target);
      } else {
        acc.plain = combine(acc.plain, target);
      }
      byKey.set(key, acc);
      const printings = matchedPrintings.get(key);
      if (printings) {
        unionInto(acceptableByKey, key, printings);
      }
      if (rule.netOwned) {
        const pool = netPrintings.get(key);
        if (pool) {
          unionInto(netPoolByKey, key, pool);
        }
      }
    }
  }
  const ownedByPrinting = anyNet ? ownedCountsByPrinting(ctx) : undefined;
  const entries: VirtualEntry[] = [];
  for (const [key, acc] of byKey) {
    const ownedCount = ownedByPrinting
      ? listKind === "printing"
        ? (ownedByPrinting.get(key) ?? 0)
        : countOwnedInPool(netPoolByKey.get(key), ownedByPrinting)
      : 0;
    const quantity = combine(acc.plain, Math.max(0, acc.net - ownedCount));
    if (quantity <= 0) {
      continue;
    }
    entries.push(
      listKind === "printing"
        ? { kind: "printing", printingId: key, quantity }
        : {
            kind: "card",
            cardId: key,
            quantity,
            acceptablePrintingIds: acceptableByKey.get(key),
          },
    );
  }
  return entries;
}

/** One trade rule's keep/offer split for one group (card or printing). */
interface TradeRulePool {
  keepN: number;
  ordered: OwnedCopyRow[];
}

/**
 * Sorts reserved copies last (already promised to a trade, so they must
 * never fill a keep slot), then by printing niceness, then copy id as the final tiebreak.
 */
function copyKeepComparator(
  printingById: Map<string, Printing>,
  enumOrders: KeepPriorityOrders | undefined,
): (first: OwnedCopyRow, second: OwnedCopyRow) => number {
  return (first, second) => {
    const byReserved = Number(first.reserved) - Number(second.reserved);
    if (byReserved !== 0) {
      return byReserved;
    }
    const firstPrinting = printingById.get(first.printingId);
    const secondPrinting = printingById.get(second.printingId);
    if (enumOrders && firstPrinting && secondPrinting) {
      const byNiceness = comparePrintingKeepPriority(firstPrinting, secondPrinting, enumOrders);
      if (byNiceness !== 0) {
        return byNiceness;
      }
    }
    return first.copyId.localeCompare(second.copyId);
  };
}

/** Must call the same {@link filterCards} / {@link wishRuleTargets} as the evaluator, or a printing omitted here is one the evaluator would still match. */
export function ownedCopyPrintingScope(
  rules: readonly ListRule[],
  listKind: ListKind,
  ctx: RuleEvalContext,
): string[] {
  const scope = new Set<string>();
  const addAll = (sets: Iterable<Set<string>>) => {
    for (const set of sets) {
      for (const id of set) {
        scope.add(id);
      }
    }
  };
  for (const rule of rules) {
    if (rule.kind === "trade") {
      for (const printing of filterCards(ctx.catalog, rule.filter, {
        customTagAssignments: ctx.customTagAssignments,
        getPrice: rulePriceResolver(rule, ctx),
      })) {
        scope.add(printing.id);
      }
      continue;
    }
    if (!rule.netOwned) {
      continue;
    }
    const { targets, matchedPrintings, netPrintings } = wishRuleTargets(rule, listKind, ctx);
    if (listKind === "printing") {
      for (const id of targets.keys()) {
        scope.add(id);
      }
      continue;
    }
    // netPrintings may just alias matchedPrintings; union both so neither branch is missed.
    addAll(netPrintings.values());
    addAll(matchedPrintings.values());
  }
  return [...scope];
}

/**
 * Groups a trade rule's candidate copies by `keepPer` (card or printing),
 * ordered keep-first via {@link copyKeepComparator}.
 */
function tradeRulePools(
  rule: TradeRule,
  ctx: RuleEvalContext,
  cardById: Map<string, Card>,
  printingById: Map<string, Printing>,
): Map<string, TradeRulePool> {
  const passing = new Set(
    filterCards(ctx.catalog, rule.filter, {
      customTagAssignments: ctx.customTagAssignments,
      getPrice: rulePriceResolver(rule, ctx),
    }).map((printing) => printing.id),
  );
  const excludedCopies = new Set(rule.excludeCopyIds);
  const candidates = (ctx.ownedCopies ?? []).filter(
    (copy) =>
      (rule.collectionIds === null || rule.collectionIds.includes(copy.collectionId)) &&
      passing.has(copy.printingId) &&
      !excludedCopies.has(copy.copyId),
  );
  const compare = copyKeepComparator(printingById, ctx.enumOrders);
  const pools = new Map<string, TradeRulePool>();
  const grouped = Map.groupBy(candidates, (copy) =>
    rule.keepPer === "printing" ? copy.printingId : copy.cardId,
  );
  for (const [key, copies] of grouped) {
    // Every copy in a group shares one card (a printing belongs to one card),
    // so the playset size is well-defined for both groupings.
    const card = cardById.get(copies[0]?.cardId ?? "");
    if (!card) {
      continue;
    }
    pools.set(key, {
      keepN: resolveQuantity(rule.keepPerCard, card),
      ordered: copies.toSorted(compare),
    });
  }
  return pools;
}

/** The count-mode accumulator for one group: keep counts + the copy union. */
interface CountGroupAcc {
  keeps: number[];
  copies: Map<string, OwnedCopyRow>;
}

/**
 * `protect`: a copy is offered only if some rule matched it and no rule kept
 * it. `count-sum`/`count-max`: keep counts combine per grouping (card vs printing) before the nicest N are kept.
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
  const pooled = rules.map((rule) => ({
    keepPer: rule.keepPer ?? "card",
    pool: tradeRulePools(rule, ctx, cardById, printingById),
  }));
  const toEntry = (copy: OwnedCopyRow): VirtualEntry => ({
    kind: "copy",
    copyId: copy.copyId,
    quantity: 1,
    reserved: copy.reserved,
  });
  if (mode === "protect") {
    const matched = new Map<string, OwnedCopyRow>();
    const kept = new Set<string>();
    for (const { pool } of pooled) {
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
  const layers = {
    card: new Map<string, CountGroupAcc>(),
    printing: new Map<string, CountGroupAcc>(),
  };
  for (const { keepPer, pool } of pooled) {
    const layer = layers[keepPer];
    for (const [key, { keepN, ordered }] of pool) {
      const acc = layer.get(key) ?? {
        keeps: [] as number[],
        copies: new Map<string, OwnedCopyRow>(),
      };
      acc.keeps.push(keepN);
      for (const copy of ordered) {
        acc.copies.set(copy.copyId, copy);
      }
      layer.set(key, acc);
    }
  }
  const compare = copyKeepComparator(printingById, ctx.enumOrders);
  const matched = new Map<string, OwnedCopyRow>();
  const kept = new Set<string>();
  for (const layer of [layers.card, layers.printing]) {
    for (const { keeps, copies } of layer.values()) {
      const keepTotal =
        mode === "count-sum" ? keeps.reduce((a, b) => a + b, 0) : Math.max(...keeps);
      [...copies.values()].toSorted(compare).forEach((copy, index) => {
        matched.set(copy.copyId, copy);
        if (index < keepTotal) {
          kept.add(copy.copyId);
        }
      });
    }
  }
  return [...matched.values()]
    .filter((copy) => !kept.has(copy.copyId))
    .map((copy) => toEntry(copy));
}

/**
 * Evaluates a single rule via {@link evaluateListRules}; with one rule, every combine mode coincides.
 */
export function evaluateListRule(
  rule: ListRule,
  listKind: ListKind,
  ctx: RuleEvalContext,
): VirtualEntry[] {
  return evaluateListRules([rule], listKind, ctx);
}

/**
 * Wish rules combine via {@link combineWishRules} (sum default / max); trade
 * rules via {@link combineTradeRules} (protect default / count-sum / count-max). A missing or unrecognized mode falls back to the default.
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
  quantity: number;
  ruleQuantity: number;
  id: string | null;
  source: EntrySource;
  tradeOverride: TradePreference;
  reserved?: boolean;
  acceptablePrintingIds?: ReadonlySet<string>;
}

/** Dedup key for an entry: copies by `copyId`, card/printing lists by `cardId`/`printingId`. */
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
  acceptablePrintingIds?: ReadonlySet<string>;
}

/**
 * Merges manual entries with pre-combined rule output by key: card/printing
 * quantities add (manual + rule), copy conflicts union with the manual row winning; `source` is `"both"` when manual and rule both hit a key.
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
        ruleQuantity: listKind === "copy" ? 1 : rule.quantity,
        id: null,
        hasManual: false,
        hasRule: true,
        tradeOverride: EMPTY_TRADE_PREFERENCE,
        reserved: rule.reserved,
        acceptablePrintingIds: rule.acceptablePrintingIds,
      });
      continue;
    }
    existing.hasRule = true;
    if (listKind === "copy") {
      existing.ruleQuantity = 1;
      existing.reserved ??= rule.reserved;
    } else {
      // Rule entries arrive pre-combined per key; max here is a residual guard, not real combining.
      existing.ruleQuantity = Math.max(existing.ruleQuantity, rule.quantity);
      existing.acceptablePrintingIds =
        !existing.hasManual && existing.acceptablePrintingIds && rule.acceptablePrintingIds
          ? new Set([...existing.acceptablePrintingIds, ...rule.acceptablePrintingIds])
          : undefined;
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
    acceptablePrintingIds: acc.hasManual ? undefined : acc.acceptablePrintingIds,
  }));
}
