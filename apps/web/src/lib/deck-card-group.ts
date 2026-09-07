import type { CardType } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { TYPE_GROUP_ORDER } from "@/lib/deck-card-sort";
import type { CardOwnership } from "@/lib/deck-ownership-types";
import { comboKey } from "@/lib/stat-types";

/** "none" renders the zone as one flat run with no sub-headers. */
export type DeckOverviewGroup = "type" | "energy" | "domain" | "ownership" | "none";

/** `label` is `null` for the single "none" group. */
export interface DeckCardGroup {
  key: string;
  label: string | null;
  cards: DeckBuilderCard[];
}

export interface DeckCardGroupContext {
  typeLabels: Record<string, string>;
  domainLabels: Record<string, string>;
  domainOrder: readonly string[];
  getEntry?: (card: DeckBuilderCard) => CardOwnership | undefined;
}

const OWNERSHIP_GROUPS = [
  { key: "owned", label: "Owned" },
  { key: "partial", label: "Missing copies" },
  { key: "missing", label: "Not owned" },
] as const;

/** Cards without an entry count as owned: ownership data covers every deck card when it is loaded at all. */
function ownershipBucket(
  entry: CardOwnership | undefined,
): (typeof OWNERSHIP_GROUPS)[number]["key"] {
  if (!entry || entry.shortfall <= 0) {
    return "owned";
  }
  return entry.owned > 0 ? "partial" : "missing";
}

/** Unit → Spell → Gear ladder first, anything else after in first-seen order. */
function orderedTypeKeys(grouped: Map<CardType, DeckBuilderCard[]>): CardType[] {
  return [
    ...TYPE_GROUP_ORDER.filter((type) => grouped.has(type)),
    ...[...grouped.keys()].filter((type) => !TYPE_GROUP_ORDER.includes(type)),
  ];
}

/**
 * The caller sorts inside each group (sortDeckOverviewList); this only
 * decides membership, header text, and group order. `dir` flips the group
 * order; membership never changes with direction.
 */
export function groupDeckCards(
  cards: DeckBuilderCard[],
  groupBy: DeckOverviewGroup,
  dir: "asc" | "desc",
  ctx: DeckCardGroupContext,
): DeckCardGroup[] {
  if (cards.length === 0) {
    return [];
  }
  const groups = buildGroups(cards, groupBy, ctx);
  return dir === "desc" ? groups.toReversed() : groups;
}

function buildGroups(
  cards: DeckBuilderCard[],
  groupBy: DeckOverviewGroup,
  ctx: DeckCardGroupContext,
): DeckCardGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: null, cards }];
  }

  if (groupBy === "type") {
    const grouped = Map.groupBy(cards, (card) => card.cardType);
    return orderedTypeKeys(grouped).map((type) => ({
      key: type,
      label: `${ctx.typeLabels[type] ?? type}s`,
      cards: grouped.get(type) ?? [],
    }));
  }

  if (groupBy === "energy") {
    // Costless cards (runes, battlefields parked in overflow) trail the
    // numeric buckets; they never masquerade as 0-cost plays.
    const grouped = Map.groupBy(cards, (card) => card.energy ?? null);
    const numeric = [...grouped.keys()]
      .filter((energy): energy is number => energy !== null)
      .toSorted((a, b) => a - b);
    const groups: DeckCardGroup[] = numeric.map((energy) => ({
      key: `energy-${energy}`,
      label: `${energy} energy`,
      cards: grouped.get(energy) ?? [],
    }));
    const costless = grouped.get(null);
    if (costless) {
      groups.push({ key: "energy-none", label: "No energy cost", cards: costless });
    }
    return groups;
  }

  if (groupBy === "domain") {
    const grouped = Map.groupBy(cards, (card) => comboKey(card.domains, ctx.domainOrder));
    // Same interleaving as the stats charts: combos sit at the average
    // position of their domains.
    const comboPosition = (key: string) => {
      if (key === "") {
        return Number.POSITIVE_INFINITY;
      }
      const domains = key.split("+");
      return (
        domains.reduce((sum, domain) => sum + ctx.domainOrder.indexOf(domain), 0) / domains.length
      );
    };
    const orderedKeys = [...grouped.keys()].toSorted((a, b) => {
      const posDiff = comboPosition(a) - comboPosition(b);
      if (posDiff !== 0 && !Number.isNaN(posDiff)) {
        return posDiff;
      }
      return a.split("+").length - b.split("+").length;
    });
    return orderedKeys.map((key) => ({
      key: key === "" ? "domain-none" : `domain-${key}`,
      label:
        key === ""
          ? "No domain"
          : key
              .split("+")
              .map((domain) => ctx.domainLabels[domain] ?? domain)
              .join(" / "),
      cards: grouped.get(key) ?? [],
    }));
  }

  const grouped = Map.groupBy(cards, (card) => ownershipBucket(ctx.getEntry?.(card)));
  return OWNERSHIP_GROUPS.filter((bucket) => grouped.has(bucket.key)).map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    cards: grouped.get(bucket.key) ?? [],
  }));
}
