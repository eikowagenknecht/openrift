import { z } from "zod";

import { marketplaceEnum } from "./pricing.js";
import type { CardFilters, FilterRange } from "./search.js";
import { cardFiltersSchema, EMPTY_CARD_FILTERS } from "./search.js";

/**
 * How a rule turns into a per-card/printing quantity (ADR-034).
 * - `fixed`: a flat count (`n`), e.g. "1 of each printing".
 * - `playset`: a multiple of the card's playset size (1 for legends / unique,
 *   3 otherwise), e.g. `multiplier: 2` = two full playsets.
 */
export const ruleQuantitySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("fixed"), n: z.number().int().min(0) }),
  z.object({ mode: z.literal("playset"), multiplier: z.number().int().min(1) }),
]);
export type RuleQuantity = z.infer<typeof ruleQuantitySchema>;

/**
 * Demand rule for card/printing lists (kind = card | printing, so wish or
 * organize). Matches the catalog with `filter`, then puts `quantity` of every
 * matched card or printing on the list except the manually excluded ids.
 *
 * The `wish` discriminant names the rule's *shape*, not the list's intent: a
 * card/printing list carries this shape whether it is a wish list ("I want
 * these") or an organize list ("keep track of these"). It predates organize
 * lists carrying rules at all (ADR-034 amendment 4) and is kept so persisted
 * rules stay readable without a data migration.
 */
export const wishRuleSchema = z.object({
  kind: z.literal("wish"),
  filter: cardFiltersSchema,
  /**
   * The marketplace whose latest price the filter's `price` range reads. Each
   * marketplace quotes its own currency (TCGplayer USD, Cardmarket/CardTrader
   * EUR), so the range's numbers are meaningless without it. Persisted on the
   * rule — never resolved from a viewer preference — so evaluation is
   * deterministic for the matcher and share viewers. Required whenever the
   * filter carries a price bound (enforced on {@link listRulesSchema}); inert
   * otherwise.
   */
  priceMarketplace: marketplaceEnum.optional(),
  /** Desired quantity per matched card/printing. */
  quantity: ruleQuantitySchema,
  /** card_ids (list.kind=card) or printing_ids (list.kind=printing) to drop. */
  excludeIds: z.array(z.string()),
  /**
   * When true, subtract the owner's owned copies from `quantity` and emit only
   * the shortfall ("what I'm still missing"), dropping anything already at the
   * target. Requires the owner's copies at evaluation time. Optional for
   * backward compatibility — absent/false means the plain target (ADR-034).
   */
  netOwned: z.boolean().optional(),
  /**
   * When true (card lists with `netOwned` and a standard-printings
   * restriction), owned special versions — the filter re-run with the
   * standard-printing flag cleared — also fill the shortfall, while the want
   * itself (and its acceptable printings) keeps the strict filter. "Count my
   * alt arts, but never ask for one." Inert unless the filter is set to
   * standard printings only, so the label stays literally true. Optional for
   * backward compatibility — absent/false nets against the filter as-is.
   */
  countSpecialVersions: z.boolean().optional(),
});
export type WishRule = z.infer<typeof wishRuleSchema>;

/**
 * What a trade rule's keep count groups by: `card` pools every printing of a
 * card together; `printing` keeps the count of each printing separately.
 */
export const tradeKeepPerSchema = z.enum(["card", "printing"]);
export type TradeKeepPer = z.infer<typeof tradeKeepPerSchema>;

/**
 * Supply rule for copy lists (kind = copy, so trade or organize). Selects the
 * owner's copies whose printing matches `filter`, holds back `keepPerCard` per
 * card (or per printing, see `keepPer`), and emits the surplus — offered for
 * trade on a trade list, simply listed on an organize list.
 *
 * As with {@link wishRuleSchema}, the `trade` discriminant names the rule's
 * shape, not the list's intent (ADR-034 amendment 4).
 */
export const tradeRuleSchema = z.object({
  kind: z.literal("trade"),
  filter: cardFiltersSchema,
  /** See {@link wishRuleSchema}: the marketplace backing the filter's price range. */
  priceMarketplace: marketplaceEnum.optional(),
  /** null = all owned collections; else restrict the source to these collection ids. */
  collectionIds: z.array(z.string()).nullable(),
  /** Keep N per card/printing, trade the rest. `{ mode: "fixed", n: 0 }` = trade all. */
  keepPerCard: ruleQuantitySchema,
  /**
   * What `keepPerCard` counts against. Optional for backward compatibility —
   * absent means `card` (all printings of a card pooled together).
   */
  keepPer: tradeKeepPerSchema.optional(),
  /** copy_ids to never offer, even when surplus. */
  excludeCopyIds: z.array(z.string()),
});
export type TradeRule = z.infer<typeof tradeRuleSchema>;

export const listRuleSchema = z.discriminatedUnion("kind", [wishRuleSchema, tradeRuleSchema]);
export type ListRule = z.infer<typeof listRuleSchema>;

/**
 * The rule shape a list of the given kind carries (ADR-034 amendment 4). A
 * rule's shape follows the list's *kind*, not its intent: card/printing lists
 * take the demand shape (`wish`), copy lists the supply shape (`trade`). For
 * wish and trade lists the two are interchangeable — `chk_lists_intent_kind`
 * pins wish to card/printing and trade to copy — but organize lists span all
 * three kinds, so kind is the durable discriminator.
 * @returns The rule discriminant valid on a list of this kind.
 */
export function ruleKindForListKind(kind: "card" | "printing" | "copy"): ListRule["kind"] {
  return kind === "copy" ? "trade" : "wish";
}

/**
 * Whether a rule's filter carries a price bound (min or max). Such a rule needs
 * a price lookup (and its persisted `priceMarketplace`) at evaluation time;
 * callers use this to skip loading prices for rule sets that never read them.
 * The filter is read defensively — a rule persisted before the price dimension
 * existed may lack the key until `normalizeListRules` backfills it.
 * @returns True when the rule filters on price.
 */
export function ruleFiltersOnPrice(rule: ListRule): boolean {
  const price: FilterRange | undefined = rule.filter.price;
  return price !== undefined && (price.min !== null || price.max !== null);
}

/** Combine modes for card/printing lists: how overlapping rules reconcile a quantity. */
export const WISH_RULE_COMBINES = ["sum", "max"] as const;
/** Combine modes for copy lists: how overlapping rules reconcile keep-per-card. */
export const TRADE_RULE_COMBINES = ["protect", "count-sum", "count-max"] as const;

/**
 * How a list combines the output of several rules (ADR-034 amendment 2).
 * Card/printing quantities:
 * - `sum` (default): each matching rule adds its count; two reasons, two counts.
 * - `max`: the most demanding rule wins; overlapping rules never double-count.
 * Copy keep/offer splits:
 * - `protect` (default): a copy is emitted only when every rule matching it
 *   agreed to emit it — no rule's held-back copy ever reaches the list.
 * - `count-sum` / `count-max`: combine the rules' keep counts (sum or max)
 *   within each grouping (per-card rules per card, per-printing rules per
 *   printing), hold back the nicest that-many across the union of matched
 *   copies, emit the rest. A copy held back by either grouping stays held back.
 */
export const listRuleCombineSchema = z.enum([...WISH_RULE_COMBINES, ...TRADE_RULE_COMBINES]);
export type ListRuleCombine = z.infer<typeof listRuleCombineSchema>;
export type WishRuleCombine = (typeof WISH_RULE_COMBINES)[number];
export type TradeRuleCombine = (typeof TRADE_RULE_COMBINES)[number];

/**
 * The default combine mode per list kind: card/printing lists sum overlapping
 * rules, copy lists protect every rule's held-back copies. A persisted `null`
 * means this default, so lists created before the setting existed follow it too.
 * @returns The kind's default combine mode.
 */
export function defaultRuleCombine(kind: "card" | "printing" | "copy"): ListRuleCombine {
  return kind === "copy" ? "protect" : "sum";
}

/**
 * Whether a combine mode belongs to the given list kind (quantity modes on
 * card/printing lists, keep/offer modes on copy lists). Write-boundary
 * validation companion to {@link listRuleCombineSchema}.
 * @returns True when the mode is valid for the kind.
 */
export function ruleCombineMatchesKind(
  combine: ListRuleCombine,
  kind: "card" | "printing" | "copy",
): boolean {
  const allowed: readonly string[] = kind === "copy" ? TRADE_RULE_COMBINES : WISH_RULE_COMBINES;
  return allowed.includes(combine);
}

/**
 * The hard ceiling on rules per list. Every rule runs a full-catalog
 * `filterCards` pass at read time (including the uncached anonymous public-share
 * path), so the count is bounded to keep a single read's work proportionate.
 */
export const MAX_LIST_RULES = 10;

/**
 * A list's full set of dynamic rules (ADR-034). Every intent may carry several
 * (up to {@link MAX_LIST_RULES}); overlapping outputs combine per the list's
 * {@link ListRuleCombine} mode in `evaluateListRules`, then merge with manual
 * entries via `expandList`.
 */
export const listRulesSchema = z
  .array(listRuleSchema)
  .max(MAX_LIST_RULES, { message: `A list can carry at most ${MAX_LIST_RULES} dynamic rules` })
  // A price bound is a number in some marketplace's currency — without the
  // marketplace persisted alongside it, evaluation would have to guess (and
  // different viewers would guess differently). Reject at the write boundary.
  .superRefine((rules, ctx) => {
    rules.forEach((rule, index) => {
      if (ruleFiltersOnPrice(rule) && rule.priceMarketplace === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "A rule filtering on price must name its marketplace",
          path: [index, "priceMarketplace"],
        });
      }
    });
  });
export type ListRules = z.infer<typeof listRulesSchema>;

/**
 * Backfill a persisted rule filter against the blank set so a filter saved
 * before a newer dimension existed carries every key. Mirrors the same backfill
 * `filterCards` does on the eval path, so a re-hydrated rule is complete for
 * every consumer (matching, the rule editor, and the list-detail response)
 * regardless of when it was written. ADR-034.
 * @returns The filter with all dimensions present.
 */
function normalizeRuleFilter(filter: CardFilters): CardFilters {
  return { ...EMPTY_CARD_FILTERS, ...filter };
}

/**
 * Normalize every rule's filter against the blank set. See
 * {@link normalizeRuleFilter}.
 * @returns The rules with fully-populated filters.
 */
export function normalizeListRules(rules: ListRules): ListRules {
  return rules.map((rule) => ({ ...rule, filter: normalizeRuleFilter(rule.filter) }));
}

/**
 * Re-hydrate the persisted `rules` jsonb column into structured, normalized
 * {@link ListRules}. The column arrives already parsed — postgres.js returns
 * jsonb as its decoded value, and the `jsonb_typeof` CHECK on the column rules
 * out string scalars — so the only work left is the dimension backfill for
 * rules saved before a newer filter existed. Shape is enforced by
 * `listRulesSchema` at the write boundary. Single choke point for every read
 * path (list detail, matching, public share). ADR-034.
 * @returns The normalized rules (empty array when the column is empty).
 */
export function hydrateListRules(value: ListRules | null | undefined): ListRules {
  if (value === null || value === undefined) {
    return [];
  }
  return normalizeListRules(value);
}
