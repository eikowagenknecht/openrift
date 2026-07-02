import { z } from "zod";

import type { CardFilters } from "./search.js";
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
 * Demand rule for wish lists (intent = wish, kind = card | printing). Matches
 * the catalog with `filter`, then wants `quantity` of every matched card or
 * printing except the manually excluded ids.
 */
export const wishRuleSchema = z.object({
  kind: z.literal("wish"),
  filter: cardFiltersSchema,
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
});
export type WishRule = z.infer<typeof wishRuleSchema>;

/**
 * Supply rule for trade lists (intent = trade, kind = copy). Selects the
 * owner's copies whose printing matches `filter`, keeps `keepPerCard` per card,
 * and offers the surplus for trade.
 */
export const tradeRuleSchema = z.object({
  kind: z.literal("trade"),
  filter: cardFiltersSchema,
  /** null = all owned collections; else restrict the source to these collection ids. */
  collectionIds: z.array(z.string()).nullable(),
  /** Keep N per card, trade the rest. `{ mode: "fixed", n: 0 }` = trade all. */
  keepPerCard: ruleQuantitySchema,
  /** copy_ids to never offer, even when surplus. */
  excludeCopyIds: z.array(z.string()),
});
export type TradeRule = z.infer<typeof tradeRuleSchema>;

export const listRuleSchema = z.discriminatedUnion("kind", [wishRuleSchema, tradeRuleSchema]);
export type ListRule = z.infer<typeof listRuleSchema>;

/**
 * The hard ceiling on rules per list. Every rule runs a full-catalog
 * `filterCards` pass at read time (including the uncached anonymous public-share
 * path), so the count is bounded to keep a single read's work proportionate.
 */
export const MAX_LIST_RULES = 10;

/**
 * A list's full set of dynamic rules (ADR-034). Wish lists may carry several (up
 * to {@link MAX_LIST_RULES}); trade lists are capped at one by the route layer
 * (the overlapping keep-per-card semantics are out of scope for v1). The rendered
 * list is the union of every rule's output, deduped by `expandList`.
 */
export const listRulesSchema = z
  .array(listRuleSchema)
  .max(MAX_LIST_RULES, { message: `A list can carry at most ${MAX_LIST_RULES} dynamic rules` });
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
 * {@link ListRules}. postgres.js under Bun returns jsonb as a raw string, so
 * accept either the parsed value or its JSON text. Shape is enforced by
 * `listRulesSchema` at the write boundary, so the parse is a bare `JSON.parse`
 * (no schema pass) followed by a dimension backfill. Single choke point for
 * every read path (list detail, matching, public share). ADR-034.
 * @returns The parsed, normalized rules (empty array when the column is empty).
 */
export function hydrateListRules(value: ListRules | string | null | undefined): ListRules {
  if (value === null || value === undefined) {
    return [];
  }
  const parsed = typeof value === "string" ? (JSON.parse(value) as ListRules) : value;
  return normalizeListRules(parsed);
}
