import { z } from "zod";

import { marketplaceEnum } from "./pricing.js";
import type { CardFilters, FilterRange } from "./search.js";
import { cardFiltersSchema, EMPTY_CARD_FILTERS } from "./search.js";

// `playset` multiplies the card's playset size: 1 for legends/unique, 3 otherwise.
export const ruleQuantitySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("fixed"), n: z.number().int().min(0) }),
  z.object({ mode: z.literal("playset"), multiplier: z.number().int().min(1) }),
]);
export type RuleQuantity = z.infer<typeof ruleQuantitySchema>;

// The `wish` discriminant names the rule's shape, not the list's intent: an
// organize list also carries this shape.
export const wishRuleSchema = z.object({
  kind: z.literal("wish"),
  filter: cardFiltersSchema,
  priceMarketplace: marketplaceEnum.optional(),
  quantity: ruleQuantitySchema,
  excludeIds: z.array(z.string()),
  netOwned: z.boolean().optional(),
  countSpecialVersions: z.boolean().optional(),
});
export type WishRule = z.infer<typeof wishRuleSchema>;

export const tradeKeepPerSchema = z.enum(["card", "printing"]);
export type TradeKeepPer = z.infer<typeof tradeKeepPerSchema>;

// As with wishRuleSchema, the `trade` discriminant names the rule's shape,
// not the list's intent.
export const tradeRuleSchema = z.object({
  kind: z.literal("trade"),
  filter: cardFiltersSchema,
  priceMarketplace: marketplaceEnum.optional(),
  collectionIds: z.array(z.string()).nullable(),
  keepPerCard: ruleQuantitySchema,
  keepPer: tradeKeepPerSchema.optional(),
  excludeCopyIds: z.array(z.string()),
});
export type TradeRule = z.infer<typeof tradeRuleSchema>;

export const listRuleSchema = z.discriminatedUnion("kind", [wishRuleSchema, tradeRuleSchema]);
export type ListRule = z.infer<typeof listRuleSchema>;

export function ruleKindForListKind(kind: "card" | "printing" | "copy"): ListRule["kind"] {
  return kind === "copy" ? "trade" : "wish";
}

// A rule persisted before the price dimension existed may lack the key until
// normalizeListRules backfills it, so read it defensively.
export function ruleFiltersOnPrice(rule: ListRule): boolean {
  const price: FilterRange | undefined = rule.filter.price;
  return price !== undefined && (price.min !== null || price.max !== null);
}

export const WISH_RULE_COMBINES = ["sum", "max"] as const;
export const TRADE_RULE_COMBINES = ["protect", "count-sum", "count-max"] as const;

export const listRuleCombineSchema = z.enum([...WISH_RULE_COMBINES, ...TRADE_RULE_COMBINES]);
export type ListRuleCombine = z.infer<typeof listRuleCombineSchema>;
export type WishRuleCombine = (typeof WISH_RULE_COMBINES)[number];
export type TradeRuleCombine = (typeof TRADE_RULE_COMBINES)[number];

export function defaultRuleCombine(kind: "card" | "printing" | "copy"): ListRuleCombine {
  return kind === "copy" ? "protect" : "sum";
}

export function ruleCombineMatchesKind(
  combine: ListRuleCombine,
  kind: "card" | "printing" | "copy",
): boolean {
  const allowed: readonly string[] = kind === "copy" ? TRADE_RULE_COMBINES : WISH_RULE_COMBINES;
  return allowed.includes(combine);
}

export const MAX_LIST_RULES = 10;

export const listRulesSchema = z
  .array(listRuleSchema)
  .max(MAX_LIST_RULES, { message: `A list can carry at most ${MAX_LIST_RULES} dynamic rules` })
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

function normalizeRuleFilter(filter: CardFilters): CardFilters {
  return { ...EMPTY_CARD_FILTERS, ...filter };
}

export function normalizeListRules(rules: ListRules): ListRules {
  return rules.map((rule) => ({ ...rule, filter: normalizeRuleFilter(rule.filter) }));
}

// The jsonb column arrives already decoded by postgres.js, so no JSON.parse
// is needed here; only the dimension backfill for older persisted rules is.
export function hydrateListRules(value: ListRules | null | undefined): ListRules {
  if (value === null || value === undefined) {
    return [];
  }
  return normalizeListRules(value);
}
