import type {
  CardType,
  CompletionScopePreference,
  Domain,
  Marketplace,
  Printing,
  PriceLookup,
  SetListEntry,
} from "@openrift/shared";
import { WellKnown, getPlaysetSize, imageUrl, isStandardPrinting } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { useCards } from "@/hooks/use-cards";
import { useCustomTagAssignments } from "@/hooks/use-custom-tag-assignments";
import { useEnumOrders } from "@/hooks/use-enums";
import { usePrices } from "@/hooks/use-prices";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { useStackedCopies } from "@/hooks/use-stacked-copies";
import { formatterForMarketplace } from "@/lib/format";
import type {
  DomainCombo,
  DomainCount,
  EnergyCostCount,
  PowerCount,
  RarityCount,
  TypeCount,
} from "@/lib/stat-types";
import { comboKey, sortCombos } from "@/lib/stat-types";
import { useDisplayStore } from "@/stores/display-store";

// ── Types ──────────────────────────────────────────────────────────────────

export type CompletionGroupBy = "set" | "domain" | "rarity" | "type";
export type CompletionCountMode = "cards" | "printings" | "copies";

export interface CompletionEntry {
  key: string;
  label: string;
  owned: number;
  total: number;
  percent: number;
  /** Only present for set grouping to separate main/supplemental. */
  setType?: "main" | "supplemental";
}

/** How many of the priciest printings the stats page can reveal. */
export const MAX_EXPENSIVE_PRINTINGS = 10;

export interface PricedCard {
  name: string;
  printingId: string;
  price: number;
  setSlug: string;
  cardSlug: string;
  thumbnail?: string;
  fullImage?: string;
}

export interface CollectionStats {
  totalCopies: number;
  uniqueCards: number;
  uniquePrintings: number;
  totalPrintingsInGame: number;
  estimatedValue: number;
  unpricedCount: number;
  completionPercent: number;
  totalCardsInGame: number;
  /** Priciest owned printings, descending, capped at {@link MAX_EXPENSIVE_PRINTINGS}. */
  mostExpensivePrintings: PricedCard[];
  domainDistribution: DomainCount[];
  rarityDistribution: RarityCount[];
  energyCurve: EnergyCostCount[];
  energyCurveStacks: DomainCombo[];
  averageEnergy: number | null;
  powerCurve: PowerCount[];
  powerCurveStacks: DomainCombo[];
  averagePower: number | null;
  typeBreakdown: TypeCount[];
  typeBreakdownDomains: Domain[];
  formatPrice: (value?: number | null) => string;
  marketplace: Marketplace;
}

// ── Target copies per card (for "copies" mode) ──────────────────────────────

/**
 * Max copies of a card allowed in a deck. Delegates to the canonical playset
 * rule in @openrift/shared (Legend/Battlefield = 1, [Unique] = 1, else 3) so
 * collection stats agree with the deck builder. Do not re-derive it here.
 * @returns The deck-relevant max copies, or 3 when the card is unknown.
 */
function copiesTarget(card?: { types: CardType[]; keywords: readonly string[] }): number {
  return card ? getPlaysetSize(card.types, card.keywords) : 3;
}

// Card types that have no playset to chase: runes are a shared basic supply
// rather than deck slots, and "other" is the catch-all for cards that never
// enter a deck. Counting them would charge every one a target of 3 and sink
// the completion percentage against a goal nobody is playing towards. The
// "other" slug isn't in WellKnown — it isn't a well-known reference row.
const PLAYSET_EXEMPT_TYPES = new Set<string>([WellKnown.cardType.RUNE, "other"]);

/**
 * Whether a card counts in "Playset" mode. A card with any exempt type is
 * left out whole, matching how one excluded value rejects a card in the
 * negation filters.
 * @returns True when the card should count towards playset totals.
 */
export function countsInPlaysetMode(card?: { types: CardType[] }): boolean {
  return !card?.types.some((type) => PLAYSET_EXEMPT_TYPES.has(type));
}

// ── Completion computation ─────────────────────────────────────────────────

interface CompletionInput {
  stacks: StackedEntry[];
  scopedPrintings: Printing[];
  scope: CompletionScopePreference;
  customTagAssignments?: CustomTagAssignments;
  sets: SetListEntry[];
  groupBy: CompletionGroupBy;
  countMode: CompletionCountMode;
  orders: {
    domains: readonly string[];
    rarities: readonly string[];
    cardTypes: readonly string[];
  };
  labels?: {
    domains: Record<string, string>;
    rarities: Record<string, string>;
    cardTypes: Record<string, string>;
  };
}

/**
 * Computes completion entries for a given grouping and count mode.
 * @returns Sorted completion entries.
 */
export function computeCompletion(input: CompletionInput): CompletionEntry[] {
  const { stacks, scopedPrintings, scope, sets, groupBy, countMode, orders, labels } = input;

  // Filter owned stacks to only those matching the scope
  const scopedStacks = filterStacksByScope(stacks, scope, input.customTagAssignments);

  // Determine key order and label function
  const { keyOrder, labelFn, extraFn } = getGroupConfig(groupBy, sets, orders, labels);

  // Build totals from scoped catalog
  const totalByKey = buildTotals(scopedPrintings, groupBy, countMode);

  // Build owned counts from scope-filtered stacks
  const ownedByKey = buildOwned(scopedStacks, groupBy, countMode);

  const entries = keyOrder
    .filter((key) => totalByKey.has(key))
    .map((key) => {
      const owned = ownedByKey.get(key) ?? 0;
      const total = totalByKey.get(key) ?? 0;
      return {
        key,
        label: labelFn(key),
        owned,
        total,
        percent: total > 0 ? (owned / total) * 100 : 0,
        ...extraFn?.(key),
      };
    });

  if (groupBy === "set") {
    return entries.toSorted((a, b) => {
      if (a.setType !== b.setType) {
        return a.setType === WellKnown.setType.MAIN ? -1 : 1;
      }
      return 0;
    });
  }

  return entries;
}

function getGroupConfig(
  groupBy: CompletionGroupBy,
  sets: SetListEntry[],
  orders: CompletionInput["orders"],
  labels: CompletionInput["labels"],
) {
  switch (groupBy) {
    case "set": {
      const setLabels = new Map(sets.map((set) => [set.id, set.name]));
      const setTypes = new Map(sets.map((set) => [set.id, set.setType]));
      return {
        keyOrder: sets.map((set) => set.id),
        labelFn: (key: string) => setLabels.get(key) ?? key,
        extraFn: (key: string) => ({ setType: setTypes.get(key) }) as Partial<CompletionEntry>,
      };
    }
    case "domain": {
      return {
        keyOrder: [...orders.domains],
        labelFn: (key: string) => labels?.domains[key] ?? key,
        extraFn: undefined,
      };
    }
    case "rarity": {
      return {
        keyOrder: [...orders.rarities],
        labelFn: (key: string) => labels?.rarities[key] ?? key,
        extraFn: undefined,
      };
    }
    case "type": {
      return {
        keyOrder: [...orders.cardTypes],
        labelFn: (key: string) => labels?.cardTypes[key] ?? key,
        extraFn: undefined,
      };
    }
  }
}

function getGroupKey(printing: Printing, groupBy: CompletionGroupBy): string[] {
  switch (groupBy) {
    case "set": {
      return [printing.setId];
    }
    case "domain": {
      return printing.card.domains;
    }
    case "rarity": {
      return [printing.rarity];
    }
    case "type": {
      // Multi-type cards count in every type group, like domains (ADR-037).
      return printing.card.types;
    }
  }
}

function buildTotals(
  scopedPrintings: Printing[],
  groupBy: CompletionGroupBy,
  countMode: CompletionCountMode,
): Map<string, number> {
  if (countMode === "printings") {
    const result = new Map<string, number>();
    for (const printing of scopedPrintings) {
      for (const key of getGroupKey(printing, groupBy)) {
        result.set(key, (result.get(key) ?? 0) + 1);
      }
    }
    return result;
  }

  // "cards" and "copies" modes: count unique cards, optionally multiplied by target
  const cardsByKey = new Map<string, Set<string>>();
  const cardInfo = new Map<string, { types: CardType[]; keywords: string[] }>(); // slug -> info
  for (const printing of scopedPrintings) {
    const slug = printing.card.slug;
    cardInfo.set(slug, { types: printing.card.types, keywords: printing.card.keywords });
    for (const key of getGroupKey(printing, groupBy)) {
      getOrCreate(cardsByKey, key).add(slug);
    }
  }

  if (countMode === "cards") {
    return mapSetSize(cardsByKey);
  }

  // copies mode: sum targets per unique card, skipping the playset-exempt ones
  const result = new Map<string, number>();
  for (const [key, slugs] of cardsByKey) {
    let total = 0;
    for (const slug of slugs) {
      const card = cardInfo.get(slug);
      if (!countsInPlaysetMode(card)) {
        continue;
      }
      total += copiesTarget(card);
    }
    if (total > 0) {
      result.set(key, total);
    }
  }
  return result;
}

function buildOwned(
  stacks: StackedEntry[],
  groupBy: CompletionGroupBy,
  countMode: CompletionCountMode,
): Map<string, number> {
  if (countMode === "printings") {
    const ownedByKey = new Map<string, Set<string>>();
    for (const stack of stacks) {
      for (const key of getGroupKey(stack.printing, groupBy)) {
        getOrCreate(ownedByKey, key).add(stack.printingId);
      }
    }
    return mapSetSize(ownedByKey);
  }

  // "cards" mode: unique card slugs
  if (countMode === "cards") {
    const ownedByKey = new Map<string, Set<string>>();
    for (const stack of stacks) {
      for (const key of getGroupKey(stack.printing, groupBy)) {
        getOrCreate(ownedByKey, key).add(stack.printing.card.slug);
      }
    }
    return mapSetSize(ownedByKey);
  }

  // "copies" mode: sum min(total copies of card, target) per group key
  // First, aggregate total copies per card slug per group key
  const copiesByKeyAndSlug = new Map<string, Map<string, number>>();
  for (const stack of stacks) {
    for (const key of getGroupKey(stack.printing, groupBy)) {
      const slugMap = getOrCreate2(copiesByKeyAndSlug, key);
      const slug = stack.printing.card.slug;
      slugMap.set(slug, (slugMap.get(slug) ?? 0) + stack.copyIds.length);
    }
  }

  const result = new Map<string, number>();
  for (const [key, slugMap] of copiesByKeyAndSlug) {
    let owned = 0;
    for (const [slug, copies] of slugMap) {
      const card = stackCard(stacks, slug);
      if (!countsInPlaysetMode(card)) {
        continue;
      }
      owned += Math.min(copies, copiesTarget(card));
    }
    result.set(key, owned);
  }
  return result;
}

function stackCard(
  stacks: StackedEntry[],
  slug: string,
): { types: CardType[]; keywords: string[] } | undefined {
  for (const stack of stacks) {
    if (stack.printing.card.slug === slug) {
      return { types: stack.printing.card.types, keywords: stack.printing.card.keywords };
    }
  }
  return undefined;
}

// ── Stats computation ──────────────────────────────────────────────────────

interface ComputeInput {
  stacks: StackedEntry[];
  totalCopies: number;
  sets: SetListEntry[];
  prices: PriceLookup;
  marketplace: Marketplace;
  orders: {
    domains: readonly string[];
    rarities: readonly string[];
    cardTypes: readonly string[];
  };
}

/**
 * Computes collection statistics from stacked copies and reference data.
 * Extracted as a pure function for testability.
 * @returns The full set of collection statistics.
 */
export function computeCollectionStats(input: ComputeInput): Omit<CollectionStats, "formatPrice"> {
  const { stacks, totalCopies, sets, prices, marketplace, orders } = input;

  // ── Hero stats ─────────────────────────────────────────────────────────

  const uniqueCardSlugs = new Set<string>();
  const uniquePrintingIds = new Set<string>();
  let estimatedValue = 0;
  let unpricedCount = 0;
  const pricedStacks: { stack: StackedEntry; price: number }[] = [];

  for (const stack of stacks) {
    uniqueCardSlugs.add(stack.printing.card.slug);
    uniquePrintingIds.add(stack.printingId);
    const price = prices.get(stack.printingId, marketplace);
    if (price === undefined) {
      unpricedCount += stack.copyIds.length;
    } else {
      estimatedValue += price * stack.copyIds.length;
      if (price > 0) {
        pricedStacks.push({ stack, price });
      }
    }
  }

  // Image URLs are only built for the handful of printings we actually show.
  const mostExpensivePrintings: PricedCard[] = pricedStacks
    .toSorted((a, b) => b.price - a.price)
    .slice(0, MAX_EXPENSIVE_PRINTINGS)
    .map(({ stack, price }) => {
      const firstImageId = stack.printing.images[0]?.imageId;
      return {
        name: stack.printing.card.name,
        printingId: stack.printingId,
        price,
        setSlug: stack.printing.setSlug,
        cardSlug: stack.printing.card.slug,
        thumbnail: firstImageId ? imageUrl(firstImageId, "400w") : undefined,
        fullImage: firstImageId ? imageUrl(firstImageId, "full") : undefined,
      };
    });

  const uniqueCards = uniqueCardSlugs.size;
  const uniquePrintings = uniquePrintingIds.size;
  const totalCardsInGame = sets.reduce((sum, set) => sum + set.cardCount, 0);
  const totalPrintingsInGame = sets.reduce((sum, set) => sum + set.printingCount, 0);
  const completionPercent = totalCardsInGame > 0 ? (uniqueCards / totalCardsInGame) * 100 : 0;

  // ── Domain distribution ────────────────────────────────────────────────

  const domainCounts = new Map<string, number>();
  for (const stack of stacks) {
    const quantity = stack.copyIds.length;
    for (const domain of stack.printing.card.domains) {
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + quantity);
    }
  }
  const domainDistribution: DomainCount[] = orders.domains
    .filter((domain) => domainCounts.has(domain))
    .map((domain) => ({ domain: domain as Domain, count: domainCounts.get(domain) ?? 0 }));

  // ── Rarity distribution ───────────────────────────────────────────────

  const rarityCounts = new Map<string, number>();
  for (const stack of stacks) {
    const rarity = stack.printing.rarity;
    rarityCounts.set(rarity, (rarityCounts.get(rarity) ?? 0) + stack.copyIds.length);
  }
  const rarityDistribution: RarityCount[] = orders.rarities
    .filter((rarity) => rarityCounts.has(rarity))
    .map((rarity) => ({ rarity, count: rarityCounts.get(rarity) ?? 0 }));

  // ── Energy curve ───────────────────────────────────────────────────────

  const energyByCombo = new Map<number, Map<string, number>>();
  const energyComboSet = new Set<string>();

  for (const stack of stacks) {
    const energy = stack.printing.card.energy;
    if (energy === null || energy === undefined) {
      continue;
    }
    const key = comboKey(stack.printing.card.domains, orders.domains);
    energyComboSet.add(key);
    let comboMap = energyByCombo.get(energy);
    if (!comboMap) {
      comboMap = new Map();
      energyByCombo.set(energy, comboMap);
    }
    comboMap.set(key, (comboMap.get(key) ?? 0) + stack.copyIds.length);
  }

  const energyCurveStacks = sortCombos(energyComboSet, orders.domains);
  const allEnergyValues = [...energyByCombo.keys()];
  const energyCurve: EnergyCostCount[] = [];
  if (allEnergyValues.length > 0) {
    const energyMin = Math.min(...allEnergyValues);
    const energyMax = Math.max(...allEnergyValues);
    for (let value = energyMin; value <= energyMax; value++) {
      const comboMap = energyByCombo.get(value);
      const entry: EnergyCostCount = { energy: String(value) };
      for (const combo of energyCurveStacks) {
        entry[combo.key] = comboMap?.get(combo.key) ?? 0;
      }
      energyCurve.push(entry);
    }
  }

  let energySum = 0;
  let energyCount = 0;
  for (const stack of stacks) {
    const energy = stack.printing.card.energy;
    if (energy !== null && energy !== undefined) {
      energySum += energy * stack.copyIds.length;
      energyCount += stack.copyIds.length;
    }
  }
  const averageEnergy = energyCount > 0 ? energySum / energyCount : null;

  // ── Power curve ────────────────────────────────────────────────────────

  const powerByCombo = new Map<number, Map<string, number>>();
  const powerComboSet = new Set<string>();

  for (const stack of stacks) {
    const power = stack.printing.card.power;
    if (power === null || power === undefined) {
      continue;
    }
    const key = comboKey(stack.printing.card.domains, orders.domains);
    powerComboSet.add(key);
    let comboMap = powerByCombo.get(power);
    if (!comboMap) {
      comboMap = new Map();
      powerByCombo.set(power, comboMap);
    }
    comboMap.set(key, (comboMap.get(key) ?? 0) + stack.copyIds.length);
  }

  const powerCurveStacks = sortCombos(powerComboSet, orders.domains);

  let powerSum = 0;
  let powerCount = 0;
  for (const stack of stacks) {
    const power = stack.printing.card.power;
    if (power !== null && power !== undefined) {
      powerSum += power * stack.copyIds.length;
      powerCount += stack.copyIds.length;
    }
  }
  const averagePower = powerCount > 0 ? powerSum / powerCount : null;

  const allPowerValues = [...powerByCombo.keys()];
  const powerCurve: PowerCount[] = [];
  if (allPowerValues.length > 0) {
    const powerMin = Math.min(...allPowerValues);
    const powerMax = Math.max(...allPowerValues);
    for (let value = powerMin; value <= powerMax; value++) {
      const comboMap = powerByCombo.get(value);
      const entry: PowerCount = { power: String(value) };
      for (const combo of powerCurveStacks) {
        entry[combo.key] = comboMap?.get(combo.key) ?? 0;
      }
      powerCurve.push(entry);
    }
  }

  // ── Type breakdown (chart) ─────────────────────────────────────────────

  const typeByDomain = new Map<string, Map<Domain, number>>();
  const typeTotal = new Map<string, number>();

  // Multi-type cards count under each of their types, like the domain
  // breakdown, so totals can exceed the collection size (ADR-037).
  for (const stack of stacks) {
    const quantity = stack.copyIds.length;
    for (const cardType of stack.printing.card.types) {
      let domainMap = typeByDomain.get(cardType);
      if (!domainMap) {
        domainMap = new Map();
        typeByDomain.set(cardType, domainMap);
      }
      for (const domain of stack.printing.card.domains) {
        domainMap.set(domain, (domainMap.get(domain) ?? 0) + quantity);
      }
      typeTotal.set(cardType, (typeTotal.get(cardType) ?? 0) + quantity);
    }
  }

  const typeDomainSet = new Set<Domain>();
  for (const domainMap of typeByDomain.values()) {
    for (const domain of domainMap.keys()) {
      typeDomainSet.add(domain);
    }
  }

  const typeBreakdownDomains = orders.domains.filter((domain) =>
    typeDomainSet.has(domain as Domain),
  ) as Domain[];

  const allTypes = new Set(typeByDomain.keys());
  const typeBreakdown: TypeCount[] = orders.cardTypes
    .filter((cardType) => allTypes.has(cardType))
    .map((cardType) => {
      const domainMap = typeByDomain.get(cardType);
      const entry: TypeCount = { type: cardType, total: typeTotal.get(cardType) ?? 0 };
      for (const domain of typeBreakdownDomains) {
        entry[domain] = domainMap?.get(domain) ?? 0;
      }
      return entry;
    });

  return {
    totalCopies,
    uniqueCards,
    uniquePrintings,
    totalPrintingsInGame,
    estimatedValue,
    unpricedCount,
    completionPercent,
    totalCardsInGame,
    mostExpensivePrintings,
    domainDistribution,
    rarityDistribution,
    energyCurve,
    energyCurveStacks,
    averageEnergy,
    powerCurve,
    powerCurveStacks,
    averagePower,
    typeBreakdown,
    typeBreakdownDomains,
    marketplace,
  };
}

/**
 * Hides preview sets (not yet released) from collection stats, unless the
 * user already owns cards from them. Keeps the set list and the printing
 * catalog consistent so owned/total counts always refer to the same pool.
 * @returns The sets and printings limited to released (or owned) sets.
 */
export function excludeUnreleasedSets(input: {
  sets: SetListEntry[];
  printings: Printing[];
  stacks: StackedEntry[];
}): { sets: SetListEntry[]; printings: Printing[] } {
  const ownedSetIds = new Set(input.stacks.map((stack) => stack.printing.setId));
  const visibleSets = input.sets.filter((set) => set.released || ownedSetIds.has(set.id));
  if (visibleSets.length === input.sets.length) {
    return { sets: input.sets, printings: input.printings };
  }
  const visibleSetIds = new Set(visibleSets.map((set) => set.id));
  return {
    sets: visibleSets,
    printings: input.printings.filter((printing) => visibleSetIds.has(printing.setId)),
  };
}

/**
 * Whether `scope` has any active filter dimension. When false, every printing
 * matches, so the filter functions return their input unchanged — preserving
 * the stable array reference that downstream memoization relies on.
 * @returns True if at least one scope dimension is set.
 */
// Every array-valued scope dimension, include and exclude alike. Listed once
// so `scopeHasFilters` can't fall behind `matchesScope` as dimensions are
// added — an axis missing here short-circuits filtering to "nothing is set"
// and silently returns the unfiltered input.
const SCOPE_ARRAY_KEYS = [
  "sets",
  "languages",
  "domains",
  "types",
  "rarities",
  "finishes",
  "artVariants",
  "keywords",
  "tags",
  "customTags",
  "cardSizes",
  "setsExclude",
  "languagesExclude",
  "domainsExclude",
  "typesExclude",
  "raritiesExclude",
  "finishesExclude",
  "artVariantsExclude",
  "keywordsExclude",
  "tagsExclude",
  "customTagsExclude",
] as const satisfies readonly (keyof CompletionScopePreference)[];

// The scalar dimensions: tri-state flags and presence states.
const SCOPE_SCALAR_KEYS = [
  "promos",
  "signed",
  "banned",
  "errata",
  "standard",
  "keywordsPresence",
  "tagsPresence",
  "customTagsPresence",
] as const satisfies readonly (keyof CompletionScopePreference)[];

function scopeHasFilters(scope: CompletionScopePreference): boolean {
  return (
    SCOPE_ARRAY_KEYS.some((key) => (scope[key] as string[] | undefined)?.length) ||
    SCOPE_SCALAR_KEYS.some((key) => scope[key] !== undefined)
  );
}

/**
 * Include filter for a single-valued axis (set, language, rarity, …).
 * @returns True when the axis is unset or holds the printing's value.
 */
function includesValue(allowed: string[] | undefined, value: string): boolean {
  return !allowed || allowed.length === 0 || allowed.includes(value);
}

/**
 * Include filter for a multi-valued axis (domains, types, keywords, …): any
 * overlap passes, matching `overlaps` in the shared card filters.
 * @returns True when the axis is unset or overlaps the card's values.
 */
function overlapsValues(allowed: string[] | undefined, values: readonly string[]): boolean {
  return !allowed || allowed.length === 0 || values.some((value) => allowed.includes(value));
}

/**
 * Negation for a single-valued axis (set, language, rarity, …).
 * @returns True when the printing's value is not excluded.
 */
function notExcluded(excluded: string[] | undefined, value: string): boolean {
  return !excluded || excluded.length === 0 || !excluded.includes(value);
}

/**
 * Negation for a multi-valued axis (domains, types): one excluded value on the
 * card rejects it, matching `noneExcluded` in the shared card filters.
 * @returns True when none of the card's values are excluded.
 */
function noneExcluded(excluded: string[] | undefined, values: readonly string[]): boolean {
  return !excluded || excluded.length === 0 || !values.some((value) => excluded.includes(value));
}

/**
 * Tri-state flag: unset passes, otherwise the printing must match.
 * @returns True when the flag is unset or agrees with the printing.
 */
function matchesFlag(filter: boolean | undefined, actual: boolean): boolean {
  return filter === undefined || filter === actual;
}

/**
 * Presence constraint: "any" needs at least one value, "none" needs zero.
 * @returns True when the constraint is unset or satisfied.
 */
function matchesPresence(state: "any" | "none" | undefined, has: boolean): boolean {
  return state === undefined || (state === "any" ? has : !has);
}

/**
 * Whether a printing passes every active scope filter. Unset dimensions are
 * skipped, so an empty scope matches everything.
 * @returns True when the printing matches the scope.
 */
export function matchesScope(
  printing: Printing,
  scope: CompletionScopePreference,
  customTagSlugs: readonly string[] = [],
): boolean {
  const { card } = printing;
  const markerPresence = scope.promos && (scope.promos === "only" ? "any" : "none");
  return (
    includesValue(scope.sets, printing.setSlug) &&
    includesValue(scope.languages, printing.language) &&
    includesValue(scope.rarities, printing.rarity) &&
    includesValue(scope.finishes, printing.finish) &&
    includesValue(scope.artVariants, printing.artVariant) &&
    includesValue(scope.cardSizes, printing.size) &&
    overlapsValues(scope.domains, card.domains) &&
    overlapsValues(scope.types, card.types) &&
    overlapsValues(scope.keywords, card.keywords) &&
    overlapsValues(scope.tags, card.tags) &&
    overlapsValues(scope.customTags, customTagSlugs) &&
    notExcluded(scope.setsExclude, printing.setSlug) &&
    notExcluded(scope.languagesExclude, printing.language) &&
    notExcluded(scope.raritiesExclude, printing.rarity) &&
    notExcluded(scope.finishesExclude, printing.finish) &&
    notExcluded(scope.artVariantsExclude, printing.artVariant) &&
    noneExcluded(scope.domainsExclude, card.domains) &&
    noneExcluded(scope.typesExclude, card.types) &&
    noneExcluded(scope.keywordsExclude, card.keywords) &&
    noneExcluded(scope.tagsExclude, card.tags) &&
    noneExcluded(scope.customTagsExclude, customTagSlugs) &&
    matchesFlag(scope.standard, isStandardPrinting(printing)) &&
    matchesFlag(scope.signed, printing.isSigned) &&
    matchesFlag(scope.banned, card.bans.length > 0) &&
    matchesFlag(scope.errata, card.errata !== null) &&
    matchesPresence(markerPresence, printing.markers.length > 0) &&
    matchesPresence(scope.keywordsPresence, card.keywords.length > 0) &&
    matchesPresence(scope.tagsPresence, card.tags.length > 0) &&
    matchesPresence(scope.customTagsPresence, customTagSlugs.length > 0)
  );
}

/**
 * Card id → custom-tag slugs, as the catalog serves it. Only read when the
 * scope constrains custom tags; every other axis lives on the printing.
 */
export type CustomTagAssignments = Record<string, readonly string[]>;

/**
 * Filters printings by scope criteria.
 * @returns Only the printings matching all active scope filters.
 */
export function filterByScope(
  printings: Printing[],
  scope: CompletionScopePreference,
  customTagAssignments?: CustomTagAssignments,
): Printing[] {
  if (!scopeHasFilters(scope)) {
    return printings;
  }
  return printings.filter((printing) =>
    matchesScope(printing, scope, customTagAssignments?.[printing.cardId]),
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function filterStacksByScope(
  stacks: StackedEntry[],
  scope: CompletionScopePreference,
  customTagAssignments?: CustomTagAssignments,
): StackedEntry[] {
  if (!scopeHasFilters(scope)) {
    return stacks;
  }
  return stacks.filter((stack) =>
    matchesScope(stack.printing, scope, customTagAssignments?.[stack.printing.cardId]),
  );
}

function getOrCreate<V>(map: Map<string, Set<V>>, key: string): Set<V> {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  return set;
}

function getOrCreate2(map: Map<string, Map<string, number>>, key: string): Map<string, number> {
  let inner = map.get(key);
  if (!inner) {
    inner = new Map();
    map.set(key, inner);
  }
  return inner;
}

function mapSetSize(map: Map<string, Set<string>>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [key, set] of map) {
    result.set(key, set.size);
  }
  return result;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface CollectionStatsResult extends CollectionStats {
  allPrintings: Printing[];
  stacks: StackedEntry[];
  sets: SetListEntry[];
  /** Passed back so the page's other scoped sections resolve custom tags the same way. */
  customTagAssignments: CustomTagAssignments;
  orders: { domains: readonly string[]; rarities: readonly string[]; cardTypes: readonly string[] };
  isReady: boolean;
}

/**
 * Computes collection statistics for a single collection or all collections.
 * @returns Full stats including hero metrics, completion breakdowns, and charts.
 */
/**
 * Collection statistics for a scope.
 *
 * `scope` narrows every figure to the printings matching the page's active
 * filters. Pass the same scope the rest of the page uses — the completion
 * section, the cost-to-complete chart, and the value-over-time chart are all
 * scoped, so leaving the hero stats unscoped made "Estimated Value" answer a
 * different question from the chart sitting next to it, with nothing on screen
 * saying so. Omit it for an unfiltered view.
 *
 * @returns Stats for the scoped subset, plus the data the page's other
 *          sections derive their own views from.
 */
export function useCollectionStats(
  collectionId?: string,
  scope?: CompletionScopePreference,
): CollectionStatsResult {
  const { stacks: allStacks, isReady } = useStackedCopies(collectionId);
  const { allPrintings } = useCards();
  const { data: setList } = useSuspenseQuery(publicSetListQueryOptions);
  const prices = usePrices();
  const { orders } = useEnumOrders();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "cardtrader";
  // Custom tags are assigned per card in the admin UI rather than derived from
  // the printing, so the scope's custom-tag axes need this lookup.
  const customTagAssignments = useCustomTagAssignments();

  const stacks = scope ? filterStacksByScope(allStacks, scope, customTagAssignments) : allStacks;
  // Recomputed rather than taken from useStackedCopies, which counts every
  // copy in the collection regardless of scope.
  const totalCopies = stacks.reduce((sum, stack) => sum + stack.copyIds.length, 0);

  const { sets, printings } = excludeUnreleasedSets({
    sets: setList.sets,
    printings: allPrintings,
    stacks,
  });

  const stats = computeCollectionStats({
    stacks,
    totalCopies,
    sets,
    prices,
    marketplace,
    orders,
  });

  return {
    ...stats,
    formatPrice: formatterForMarketplace(marketplace),
    allPrintings: printings,
    stacks,
    sets,
    orders,
    customTagAssignments,
    isReady,
  };
}
