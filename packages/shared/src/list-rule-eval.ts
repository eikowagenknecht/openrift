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
 * The top printing tier is standard-vs-special ({@link isStandardPrinting}): a
 * special copy (marked, signed, alt art, premium finish) is kept over a plain
 * one, even across rarities — "keep the special one, offer the plain reprint".
 * Below that, lexicographic across rarity, finish, markers, art variant, then
 * signed — rarity/finish/art measured against their reference order (premium
 * last → higher rank kept), markers by presence (a marked printing — promo
 * stamp, event stamp — is kept over an unmarked one). `canonicalRank` is the
 * neutral final tiebreak so equally-nice printings stay deterministic.
 * The ladder's overriding bottom tier is `reserved` (promised copies never fill
 * a keep slot). It is a copy property, so it lives in
 * {@link copyKeepComparator}, not here.
 * @returns Negative if `a` should be kept before `b`, positive if `b` first, 0 if equal.
 */
function comparePrintingKeepPriority(a: Printing, b: Printing, orders: KeepPriorityOrders): number {
  return (
    Number(isStandardPrinting(a)) - Number(isStandardPrinting(b)) ||
    orderRank(orders.rarities, b.rarity) - orderRank(orders.rarities, a.rarity) ||
    orderRank(orders.finishes, b.finish) - orderRank(orders.finishes, a.finish) ||
    Number(b.markers.length > 0) - Number(a.markers.length > 0) ||
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
  /**
   * Latest-price lookup (major currency units), required for any rule whose
   * filter carries a price bound (`ruleFiltersOnPrice`). Each rule resolves
   * prices against its own persisted `priceMarketplace`, so two rules can
   * bound prices on different marketplaces. Without the lookup a price-bounded
   * rule matches no priced printing (same as `filterCards` without `getPrice`).
   * Note this makes such rules time-varying: their output shifts as prices
   * refresh, unlike the keep/offer ranking above, which deliberately never
   * reads prices.
   */
  priceLookup?: PriceLookup;
}

/**
 * Per-rule price resolver for `filterCards`: reads the context's lookup at the
 * rule's persisted marketplace. Undefined when the rule names no marketplace or
 * the context carries no prices — `filterCards` then treats every printing as
 * price-less (a price-bounded filter only matches via the "None" sentinel).
 * @returns The resolver, or undefined when prices can't be resolved.
 */
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
  /** Reserved annotation on copy entries (ADR-019). */
  reserved?: boolean;
  /**
   * Card entries only: the printings the producing wish rules' filters matched
   * — the only printings allowed to satisfy this want (ADR-034 amendment 3).
   * Group matching rejects supply copies outside the set. `undefined` means any
   * printing satisfies (non-card kinds; manual entries never restrict).
   */
  acceptablePrintingIds?: ReadonlySet<string>;
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
  return getPlaysetSize(card.types, card.keywords) * quantity.multiplier;
}

/** One wish rule's evaluated matches, keyed for the list's kind. */
interface WishRuleTargets {
  /** Key (printing id or card id) → pre-net target quantity. */
  targets: Map<string, number>;
  /** Card kind only: card id → the printing ids the rule's filter matched. */
  matchedPrintings: Map<string, Set<string>>;
  /**
   * Card kind only: card id → the printings whose owned copies net the want.
   * Identical to {@link matchedPrintings} unless the rule counts special
   * versions, in which case it is the superset the relaxed filter matched.
   */
  netPrintings: Map<string, Set<string>>;
}

/**
 * One wish rule's per-key targets: matched keys (post-exclusion) mapped to the
 * rule's resolved quantity, before any `netOwned` subtraction. Netting happens
 * after combination in {@link combineWishRules} so summed rules share one
 * owned pool instead of each subtracting it again. For card kind the matched
 * printing ids per card come along too — they become the want's acceptable
 * printings and the netting pool (ADR-034 amendment 3).
 *
 * With `countSpecialVersions` (card kind + `netOwned` + a filter restricted
 * to standard printings), the netting pool is widened instead to the filter
 * re-run with the standard-printing flag cleared: owned special versions fill
 * the shortfall, while the want and its acceptable printings keep the strict
 * filter. Only cards the strict filter matched get a pool — the relaxed pass
 * never adds wants. Without the standard restriction the flag is inert, so it
 * never has the inverted effect of counting plain copies.
 * @returns The rule's targets plus, for card kind, its matched and netting printings.
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
  // listKind === "card": collapse matched printings to their cards, keeping
  // every matched printing id per card.
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
  if (!rule.countSpecialVersions || !rule.netOwned || rule.filter.isStandard !== true) {
    return { targets, matchedPrintings, netPrintings: matchedPrintings };
  }
  // Clearing the flag only ever widens the match, so the relaxed set is a
  // superset of the strict one for every targeted card.
  const relaxed = filterCards(
    ctx.catalog,
    { ...rule.filter, isStandard: null },
    { customTagAssignments: ctx.customTagAssignments, getPrice: rulePriceResolver(rule, ctx) },
  );
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
 * The owner's non-reserved copy counts per printing, for `netOwned` wish
 * rules. Reserved copies are pinned to a live outgoing trade (ADR-019) — they
 * are about to leave the collection, so they no longer count as owned and must
 * not suppress the shortfall. (Incoming copies aren't in the owner's
 * collection yet, so they never reach this set.)
 * @returns Copy counts by printing id.
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

/**
 * Merges `printings` into the set stored under `key`, creating it on first use.
 * @returns Nothing; mutates `map` in place.
 */
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
 * Total owned copies across a card's netting pool (filter-aware netting,
 * ADR-034 amendment 3): only copies whose printing a `netOwned` rule matched
 * count toward the target, so an owned copy outside the filter (excluded art
 * variant, other language) doesn't fill the want.
 * @returns The owned-copy count within the pool (0 for a missing pool).
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

/**
 * Combines several wish rules' targets into per-key quantities (ADR-034
 * amendment 2). Per key, plain and `netOwned` targets accumulate in separate
 * buckets under the combine op (`sum` adds, `max` takes the larger); the owned
 * count is then subtracted from the net bucket **once**, so two summed
 * `netOwned` rules share one owned pool instead of double-crediting it. The
 * final quantity is the op over [plain bucket, clamped net shortfall].
 *
 * Card kind is filter-aware on both sides (ADR-034 amendment 3): each entry
 * carries the union of the contributing rules' matched printings as its
 * acceptable set, and netting only counts owned copies whose printing a
 * `netOwned` rule matched — an owned copy outside the filters neither fills
 * the want nor satisfies it in matching. A `countSpecialVersions` rule widens
 * only its netting pool (see {@link wishRuleTargets}); the acceptable set
 * stays strict.
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
  // Card kind only: per card, the printings any contributing rule matched
  // (acceptable set) and the ones the netOwned rules matched (netting pool).
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
  /** The rule's resolved keep count for this group. */
  keepN: number;
  /** The rule's candidate copies, ordered keep-first (nicest first). */
  ordered: OwnedCopyRow[];
}

/**
 * Comparator over owned copies by keep priority. The overriding bottom tier is
 * `reserved`: a copy pinned to a live trade (ADR-019) is already promised and
 * will leave the collection, so it must never fill a keep slot — otherwise
 * reserving the spare of a keep-N stack would push a keeper into the offered
 * set and the rule would "replenish" the offer from copies meant to stay.
 * Sorted last, a reserved copy lands in the offered tail, where matching drops
 * it ({@link buildSupply}'s reserved exclusion) and the owner's list page shows
 * it annotated. Above that the printing's keep priority
 * ({@link comparePrintingKeepPriority}), with copy id (uuidv7) as the final
 * deterministic tiebreak. Without reference orders (or for unknown printings)
 * reserved and then the copy id decide.
 * @returns A comparator for `toSorted` that puts kept-first copies first.
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

/**
 * The printing ids a rule set can ever consult from the owner's collection.
 *
 * Only two places read `ctx.ownedCopies`: {@link ownedCountsByPrinting} (for
 * `netOwned` wish rules) and {@link tradeRulePools} (trade supply). Both then
 * discard every copy whose printing isn't in the rule's matched set, and that
 * set comes from the catalog alone — no rule's match depends on what is owned.
 * So the caller can compute this first and load only the copies that can
 * survive the filter, instead of the owner's entire collection.
 *
 * Derived by calling the very same helpers the evaluator uses
 * ({@link filterCards}, {@link wishRuleTargets}) so the two cannot drift: a
 * printing this omits is a printing the evaluator would have discarded.
 *
 * Rules that never read copies (plain wish rules) contribute nothing, so an
 * empty result means no copy is needed at all.
 *
 * @param rules The list's rules.
 * @param listKind The list's kind, which decides whether wish targets are keyed by printing or card.
 * @param ctx Catalog and custom-tag assignments — `ownedCopies` is deliberately not required.
 * @returns The printing ids worth loading copies for.
 */
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
      // Keyed by printing: `ownedByPrinting.get(key)` reads the target ids
      // directly, and `matchedPrintings` is empty on this branch.
      for (const id of targets.keys()) {
        scope.add(id);
      }
      continue;
    }
    // Keyed by card: the netting pool is what gets counted. `netPrintings` is
    // the relaxed superset when `countSpecialVersions` widens it, and is the
    // same map as `matchedPrintings` otherwise — union both so neither branch
    // can be missed.
    addAll(netPrintings.values());
    addAll(matchedPrintings.values());
  }
  return [...scope];
}

/**
 * One trade rule's candidate copies grouped per the rule's `keepPer` (per card
 * by default, per printing when set) and ordered keep-first: the nicer printing
 * first (standard-vs-special → rarity → finish → markers → art → signed, per
 * {@link comparePrintingKeepPriority} — stable over time, no prices), reserved
 * copies last (already promised, so they never fill a keep slot), with copy id
 * (uuidv7) as the final deterministic tiebreak.
 * @returns Group key (card id or printing id) → the rule's keep count and ordered candidates.
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
 * Combines several trade rules' keep/offer splits into offered copy entries
 * (ADR-034 amendment 2).
 * - `protect`: a copy is offered iff at least one rule matched it and **no**
 *   matching rule kept it — every rule's kept copies are sacred, so stacking
 *   rules can only widen protection, never leak a guarded copy.
 * - `count-sum` / `count-max`: the rules' keep counts combine into one total
 *   (sum or max) within each grouping — per-card rules per card, per-printing
 *   rules per printing (counts against different group sizes never mix) — then
 *   the nicest that-many across the union of matched copies are kept and the
 *   rest offered — "keep N total, I don't care which". A copy kept by either
 *   grouping stays kept (the protect invariant applied across groupings).
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
  // count-sum / count-max: merge each rule's pools into its grouping's layer,
  // then keep the nicest keepTotal per group and offer what no layer kept.
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
  /**
   * Rule-only card entries: the printings allowed to satisfy this want, from
   * {@link VirtualEntry.acceptablePrintingIds}. A manual part (`source` manual
   * or both) lifts the restriction — a manual card want accepts any printing —
   * so the field is `undefined` there (ADR-034 amendment 3).
   */
  acceptablePrintingIds?: ReadonlySet<string>;
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
  acceptablePrintingIds?: ReadonlySet<string>;
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
 * - rule-only card entries keep their acceptable-printing set (rule∩rule
 *   overlaps union theirs); any manual part lifts the restriction (ADR-034
 *   amendment 3).
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
        acceptablePrintingIds: rule.acceptablePrintingIds,
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
      // Acceptable sets union across rule entries; an unrestricted part (a
      // manual entry, or a rule entry without a set) lifts the restriction.
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
    // A manual part accepts any printing, so only rule-only entries restrict.
    acceptablePrintingIds: acc.hasManual ? undefined : acc.acceptablePrintingIds,
  }));
}
