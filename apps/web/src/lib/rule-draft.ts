import type { ListKind } from "@openrift/shared/types/api/list";
import type { ListRule, RuleQuantity, TradeKeepPer } from "@openrift/shared/types/list-rule";
import { ruleKindForListKind } from "@openrift/shared/types/list-rule";
import type { Marketplace } from "@openrift/shared/types/pricing";
import type { CardFilters } from "@openrift/shared/types/search";
import { EMPTY_CARD_FILTERS } from "@openrift/shared/types/search";

export interface DraftRule {
  filter: CardFilters;
  priceMarketplace: Marketplace | null;
  quantity: RuleQuantity;
  keepPerCard: RuleQuantity;
  keepPer: TradeKeepPer;
  collectionIds: string[] | null;
  excludeIds: string[];
  excludeCopyIds: string[];
  netOwned: boolean;
  countSpecialVersions: boolean;
}

const DEFAULT_QUANTITY: RuleQuantity = { mode: "fixed", n: 1 };
const DEFAULT_KEEP: RuleQuantity = { mode: "fixed", n: 0 };

export function emptyDraft(languages: string[] = []): DraftRule {
  return {
    filter: languages.length > 0 ? { ...EMPTY_CARD_FILTERS, languages } : EMPTY_CARD_FILTERS,
    priceMarketplace: null,
    quantity: DEFAULT_QUANTITY,
    keepPerCard: DEFAULT_KEEP,
    keepPer: "card",
    collectionIds: null,
    excludeIds: [],
    excludeCopyIds: [],
    netOwned: false,
    countSpecialVersions: false,
  };
}

export function draftFromRule(rule: ListRule): DraftRule {
  if (rule.kind === "wish") {
    return {
      ...emptyDraft(),
      filter: rule.filter,
      priceMarketplace: rule.priceMarketplace ?? null,
      quantity: rule.quantity,
      excludeIds: rule.excludeIds,
      netOwned: rule.netOwned ?? false,
      countSpecialVersions: rule.countSpecialVersions ?? false,
    };
  }
  return {
    ...emptyDraft(),
    filter: rule.filter,
    priceMarketplace: rule.priceMarketplace ?? null,
    keepPerCard: rule.keepPerCard,
    keepPer: rule.keepPer ?? "card",
    collectionIds: rule.collectionIds,
    excludeCopyIds: rule.excludeCopyIds,
  };
}

/** Takes `rules` explicitly so a reactive caller stays trackable by the React Compiler. */
export function serializeRules(rules: DraftRule[], kind: ListKind): ListRule[] {
  return rules.map((rule): ListRule => {
    // A price marketplace is schema-valid only alongside a price bound.
    const priceBound = rule.filter.price.min !== null || rule.filter.price.max !== null;
    const priceMarketplace = priceBound ? (rule.priceMarketplace ?? undefined) : undefined;
    return ruleKindForListKind(kind) === "wish"
      ? {
          kind: "wish",
          filter: rule.filter,
          priceMarketplace,
          quantity: rule.quantity,
          excludeIds: rule.excludeIds,
          netOwned: rule.netOwned,
          countSpecialVersions: rule.countSpecialVersions,
        }
      : {
          kind: "trade",
          filter: rule.filter,
          priceMarketplace,
          collectionIds: rule.collectionIds,
          keepPerCard: rule.keepPerCard,
          keepPer: rule.keepPer,
          excludeCopyIds: rule.excludeCopyIds,
        };
  });
}
